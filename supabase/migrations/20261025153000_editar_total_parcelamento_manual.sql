-- Allow correcting the total of a manually registered card installment group.
-- Paid installments and their payment ledger are immutable; only untouched installments
-- are recalculated to reconcile the group to the requested total.
begin;

create or replace function public.editar_conta_pagar_parcelada(
  p_parcelamento_id uuid,
  p_valor_total numeric,
  p_operacao_id uuid
) returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  uid uuid := auth.uid();
  total_centavos bigint;
  bloqueado_centavos bigint := 0;
  restante_centavos bigint;
  ajustaveis integer := 0;
  base_centavos bigint;
  valor_parcela bigint;
  i integer := 0;
  parcela record;
begin
  if uid is null then raise exception 'Acesso não autorizado.'; end if;
  if p_parcelamento_id is null or p_operacao_id is null then
    raise exception 'Identificador do parcelamento e da operação são obrigatórios.';
  end if;
  if p_valor_total is null or p_valor_total <= 0 then
    raise exception 'O valor total precisa ser maior que zero.';
  end if;
  total_centavos := round(p_valor_total * 100)::bigint;
  if total_centavos <= 0 then raise exception 'O valor total precisa ser maior que zero.'; end if;

  -- Lock the group before calculating totals so concurrent edits cannot split the group.
  perform 1
  from public.contas_pagar cp
  where cp.user_id = uid and cp.parcelamento_id = p_parcelamento_id
  for update;
  if not found then raise exception 'Parcelamento não encontrado para este usuário.'; end if;

  if exists (
    select 1 from public.contas_pagar cp
    where cp.user_id = uid and cp.parcelamento_id = p_parcelamento_id
      and (cp.status = 'cancelado' or cp.cancelada_em is not null)
  ) then
    raise exception 'Este parcelamento possui parcela cancelada. Regularize o parcelamento antes de corrigir o total.';
  end if;

  select
    coalesce(sum(round(cp.valor * 100)::bigint) filter (
      where cp.valor_pago > 0 or exists (
        select 1 from public.contas_pagar_pagamentos cpp
        where cpp.user_id = uid and cpp.conta_id = cp.id
      )
    ), 0),
    count(*) filter (
      where cp.valor_pago = 0 and not exists (
        select 1 from public.contas_pagar_pagamentos cpp
        where cpp.user_id = uid and cpp.conta_id = cp.id
      )
    )::integer
  into bloqueado_centavos, ajustaveis
  from public.contas_pagar cp
  where cp.user_id = uid and cp.parcelamento_id = p_parcelamento_id;

  if total_centavos < bloqueado_centavos then
    raise exception 'O novo total não pode ser menor que o valor das parcelas com movimentação financeira (%). Estorne/corrija os pagamentos antes de reduzir tanto o total.', bloqueado_centavos::numeric / 100;
  end if;
  if ajustaveis = 0 then
    if total_centavos <> bloqueado_centavos then
      raise exception 'Todas as parcelas possuem movimentação financeira. Para alterar o total, primeiro estorne os pagamentos que precisam ser corrigidos.';
    end if;
    return true;
  end if;

  restante_centavos := total_centavos - bloqueado_centavos;
  if restante_centavos < ajustaveis then
    raise exception 'O total restante é insuficiente para manter pelo menos R$ 0,01 em cada parcela em aberto.';
  end if;

  base_centavos := restante_centavos / ajustaveis;
  for parcela in
    select cp.id
    from public.contas_pagar cp
    where cp.user_id = uid and cp.parcelamento_id = p_parcelamento_id
      and cp.valor_pago = 0
      and not exists (
        select 1 from public.contas_pagar_pagamentos cpp
        where cpp.user_id = uid and cpp.conta_id = cp.id
      )
    order by cp.parcelamento_numero, cp.data_vencimento, cp.id
  loop
    i := i + 1;
    valor_parcela := case when i = ajustaveis
      then restante_centavos - base_centavos * (ajustaveis - 1)
      else base_centavos end;

    update public.contas_pagar cp
    set valor = valor_parcela::numeric / 100,
        updated_at = now()
    where cp.id = parcela.id and cp.user_id = uid
      and cp.parcelamento_id = p_parcelamento_id;
  end loop;

  return true;
end;
$function$;

revoke all on function public.editar_conta_pagar_parcelada(uuid,numeric,uuid) from public, anon;
grant execute on function public.editar_conta_pagar_parcelada(uuid,numeric,uuid) to authenticated, service_role;
notify pgrst, 'reload schema';

commit;
