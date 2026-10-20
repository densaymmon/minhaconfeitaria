-- Concilia o estorno confirmado pelo usuário para a conta paga de 15/10/2026.
-- Mantém o pagamento original intacto e registra o estorno como evento imutável.
-- A migration falha se o estado da produção divergir do estado auditado.
DO $migration$
DECLARE
  v_user uuid := 'f9249c9b-6edd-4262-b7df-1b7f85636c52';
  v_conta uuid := '5073cba0-9a58-466b-9048-04fd041412a2';
  v_pagamento uuid := '6e7bc584-190d-44c3-a815-de92a2bbefe2';
  v_compra uuid := '590435ca-128e-4850-8095-7792f2e44127';
  v_operacao uuid := '9b2cb726-29c8-4b0b-84d0-9f6bb2d9a310';
  v_estorno uuid;
  v_hash text;
  v_valor numeric(12,2);
  v_pago numeric(12,2);
  v_status text;
  v_total_estornado numeric(12,2);
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext(v_conta::text));

  SELECT valor, valor_pago, status
    INTO v_valor, v_pago, v_status
  FROM public.contas_pagar
  WHERE id = v_conta AND user_id = v_user AND compra_id = v_compra
  FOR UPDATE;

  IF NOT FOUND THEN
    -- Em ambientes de teste/novas instalações a conta específica não existe; não há dados a corrigir.
    RETURN;
  END IF;

  SELECT COALESCE(SUM(valor), 0)
    INTO v_total_estornado
  FROM public.contas_pagar_estornos
  WHERE pagamento_id = v_pagamento AND conta_id = v_conta AND user_id = v_user;

  IF v_valor = 444.53 AND v_pago = 444.53 AND v_status = 'pago'
     AND v_total_estornado = 23.77 THEN
    -- Idempotência: a correção já foi aplicada integralmente.
    RETURN;
  END IF;

  IF v_valor <> 468.30 OR v_pago <> 468.30 OR v_status <> 'pago' THEN
    RAISE EXCEPTION 'Conciliação cancelada: a conta mudou desde a auditoria; nenhuma alteração aplicada.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.contas_pagar_pagamentos
    WHERE id = v_pagamento AND conta_id = v_conta
      AND user_id = v_user AND valor = 468.30
  ) THEN
    RAISE EXCEPTION 'Conciliação cancelada: pagamento original não corresponde ao registro auditado.';
  END IF;

  IF v_total_estornado <> 0 THEN
    RAISE EXCEPTION 'Conciliação cancelada: o pagamento já possui estorno; verifique para evitar duplicidade.';
  END IF;

  INSERT INTO public.contas_pagar_estornos
    (pagamento_id, conta_id, user_id, valor, motivo)
  VALUES
    (v_pagamento, v_conta, v_user, 23.77,
     'Estorno efetivamente recebido em relação ao pagamento original; valor líquido pago confirmado pelo usuário: R$ 444,53.')
  RETURNING id INTO v_estorno;

  -- A função recalcula o total líquido pago a partir do histórico original e do estorno.
  PERFORM public._recalcular_resumo_conta_pagar(v_conta, v_user);

  -- Corrige o valor da obrigação após o estorno confirmado, sem alterar/apagar o pagamento original.
  UPDATE public.contas_pagar
  SET valor = 444.53,
      valor_pago = 444.53,
      status = 'pago',
      observacoes = concat_ws(E'\\n', NULLIF(observacoes, ''),
        'Conciliação auditada em 2026-10-20: estorno de R$ 23,77; valor líquido pago e valor da conta corrigidos para R$ 444,53.'),
      updated_at = now()
  WHERE id = v_conta AND user_id = v_user;

  v_hash := encode(digest(convert_to(jsonb_build_object(
    'tipo', 'correcao_estorno_confirmado',
    'conta_id', v_conta,
    'pagamento_id', v_pagamento,
    'estorno_id', v_estorno,
    'valor_estorno', 23.77,
    'valor_conta_novo', 444.53
  )::text, 'UTF8'), 'sha256'), 'hex');

  INSERT INTO public.contas_pagar_operacoes
    (user_id, operacao_id, tipo_operacao, conta_id, payload_hash, resultado_id)
  VALUES
    (v_user, v_operacao, 'correcao_estorno_confirmado', v_conta, v_hash, v_estorno);

  INSERT INTO public.contas_pagar_auditoria
    (user_id, conta_id, operacao_id, evento, dados)
  VALUES
    (v_user, v_conta, v_operacao, 'correcao_valor_apos_estorno',
     jsonb_build_object(
       'antes', jsonb_build_object('valor', 468.30, 'valor_pago', 468.30, 'status', 'pago'),
       'depois', jsonb_build_object('valor', 444.53, 'valor_pago', 444.53, 'status', 'pago'),
       'pagamento_original_id', v_pagamento,
       'estorno_id', v_estorno,
       'valor_estornado', 23.77,
       'valor_liquido_pago', 444.53,
       'compra_id', v_compra,
       'motivo', 'Estorno efetivamente recebido e confirmado pelo usuário'
     ));
END
$migration$;

NOTIFY pgrst, 'reload schema';
