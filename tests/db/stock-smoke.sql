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

  PERFORM public.cancelar_compra(compra, 'cccccccc-cccc-4ccc-8ccc-cccccccccccc');
  PERFORM public.cancelar_compra(compra, 'cccccccc-cccc-4ccc-8ccc-cccccccccccc');
  SELECT s.saldo INTO saldo FROM public.saldo_estoque() s WHERE s.insumo_id = iid;
  IF saldo <> 0 THEN RAISE EXCEPTION 'Cancelamento não estornou a compra: %', saldo; END IF;

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
