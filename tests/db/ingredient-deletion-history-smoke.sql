\set ON_ERROR_STOP on
BEGIN;
INSERT INTO auth.users(id) VALUES ('acacacac-acac-4cac-8cac-acacacacacac');
SELECT set_config('request.jwt.claim.sub', 'acacacac-acac-4cac-8cac-acacacacacac', true);

DO $test$
DECLARE
  uid uuid := 'acacacac-acac-4cac-8cac-acacacacacac';
  sem_historico uuid;
  com_historico uuid;
  v_compra_id uuid;
BEGIN
  -- A truly unused ingredient can be removed permanently.
  INSERT INTO public.insumos(user_id, nome, unidade, preco_unidade)
  VALUES (uid, 'Insumo sem histórico - teste', 'g', 0.01)
  RETURNING id INTO sem_historico;

  PERFORM public.excluir_insumo_se_sem_receita(sem_historico);
  IF EXISTS (SELECT 1 FROM public.insumos WHERE id = sem_historico) THEN
    RAISE EXCEPTION 'Insumo sem histórico deveria ser excluído definitivamente.';
  END IF;

  -- A purchase creates an audit trail: removing the ingredient must only
  -- deactivate it, preserving the purchase and its line items.
  INSERT INTO public.insumos(user_id, nome, unidade, preco_unidade)
  VALUES (uid, 'Insumo com histórico - teste', 'g', 0.01)
  RETURNING id INTO com_historico;

  v_compra_id := public.salvar_compra(
    '{"data_compra":"2026-10-27"}'::jsonb,
    jsonb_build_array(jsonb_build_object(
      'insumo_id', com_historico,
      'quantidade', 100,
      'unidade', 'g',
      'preco_unitario', 0.01
    )),
    NULL,
    'acacacac-acac-4cac-8cac-acacacacac01'
  );

  PERFORM public.excluir_insumo_se_sem_receita(com_historico);

  IF NOT EXISTS (
    SELECT 1 FROM public.insumos WHERE id = com_historico AND ativo = false
  ) THEN
    RAISE EXCEPTION 'Insumo com histórico deveria ser inativado, não removido.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.compras WHERE id = v_compra_id)
     OR NOT EXISTS (
       SELECT 1 FROM public.compra_itens ci
       WHERE ci.compra_id = v_compra_id AND ci.insumo_id = com_historico
     ) THEN
    RAISE EXCEPTION 'A exclusão do insumo apagou ou perdeu o histórico da compra.';
  END IF;
END
$test$;
ROLLBACK;
