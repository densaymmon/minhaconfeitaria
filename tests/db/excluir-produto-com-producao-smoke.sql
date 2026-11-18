\set ON_ERROR_STOP on
-- Excluir produto já produzido em pedidos (migração 0055): o item antigo fica sem o vínculo, mas
-- mantém nome, quantidades e custo; as outras travas de item com produção continuam valendo.
BEGIN;

UPDATE public.plataforma_config SET cadastro_aberto = true, aprovacao_manual = false;
INSERT INTO auth.users(id) VALUES ('a1111111-1111-4111-8111-111111111111');
SELECT set_config('request.jwt.claim.sub', 'a1111111-1111-4111-8111-111111111111', true);

DO $t$
DECLARE
  pid uuid; pid2 uuid; ped uuid; item uuid; item2 uuid;
  r record;
  ok boolean;
  payload jsonb := jsonb_build_object(
    'cliente_id', NULL, 'data_entrega', current_date, 'hora_entrega', NULL, 'status', 'recebido',
    'forma_pagamento', 'pix', 'valor_entrada', 0, 'saldo_quitado', false,
    'desconto', 0, 'taxa_entrega', 0, 'observacoes', NULL);
BEGIN
  INSERT INTO public.produtos(nome, rendimento, preco_venda) VALUES ('Bolo antigo', 1, 40) RETURNING id INTO pid;
  INSERT INTO public.produtos(nome, rendimento, preco_venda) VALUES ('Bolo atual', 1, 50) RETURNING id INTO pid2;
  ped := public.salvar_pedido(payload, jsonb_build_array(
    jsonb_build_object('produto_id', pid, 'descricao', 'Bolo antigo', 'quantidade', 2, 'preco_unitario', 40, 'custo_unitario', 12.5),
    jsonb_build_object('produto_id', pid2, 'descricao', 'Bolo atual', 'quantidade', 1, 'preco_unitario', 50, 'custo_unitario', 10)));
  SELECT id INTO item FROM public.pedido_itens WHERE pedido_id = ped AND produto_id = pid;
  SELECT id INTO item2 FROM public.pedido_itens WHERE pedido_id = ped AND produto_id = pid2;
  PERFORM public.ajustar_producao('eeeeeeee-eeee-4eee-8eee-eeeeeeeeee01', item, 2);
  PERFORM public.ajustar_producao('eeeeeeee-eeee-4eee-8eee-eeeeeeeeee02', item2, 1);

  -- Trocar o produto de um item produzido (com o produto ainda existindo) continua bloqueado.
  ok := false;
  BEGIN
    UPDATE public.pedido_itens SET produto_id = NULL WHERE id = item2;
  EXCEPTION WHEN raise_exception THEN ok := SQLERRM LIKE 'Este item já tem produção registrada%';
  END;
  IF NOT ok THEN RAISE EXCEPTION 'TESTE_FALHOU: desvincular item produzido sem excluir o produto foi aceito.'; END IF;

  -- Excluir o produto: funciona, e o item antigo fica intacto, só sem o vínculo.
  DELETE FROM public.produtos WHERE id = pid;
  SELECT * INTO r FROM public.pedido_itens WHERE id = item;
  IF r.produto_id IS NOT NULL OR r.descricao <> 'Bolo antigo' OR r.quantidade <> 2 OR r.quantidade_produzida <> 2
     OR r.preco_unitario <> 40 OR r.custo_unitario <> 12.5 THEN
    RAISE EXCEPTION 'TESTE_FALHOU: item antigo mudou ao excluir o produto: %', row_to_json(r);
  END IF;

  -- As outras travas seguem: editar quantidade ou excluir item produzido.
  ok := false;
  BEGIN
    UPDATE public.pedido_itens SET quantidade = 5 WHERE id = item;
  EXCEPTION WHEN raise_exception THEN ok := true;
  END;
  IF NOT ok THEN RAISE EXCEPTION 'TESTE_FALHOU: editou a quantidade de item produzido.'; END IF;
  ok := false;
  BEGIN
    DELETE FROM public.pedido_itens WHERE id = item2;
  EXCEPTION WHEN raise_exception THEN ok := true;
  END;
  IF NOT ok THEN RAISE EXCEPTION 'TESTE_FALHOU: excluiu item produzido.'; END IF;
END $t$;

ROLLBACK;
