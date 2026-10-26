-- Allow correcting the total of a manually registered card installment group.
-- Paid installments and their payment ledger are immutable; only untouched installments
-- are recalculated to reconcile the group to the requested total.
ALTER TABLE public.contas_pagar
  ADD COLUMN IF NOT EXISTS parcelamento_id uuid,
  ADD COLUMN IF NOT EXISTS parcelamento_numero smallint,
  ADD COLUMN IF NOT EXISTS parcelamento_total smallint;

CREATE UNIQUE INDEX IF NOT EXISTS contas_pagar_parcelamento_numero_unico
  ON public.contas_pagar (user_id, parcelamento_id, parcelamento_numero)
  WHERE parcelamento_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.editar_conta_pagar_parcelada(
  p_parcelamento_id uuid,
  p_valor_total numeric,
  p_operacao_id uuid
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  uid uuid := auth.uid();
  total_centavos bigint;
  bloqueado_centavos bigint := 0;
  restante_centavos bigint;
  ajustaveis integer := 0;
  base_centavos bigint;
  valor_parcela bigint;
  i integer := 0;
  parcela record;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Acesso não autorizado.'; END IF;
  IF p_parcelamento_id IS NULL OR p_operacao_id IS NULL THEN
    RAISE EXCEPTION 'Identificador do parcelamento e da operação são obrigatórios.';
  END IF;
  IF p_valor_total IS NULL OR p_valor_total <= 0 THEN
    RAISE EXCEPTION 'O valor total precisa ser maior que zero.';
  END IF;
  total_centavos := round(p_valor_total * 100)::bigint;
  IF total_centavos <= 0 THEN RAISE EXCEPTION 'O valor total precisa ser maior que zero.'; END IF;

  PERFORM 1 FROM public.contas_pagar cp
  WHERE cp.user_id = uid AND cp.parcelamento_id = p_parcelamento_id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Parcelamento não encontrado para este usuário.'; END IF;

  IF EXISTS (
    SELECT 1 FROM public.contas_pagar cp
    WHERE cp.user_id = uid AND cp.parcelamento_id = p_parcelamento_id
      AND (cp.status = 'cancelado' OR cp.cancelada_em IS NOT NULL)
  ) THEN
    RAISE EXCEPTION 'Este parcelamento possui parcela cancelada. Regularize o parcelamento antes de corrigir o total.';
  END IF;

  SELECT
    COALESCE(sum(round(cp.valor * 100)::bigint) FILTER (
      WHERE cp.valor_pago > 0 OR EXISTS (
        SELECT 1 FROM public.contas_pagar_pagamentos cpp
        WHERE cpp.user_id = uid AND cpp.conta_id = cp.id
      )
    ), 0),
    count(*) FILTER (
      WHERE cp.valor_pago = 0 AND NOT EXISTS (
        SELECT 1 FROM public.contas_pagar_pagamentos cpp
        WHERE cpp.user_id = uid AND cpp.conta_id = cp.id
      )
    )::integer
  INTO bloqueado_centavos, ajustaveis
  FROM public.contas_pagar cp
  WHERE cp.user_id = uid AND cp.parcelamento_id = p_parcelamento_id;

  IF total_centavos < bloqueado_centavos THEN
    RAISE EXCEPTION 'O novo total não pode ser menor que o valor das parcelas com movimentação financeira (%). Estorne/corrija os pagamentos antes de reduzir tanto.', bloqueado_centavos::numeric / 100;
  END IF;
  IF ajustaveis = 0 THEN
    IF total_centavos <> bloqueado_centavos THEN
      RAISE EXCEPTION 'Todas as parcelas possuem movimentação financeira. Para alterar o total, primeiro estorne os pagamentos que precisam ser corrigidos.';
    END IF;
    RETURN true;
  END IF;

  restante_centavos := total_centavos - bloqueado_centavos;
  IF restante_centavos < ajustaveis THEN
    RAISE EXCEPTION 'O total restante é insuficiente para manter pelo menos R$ 0,01 em cada parcela em aberto.';
  END IF;
  base_centavos := restante_centavos / ajustaveis;

  FOR parcela IN
    SELECT cp.id FROM public.contas_pagar cp
    WHERE cp.user_id = uid AND cp.parcelamento_id = p_parcelamento_id
      AND cp.valor_pago = 0
      AND NOT EXISTS (
        SELECT 1 FROM public.contas_pagar_pagamentos cpp
        WHERE cpp.user_id = uid AND cpp.conta_id = cp.id
      )
    ORDER BY cp.parcelamento_numero, cp.data_vencimento, cp.id
  LOOP
    i := i + 1;
    valor_parcela := CASE WHEN i = ajustaveis
      THEN restante_centavos - base_centavos * (ajustaveis - 1)
      ELSE base_centavos END;
    UPDATE public.contas_pagar cp
    SET valor = valor_parcela::numeric / 100, updated_at = now()
    WHERE cp.id = parcela.id AND cp.user_id = uid
      AND cp.parcelamento_id = p_parcelamento_id;
  END LOOP;
  RETURN true;
END;
$function$;

REVOKE ALL ON FUNCTION public.editar_conta_pagar_parcelada(uuid,numeric,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.editar_conta_pagar_parcelada(uuid,numeric,uuid) TO authenticated, service_role;
