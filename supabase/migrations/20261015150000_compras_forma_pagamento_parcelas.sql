-- Forma de pagamento e geração de parcelas no Contas a pagar para compras de insumos.
begin;

alter table public.compras
  add column if not exists forma_pagamento_compra text not null default 'pix'
    check (forma_pagamento_compra in ('credito','debito','pix','dinheiro')),
  add column if not exists numero_parcelas smallint not null default 1
    check (numero_parcelas between 1 and 24),
  add column if not exists primeiro_vencimento date;

alter table public.compras
  alter column primeiro_vencimento set default current_date;

-- Identifica somente contas geradas automaticamente a partir de uma compra.
alter table public.contas_pagar
  add column if not exists compra_parcela_numero smallint,
  add column if not exists compra_parcelas_total smallint,
  add column if not exists gerada_automaticamente boolean not null default false;

create unique index if not exists contas_pagar_compra_parcela_unica
  on public.contas_pagar (user_id, compra_id, compra_parcela_numero)
  where gerada_automaticamente = true and compra_id is not null;

create or replace function public.registrar_pagamento_compra(
  p_compra_id uuid,
  p_forma_pagamento text,
  p_numero_parcelas integer default 1,
  p_primeiro_vencimento date default current_date
) returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  uid uuid := auth.uid();
  compra public.compras;
  n integer;
  total_centavos bigint;
  base_centavos bigint;
  parcela_centavos bigint;
  i integer;
  vencimento date;
  descricao_compra text;
begin
  if uid is null then raise exception 'Acesso não autorizado.'; end if;
  if p_forma_pagamento not in ('credito','debito','pix','dinheiro') then
    raise exception 'Selecione uma forma de pagamento válida.';
  end if;
  if p_forma_pagamento = 'credito' then
    if p_numero_parcelas is null or p_numero_parcelas not between 1 and 24 then
      raise exception 'Selecione de 1 a 24 parcelas.';
    end if;
    if p_primeiro_vencimento is null then
      raise exception 'Informe o vencimento da primeira parcela.';
    end if;
  else
    p_numero_parcelas := 1;
    p_primeiro_vencimento := current_date;
  end if;

  select * into compra
  from public.compras c
  where c.id = p_compra_id and c.user_id = uid
  for update;
  if compra.id is null then raise exception 'Compra não encontrada.'; end if;

  -- Se parcelas já tiveram pagamentos registrados, não as recrie nem apague o histórico.
  if exists (
    select 1
    from public.contas_pagar cp
    join public.contas_pagar_pagamentos cpp
      on cpp.conta_id = cp.id and cpp.user_id = uid
    where cp.user_id = uid and cp.compra_id = p_compra_id
      and cp.gerada_automaticamente = true
  ) then
    raise exception 'Esta compra já tem parcela com pagamento registrado. Para proteger o extrato, não é possível recriar suas parcelas automaticamente.';
  end if;

  delete from public.contas_pagar cp
  where cp.user_id = uid and cp.compra_id = p_compra_id
    and cp.gerada_automaticamente = true;

  update public.compras
  set forma_pagamento_compra = p_forma_pagamento,
      numero_parcelas = case when p_forma_pagamento = 'credito' then p_numero_parcelas else 1 end,
      primeiro_vencimento = case when p_forma_pagamento = 'credito' then p_primeiro_vencimento else data_compra end
  where id = p_compra_id and user_id = uid;

  if p_forma_pagamento <> 'credito' then
    return true;
  end if;

  total_centavos := round(coalesce(compra.total, 0) * 100)::bigint;
  if total_centavos <= 0 then
    select round(coalesce(sum(ci.total), 0) * 100)::bigint into total_centavos
    from public.compra_itens ci
    where ci.user_id = uid and ci.compra_id = p_compra_id;
  end if;
  if total_centavos <= 0 then
    raise exception 'O total da compra precisa ser maior que zero para gerar parcelas.';
  end if;

  n := p_numero_parcelas;
  base_centavos := total_centavos / n;
  descricao_compra := 'Compra de insumos' ||
    case when nullif(trim(compra.local_compra), '') is not null
      then ' - ' || trim(compra.local_compra) else '' end;

  for i in 1..n loop
    parcela_centavos := case when i = n
      then total_centavos - (base_centavos * (n - 1))
      else base_centavos end;
    vencimento := (p_primeiro_vencimento + ((i - 1) * interval '1 month'))::date;

    insert into public.contas_pagar (
      user_id, compra_id, descricao, fornecedor, data_emissao, data_vencimento,
      valor, valor_pago, forma_pagamento, status, observacoes,
      compra_parcela_numero, compra_parcelas_total, gerada_automaticamente
    ) values (
      uid, p_compra_id, descricao_compra || ' - parcela ' || i || '/' || n,
      compra.local_compra, compra.data_compra, vencimento,
      parcela_centavos::numeric / 100, 0, 'Cartão de crédito', 'pendente',
      '[COMPRA_PARCELA] Gerada automaticamente a partir do registro de compra.',
      i, n, true
    );
  end loop;

  return true;
end;
$function$;

revoke all on function public.registrar_pagamento_compra(uuid,text,integer,date) from public, anon;
grant execute on function public.registrar_pagamento_compra(uuid,text,integer,date) to authenticated, service_role;

commit;
