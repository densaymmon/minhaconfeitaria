\set ON_ERROR_STOP on
BEGIN;

INSERT INTO auth.users(id) VALUES ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
SELECT set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', true);

DO $test$
DECLARE
  uid uuid := 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  iid uuid;
  pid uuid;
  pedido uuid;
  item_id uuid;
  compra uuid;
  saldo numeric;
  produzida numeric;
BEGIN
  INSERT INTO public.insumos(
    user_id, nome, unidade, preco_unidade, preco_embalagem,
    quantidade_embalagem, unidade_embalagem
  ) VALUES (uid, 'Insumo teste farinha', 'g', 0.01, 10, 1000, 'g')
  RETURNING id INTO iid;

  compra := public.salvar_compra(
    '{"data_compra":"2026-10-14"}'::jsonb,
    jsonb_build_array(jsonb_build_object(
      'insumo_id', iid, 'quantidade', 100, 'unidade', 'g', 'preco_unitario', 0.01
    )),
    NULL,
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
  );

  SELECT s.saldo INTO saldo FROM public.saldo_estoque() s WHERE s.insumo_id = iid;
  IF saldo <> 100 THEN RAISE EXCEPTION 'Compra não refletida no estoque: %', saldo; END IF;

  -- Replaying the same purchase event must return the original purchase and not
  -- append another entry movement.
  IF public.salvar_compra(
    '{"data_compra":"2026-10-14"}'::jsonb,
    jsonb_build_array(jsonb_build_object(
      'insumo_id', iid, 'quantidade', 100, 'unidade', 'g', 'preco_unitario', 0.01
    )),
    NULL,
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
  ) <> compra THEN
    RAISE EXCEPTION 'Retry idempotente da compra não retornou a compra original.';
  END IF;
  SELECT s.saldo INTO saldo FROM public.saldo_estoque() s WHERE s.insumo_id = iid;
  IF saldo <> 100 THEN RAISE EXCEPTION 'Retry da compra duplicou o estoque: %', saldo; END IF;

  -- Editing a purchase must reverse the previous entry and append the new one;
  -- 0.15 kg must normalize to 150 g for this ingredient.
  compra := public.salvar_compra(
    '{"data_compra":"2026-10-14"}'::jsonb,
    jsonb_build_array(jsonb_build_object(
      'insumo_id', iid, 'quantidade', 0.15, 'unidade', 'kg', 'preco_unitario', 10
    )),
    compra,
    '14141414-1414-4414-8414-141414141414'
  );
  SELECT s.saldo INTO saldo FROM public.saldo_estoque() s WHERE s.insumo_id = iid;
  IF saldo <> 150 THEN RAISE EXCEPTION 'Edição/conversão da compra incorreta: %', saldo; END IF;

  PERFORM public.cancelar_compra(compra, 'cccccccc-cccc-4ccc-8ccc-cccccccccccc');
  PERFORM public.cancelar_compra(compra, 'cccccccc-cccc-4ccc-8ccc-cccccccccccc');
  SELECT s.saldo INTO saldo FROM public.saldo_estoque() s WHERE s.insumo_id = iid;
  IF saldo <> 0 THEN RAISE EXCEPTION 'Cancelamento não estornou a compra: %', saldo; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.compras WHERE id = compra AND cancelada_em IS NOT NULL)
     OR NOT EXISTS (SELECT 1 FROM public.compra_itens WHERE compra_id = compra) THEN
    RAISE EXCEPTION 'O cancelamento apagou o histórico da compra.';
  END IF;

  PERFORM public.registrar_inventario_fisico(
    jsonb_build_array(jsonb_build_object(
      'insumo_id', iid, 'quantidade_fisica', 250, 'unidade_base', 'g'
    )),
    'dddddddd-dddd-4ddd-8ddd-dddddddddddd'
  );
  SELECT s.saldo INTO saldo FROM public.saldo_estoque() s WHERE s.insumo_id = iid;
  IF saldo <> 250 THEN RAISE EXCEPTION 'Inventário físico não reconciliou saldo: %', saldo; END IF;
  PERFORM public.registrar_inventario_fisico(
    jsonb_build_array(jsonb_build_object(
      'insumo_id', iid, 'quantidade_fisica', 250, 'unidade_base', 'g'
    )),
    'dddddddd-dddd-4ddd-8ddd-dddddddddddd'
  );
  SELECT s.saldo INTO saldo FROM public.saldo_estoque() s WHERE s.insumo_id = iid;
  IF saldo <> 250 THEN RAISE EXCEPTION 'Retry do inventário duplicou o saldo: %', saldo; END IF;

  INSERT INTO public.produtos(user_id, nome, rendimento)
  VALUES (uid, 'Produto teste', 1)
  RETURNING id INTO pid;

  INSERT INTO public.receita_itens(
    user_id, produto_id, insumo_id, quantidade, quantidade_utilizada, unidade_receita
  ) VALUES (uid, pid, iid, 10, 10, 'g');

  INSERT INTO public.pedidos(user_id, data_entrega, status)
  VALUES (uid, current_date, 'em_producao')
  RETURNING id INTO pedido;

  INSERT INTO public.pedido_itens(
    user_id, pedido_id, produto_id, descricao, quantidade, preco_unitario, custo_unitario
  ) VALUES (uid, pedido, pid, 'Produto teste', 2, 10, 1)
  RETURNING id INTO item_id;

  PERFORM public.ajustar_producao(
    item_id, 2, 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'
  );
  SELECT s.saldo INTO saldo FROM public.saldo_estoque() s WHERE s.insumo_id = iid;
  IF saldo <> 230 THEN RAISE EXCEPTION 'Consumo da produção incorreto: %', saldo; END IF;

  PERFORM public.ajustar_producao(
    item_id, 1, 'ffffffff-ffff-4fff-8fff-ffffffffffff'
  );
  SELECT s.saldo INTO saldo FROM public.saldo_estoque() s WHERE s.insumo_id = iid;
  IF saldo <> 240 THEN RAISE EXCEPTION 'Estorno de redução da produção incorreto: %', saldo; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.producao_eventos
    WHERE pedido_item_id = item_id AND receita_snapshot IS NOT NULL
      AND pedido_id = pedido AND produto_id = pid
  ) THEN
    RAISE EXCEPTION 'Snapshot de produção não foi preservado.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.estoque_movimentos
    WHERE insumo_id = iid AND origem_tipo = 'producao'
      AND pedido_id = pedido AND produto_id = pid
  ) THEN
    RAISE EXCEPTION 'Movimento de estoque não preservou contexto do pedido.';
  END IF;

  BEGIN
    UPDATE public.pedido_itens SET descricao = 'Tentativa de edição' WHERE id = item_id;
    RAISE EXCEPTION 'A proteção deveria bloquear edição de item com produção.';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM = 'A proteção deveria bloquear edição de item com produção.' THEN
      RAISE;
    END IF;
    IF position('produção registrada' IN SQLERRM) = 0 THEN
      RAISE;
    END IF;
  END;

  -- The normal correction workflow may reduce production to zero, which appends
  -- a full stock reversal and then permits the order item to be edited.
  PERFORM public.ajustar_producao(
    item_id, 0, '13131313-1313-4313-8313-131313131313'
  );
  SELECT s.saldo INTO saldo FROM public.saldo_estoque() s WHERE s.insumo_id = iid;
  IF saldo <> 250 THEN RAISE EXCEPTION 'Estorno total da produção incorreto: %', saldo; END IF;

  -- Order save may replace rows after production reaches zero, but it must ignore
  -- any client-supplied produced quantity and create the replacement at zero.
  PERFORM public.salvar_pedido(
    jsonb_build_object(
      'cliente_id', NULL,
      'data_entrega', current_date,
      'hora_entrega', NULL,
      'status', 'em_producao',
      'forma_pagamento', 'pix',
      'valor_entrada', 0,
      'saldo_quitado', false,
      'desconto', 0,
      'taxa_entrega', 0,
      'observacoes', NULL
    ),
    jsonb_build_array(jsonb_build_object(
      'produto_id', pid,
      'descricao', 'Produto teste revisado',
      'quantidade', 2,
      'preco_unitario', 10,
      'custo_unitario', 1,
      'quantidade_produzida', 2
    )),
    pedido
  );
  SELECT pi.id, pi.quantidade_produzida
    INTO item_id, produzida
  FROM public.pedido_itens pi
  WHERE pi.pedido_id = pedido;
  IF produzida <> 0 THEN
    RAISE EXCEPTION 'Salvar pedido aceitou quantidade produzida enviada pelo cliente: %', produzida;
  END IF;

  PERFORM public.registrar_inventario_fisico(
    jsonb_build_array(jsonb_build_object(
      'insumo_id', iid, 'quantidade_fisica', 200, 'unidade_base', 'g'
    )),
    '12121212-1212-4212-8212-121212121212'
  );
  SELECT s.saldo INTO saldo FROM public.saldo_estoque() s WHERE s.insumo_id = iid;
  IF saldo <> 200 THEN RAISE EXCEPTION 'Segundo ajuste físico incorreto: %', saldo; END IF;
END
$test$;

ROLLBACK;
