\set ON_ERROR_STOP on
BEGIN;

INSERT INTO auth.users(id) VALUES ('abababab-abab-4bab-8bab-abababababab');
SELECT set_config('request.jwt.claim.sub', 'abababab-abab-4bab-8bab-abababababab', true);

DO $test$
DECLARE
  uid uuid := 'abababab-abab-4bab-8bab-abababababab';
  iid uuid;
  pid uuid;
  pedido uuid;
  item_id uuid;
  saldo numeric;
BEGIN
  INSERT INTO public.insumos(
    user_id, nome, unidade, preco_unidade, preco_embalagem,
    quantidade_embalagem, unidade_embalagem
  ) VALUES (uid, 'Ingrediente receita teste', 'g', 0.01, 10, 1000, 'g')
  RETURNING id INTO iid;

  INSERT INTO public.produtos(user_id, nome, rendimento)
  VALUES (uid, 'Bolo receita teste', 1)
  RETURNING id INTO pid;

  INSERT INTO public.receita_itens(
    user_id, produto_id, insumo_id, quantidade, quantidade_utilizada, unidade_receita
  ) VALUES (uid, pid, iid, 10, 10, 'g');

  INSERT INTO public.pedidos(user_id, data_entrega, status)
  VALUES (uid, current_date, 'recebido')
  RETURNING id INTO pedido;

  INSERT INTO public.pedido_itens(
    user_id, pedido_id, produto_id, descricao, quantidade, preco_unitario, custo_unitario
  ) VALUES (uid, pedido, pid, 'Bolo receita teste', 1, 10, 0.1)
  RETURNING id INTO item_id;

  -- An open order with no production history must not lock recipe or yield.
  UPDATE public.receita_itens SET quantidade_utilizada = 12
  WHERE produto_id = pid AND user_id = uid;
  UPDATE public.produtos SET rendimento = 2 WHERE id = pid;

  -- Once production is recorded, both recipe and yield are locked.
  PERFORM public.ajustar_producao(
    'abababab-abab-4bab-8bab-ababababab01', item_id, 0.5
  );

  BEGIN
    UPDATE public.receita_itens SET quantidade_utilizada = 14
    WHERE produto_id = pid AND user_id = uid;
    RAISE EXCEPTION 'A edição deveria ser bloqueada após registrar produção.';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM = 'A edição deveria ser bloqueada após registrar produção.' THEN RAISE; END IF;
    IF position('produção registrada em pedido aberto' IN SQLERRM) = 0
       AND position('pedido em aberto' IN SQLERRM) = 0 THEN RAISE; END IF;
  END;

  BEGIN
    UPDATE public.produtos SET rendimento = 3 WHERE id = pid;
    RAISE EXCEPTION 'O rendimento deveria ser bloqueado após registrar produção.';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM = 'O rendimento deveria ser bloqueado após registrar produção.' THEN RAISE; END IF;
    IF position('pedido em aberto' IN SQLERRM) = 0 THEN RAISE; END IF;
  END;

  -- Reversing production to zero must not erase the production audit history.
  PERFORM public.ajustar_producao(
    'abababab-abab-4bab-8bab-ababababab02', item_id, 0
  );
  -- Recipe remains locked while the order is open, because production happened.
  BEGIN
    UPDATE public.receita_itens SET quantidade_utilizada = 15
    WHERE produto_id = pid AND user_id = uid;
    RAISE EXCEPTION 'A edição deveria continuar bloqueada após estornar a produção.';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM = 'A edição deveria continuar bloqueada após estornar a produção.' THEN RAISE; END IF;
    IF position('pedido em aberto' IN SQLERRM) = 0 THEN RAISE; END IF;
  END;

  -- Closing the order unlocks maintenance; old production snapshots remain intact.
  UPDATE public.pedidos SET status = 'entregue' WHERE id = pedido;
  UPDATE public.receita_itens SET quantidade_utilizada = 16
  WHERE produto_id = pid AND user_id = uid;
  UPDATE public.produtos SET rendimento = 4 WHERE id = pid;

  IF NOT EXISTS (
    SELECT 1 FROM public.producao_eventos pe
    WHERE pe.pedido_item_id = item_id AND pe.receita_snapshot IS NOT NULL
      AND (pe.receita_snapshot->0->>'quantidade_utilizada')::numeric = 12
  ) THEN
    RAISE EXCEPTION 'O snapshot histórico da produção não foi preservado.';
  END IF;
END
$test$;

ROLLBACK;
