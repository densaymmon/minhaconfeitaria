-- Parcelamento de contas a pagar cadastradas manualmente no financeiro.
begin;

alter table public.contas_pagar
  add column if not exists parcelamento_id uuid,
  add column if not exists parcelamento_numero smallint,
  add column if not exists parcelamento_total smallint;

create unique index if not exists contas_pagar_parcelamento_numero_unico
  on public.contas_pagar (user_id, parcelamento_id, parcelamento_numero)
  where parcelamento_id is not null;

create or replace function public.registrar_conta_pagar_parcelada(
  p_dados jsonb,
  p_numero_parcelas integer,
  p_primeiro_vencimento date,
  p_operacao_id uuid
) returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $function$
declare
  uid uuid := auth.uid();
  n integer := p_numero_parcelas;
  total_centavos bigint;
  base_centavos bigint;
  parcela_centavos bigint;
  i integer;
  vencimento date;
  conta_descricao text;
  conta_fornecedor text;
  conta_emissao date;
  conta_compra uuid;
  conta_observacoes text;
begin
  if uid is null then raise exception 'Acesso não autorizado.'; end if;
  if p_operacao_id is null then raise exception 'Identificador da operação obrigatório.'; end if;
  if n is null or n not between 2 and 24 then
    raise exception 'O parcelamento deve ter de 2 a 24 parcelas.';
  end if;
  if p_primeiro_vencimento is null then
    raise exception 'Informe o vencimento da primeira parcela.';
  end if;

  -- Uma repetição da mesma solicitação retorna sucesso sem duplicar parcelas.
  if exists (select 1 from public.contas_pagar cp where cp.user_id = uid and cp.parcelamento_id = p_operacao_id) then
    if (select count(*) from public.contas_pagar cp where cp.user_id = uid and cp.parcelamento_id = p_operacao_id) = n then
      return true;
    end if;
    raise exception 'Esta operação de parcelamento já existe com uma quantidade diferente de parcelas.';
  end if;

  conta_descricao := nullif(trim(p_dados->>'descricao'), '');
  conta_fornecedor := nullif(trim(p_dados->>'fornecedor'), '');
  conta_emissao := nullif(p_dados->>'data_emissao', '')::date;
  conta_compra := nullif(p_dados->>'compra_id', '')::uuid;
  conta_observacoes := nullif(trim(p_dados->>'observacoes'), '');
  total_centavos := round((p_dados->>'valor')::numeric * 100)::bigint;

  if conta_descricao is null then raise exception 'Informe a descrição da conta.'; end if;
  if conta_emissao is null then raise exception 'Informe a data de emissão.'; end if;
  if total_centavos <= 0 then raise exception 'O valor total precisa ser maior que zero.'; end if;
  if conta_compra is not null and not exists (
    select 1 from public.compras c where c.id = conta_compra and c.user_id = uid
  ) then
    raise exception 'A compra vinculada não foi encontrada para este usuário.';
  end if;

  base_centavos := total_centavos / n;
  for i in 1..n loop
    parcela_centavos := case when i = n
      then total_centavos - (base_centavos * (n - 1))
      else base_centavos end;
    vencimento := (p_primeiro_vencimento + ((i - 1) * interval '1 month'))::date;

    insert into public.contas_pagar (
      user_id, compra_id, descricao, fornecedor, data_emissao, data_vencimento,
      valor, valor_pago, forma_pagamento, status, observacoes,
      parcelamento_id, parcelamento_numero, parcelamento_total
    ) values (
      uid, conta_compra, conta_descricao || ' - parcela ' || i || '/' || n,
      conta_fornecedor, conta_emissao, vencimento,
      parcela_centavos::numeric / 100, 0, 'Cartão de crédito', 'pendente',
      concat_ws(E'\n', conta_observacoes, '[PARCELAMENTO_CARTAO] Parcela gerada automaticamente.'),
      p_operacao_id, i, n
    );
  end loop;

  return true;
end;
$function$;

revoke all on function public.registrar_conta_pagar_parcelada(jsonb,integer,date,uuid) from public, anon;
grant execute on function public.registrar_conta_pagar_parcelada(jsonb,integer,date,uuid) to authenticated, service_role;

commit;
