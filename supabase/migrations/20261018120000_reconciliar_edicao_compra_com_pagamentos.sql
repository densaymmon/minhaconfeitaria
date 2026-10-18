-- Reconcile an edited purchase without deleting or rewriting payment ledger entries.
begin;

create or replace function public.reconciliar_compra_com_pagamentos(
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
  total_centavos bigint;
  pago_centavos bigint := 0;
  restante_centavos bigint;
  base_centavos bigint;
  valor_parcela bigint;
  n integer;
  i integer;
  vencimento date;
  forma_rotulo text;
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
    p_primeiro_vencimento := null;
  end if;

  select * into compra
  from public.compras c
  where c.id = p_compra_id and c.user_id = uid
  for update;
  if compra.id is null then raise exception 'Compra não encontrada.'; end if;

  if not exists (
    select 1
    from public.contas_pagar cp
    join public.contas_pagar_pagamentos cpp
      on cpp.conta_id = cp.id and cpp.user_id = uid
    where cp.user_id = uid and cp.compra_id = p_compra_id
      and cp.gerada_automaticamente = true
  ) then
    raise exception 'Não há pagamentos registrados para reconciliar. Atualize a compra novamente.';
  end if;

  -- valor_pago é o resumo líquido da conta; os registros individuais de pagamento
  -- nunca são excluídos nem atualizados por esta função.
  select coalesce(round(sum(cp.valor_pago) * 100)::bigint, 0)
    into pago_centavos
  from public.contas_pagar cp
  where cp.user_id = uid and cp.compra_id = p_compra_id
    and cp.gerada_automaticamente = true
    and exists (
      select 1 from public.contas_pagar_pagamentos cpp
      where cpp.conta_id = cp.id and cpp.user_id = uid
    );

  total_centavos := round(coalesce(compra.total, 0) * 100)::bigint;
  if total_centavos <= 0 then
    raise exception 'O total da compra precisa ser maior que zero.';
  end if;
  -- A edição pode corrigir o total para um valor inferior ao já pago.
  -- Mantemos o histórico de pagamentos imutável e não criamos saldo a pagar
  -- quando o valor pago é igual ou superior ao novo total.

  update public.compras
  set forma_pagamento_compra = p_forma_pagamento,
      numero_parcelas = case when p_forma_pagamento = 'credito' then p_numero_parcelas else 1 end,
      primeiro_vencimento = case when p_forma_pagamento = 'credito' then p_primeiro_vencimento else data_compra end
  where id = p_compra_id and user_id = uid;

  -- Contas que possuem pagamentos são preservadas como histórico. Ajusta-se o valor
  -- da conta ao montante líquido pago, para que o saldo restante seja reconciliado
  -- em novos lançamentos sem alterar o extrato de pagamentos.
  update public.contas_pagar cp
  set valor = greatest(coalesce(cp.valor_pago, 0), 0),
      status = 'pago',
      updated_at = now()
  where cp.user_id = uid and cp.compra_id = p_compra_id
    and cp.gerada_automaticamente = true
    and exists (
      select 1 from public.contas_pagar_pagamentos cpp
      where cpp.conta_id = cp.id and cpp.user_id = uid
    );

  -- Contas futuras ainda sem pagamentos podem ser recriadas com os novos termos.
  delete from public.contas_pagar cp
  where cp.user_id = uid and cp.compra_id = p_compra_id
    and cp.gerada_automaticamente = true
    and not exists (
      select 1 from public.contas_pagar_pagamentos cpp
      where cpp.conta_id = cp.id and cpp.user_id = uid
    );

  restante_centavos := total_centavos - pago_centavos;
  if restante_centavos <= 0 then return true; end if;

  forma_rotulo := case p_forma_pagamento
    when 'credito' then 'Cartão de crédito'
    when 'debito' then 'Cartão de débito'
    when 'pix' then 'Pix'
    else 'Dinheiro'
  end;
  descricao_compra := 'Saldo restante da compra' ||
    case when nullif(trim(compra.local_compra), '') is not null
      then ' - ' || trim(compra.local_compra) else '' end;

  n := case when p_forma_pagamento = 'credito' then p_numero_parcelas else 1 end;
  base_centavos := restante_centavos / n;
  for i in 1..n loop
    valor_parcela := case when i = n
      then restante_centavos - (base_centavos * (n - 1))
      else base_centavos end;
    vencimento := case
      when p_forma_pagamento = 'credito'
        then (p_primeiro_vencimento + ((i - 1) * interval '1 month'))::date
      else compra.data_compra
    end;

    insert into public.contas_pagar (
      user_id, compra_id, descricao, fornecedor, data_emissao, data_vencimento,
      valor, valor_pago, forma_pagamento, status, observacoes,
      compra_parcela_numero, compra_parcelas_total, gerada_automaticamente
    ) values (
      uid, p_compra_id,
      case when n > 1 then descricao_compra || ' - parcela ' || i || '/' || n else descricao_compra end,
      compra.local_compra, compra.data_compra, vencimento,
      valor_parcela::numeric / 100, 0, forma_rotulo, 'pendente',
      '[COMPRA_AJUSTE] Saldo criado ao editar compra com pagamentos anteriores; histórico de pagamentos preservado.',
      null, n, true
    );
  end loop;

  return true;
end;
$function$;

revoke all on function public.reconciliar_compra_com_pagamentos(uuid,text,integer,date) from public, anon;
grant execute on function public.reconciliar_compra_com_pagamentos(uuid,text,integer,date) to authenticated, service_role;

commit;
