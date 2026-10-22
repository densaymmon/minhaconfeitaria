-- Incremental deployment: excluir contas a pagar canceladas sem movimentação.
-- Execute somente após revisão e teste no banco descartável. Não altera compras vinculadas.
BEGIN;

CREATE TABLE IF NOT EXISTS public.contas_pagar_exclusoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  conta_id uuid NOT NULL,
  operacao_id uuid NOT NULL,
  snapshot jsonb NOT NULL,
  motivo text NOT NULL DEFAULT 'Conta cancelada sem pagamentos ou movimentações',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, operacao_id)
);

ALTER TABLE public.contas_pagar_exclusoes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS contas_pagar_exclusoes_select_owner ON public.contas_pagar_exclusoes;
CREATE POLICY contas_pagar_exclusoes_select_owner
  ON public.contas_pagar_exclusoes FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

REVOKE ALL ON public.contas_pagar_exclusoes FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON public.contas_pagar_exclusoes TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.excluir_conta_pagar_cancelada(
  p_conta_id uuid,
  p_operacao_id uuid
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, extensions
AS $fn$
DECLARE
  v_user uuid := auth.uid();
  v_conta public.contas_pagar%ROWTYPE;
  v_exclusao uuid;
  v_snapshot jsonb;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'Sessão autenticada obrigatória.'; END IF;
  IF p_conta_id IS NULL OR p_operacao_id IS NULL THEN
    RAISE EXCEPTION 'Conta e identificador da operação são obrigatórios.';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(v_user::text || ':' || p_operacao_id::text, 0));
  SELECT id INTO v_exclusao
    FROM public.contas_pagar_exclusoes
    WHERE user_id = v_user AND operacao_id = p_operacao_id;
  IF FOUND THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.contas_pagar_exclusoes
      WHERE id = v_exclusao AND conta_id = p_conta_id
    ) THEN
      RAISE EXCEPTION 'Conflito de idempotência: operação já usada para outra conta.';
    END IF;
    RETURN v_exclusao;
  END IF;

  SELECT * INTO v_conta
    FROM public.contas_pagar
    WHERE id = p_conta_id AND user_id = v_user
    FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Conta cancelada não encontrada.'; END IF;
  IF v_conta.status <> 'cancelado' OR v_conta.cancelada_em IS NULL THEN
    RAISE EXCEPTION 'Somente contas canceladas podem ser excluídas.';
  END IF;
  IF v_conta.valor_pago <> 0 THEN
    RAISE EXCEPTION 'A conta possui valor pago; não pode ser excluída.';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.contas_pagar_pagamentos
    WHERE conta_id = p_conta_id AND user_id = v_user
  ) OR EXISTS (
    SELECT 1 FROM public.contas_pagar_estornos
    WHERE conta_id = p_conta_id AND user_id = v_user
  ) THEN
    RAISE EXCEPTION 'A conta possui movimentação financeira. O registro precisa ser mantido.';
  END IF;

  SELECT jsonb_build_object(
    'conta', to_jsonb(v_conta),
    'auditoria', COALESCE((
      SELECT jsonb_agg(to_jsonb(a) ORDER BY a.created_at)
      FROM public.contas_pagar_auditoria a
      WHERE a.conta_id = p_conta_id AND a.user_id = v_user
    ), '[]'::jsonb),
    'operacoes', COALESCE((
      SELECT jsonb_agg(to_jsonb(o) ORDER BY o.created_at)
      FROM public.contas_pagar_operacoes o
      WHERE o.conta_id = p_conta_id AND o.user_id = v_user
    ), '[]'::jsonb)
  ) INTO v_snapshot;

  INSERT INTO public.contas_pagar_exclusoes(user_id, conta_id, operacao_id, snapshot)
  VALUES (v_user, p_conta_id, p_operacao_id, v_snapshot)
  RETURNING id INTO v_exclusao;

  DELETE FROM public.contas_pagar_auditoria
    WHERE conta_id = p_conta_id AND user_id = v_user;
  DELETE FROM public.contas_pagar_operacoes
    WHERE conta_id = p_conta_id AND user_id = v_user;
  DELETE FROM public.contas_pagar
    WHERE id = p_conta_id AND user_id = v_user;

  RETURN v_exclusao;
END
$fn$;

REVOKE ALL ON FUNCTION public.excluir_conta_pagar_cancelada(uuid,uuid) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.excluir_conta_pagar_cancelada(uuid,uuid) TO authenticated;

COMMIT;
