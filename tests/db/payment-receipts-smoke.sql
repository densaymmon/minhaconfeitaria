\set ON_ERROR_STOP on
BEGIN;
INSERT INTO auth.users(id) VALUES ('abababab-abab-4bab-8bab-abababababab');
SELECT set_config('request.jwt.claim.sub', 'abababab-abab-4bab-8bab-abababababab', true);

DO $test$
DECLARE
  uid uuid := 'abababab-abab-4bab-8bab-abababababab';
  produto uuid;
  pedido uuid;
  pedido_legado uuid;
  pedido_cancelado uuid;
  pagamento1 uuid;
  pagamento2 uuid;
  total_pago numeric;
  valor_entrada numeric;
  quitado boolean;
BEGIN
  INSERT INTO public.produtos(user_id, nome, rendimento, preco_venda)
  VALUES (uid, 'Produto pagamento teste', 1, 100)
  RETURNING id INTO produto;

  INSERT INTO public.pedidos(
    user_id, data_entrega, status, valor_entrada, saldo_quitado,
    desconto, taxa_entrega, forma_pagamento
  ) VALUES (uid, current_date, 'recebido', 0, false, 0, 0, 'pix')
  RETURNING id INTO pedido;

  INSERT INTO public.pedido_itens(
    user_id, pedido_id, produto_id, descricao, quantidade, preco_unitario, custo_unitario
  ) VALUES (uid, pedido, produto, 'Produto pagamento teste', 1, 100, 25);

  -- Duas parcelas devem ser refletidas uma única vez no histórico e no saldo legado.
  pagamento1 := public.registrar_recebimento_pedido(pedido, 30, current_date, 'pix', 'Primeira parcela');
  pagamento2 := public.registrar_recebimento_pedido(pedido, 20, current_date, 'dinheiro', 'Segunda parcela');
  SELECT COALESCE(SUM(valor), 0) INTO total_pago
  FROM public.pedido_pagamentos WHERE pedido_id = pedido AND user_id = uid;
  SELECT p.valor_entrada, p.saldo_quitado INTO valor_entrada, quitado
  FROM public.pedidos p WHERE p.id = pedido;
  IF total_pago <> 50 OR valor_entrada <> 50 OR quitado THEN
    RAISE EXCEPTION 'Duas parcelas não conciliadas corretamente: histórico %, legado %, quitado %',
      total_pago, valor_entrada, quitado;
  END IF;

  -- Editar para baixo e para cima deve atualizar a mesma linha, sem inserir duplicata.
  PERFORM public.editar_recebimento_pedido(pagamento1, 25, current_date, 'pix', 'Valor reduzido');
  SELECT COALESCE(SUM(valor), 0) INTO total_pago
  FROM public.pedido_pagamentos WHERE pedido_id = pedido AND user_id = uid;
  SELECT p.valor_entrada INTO valor_entrada FROM public.pedidos p WHERE p.id = pedido;
  IF total_pago <> 45 OR valor_entrada <> 45
     OR (SELECT count(*) FROM public.pedido_pagamentos WHERE pedido_id = pedido AND user_id = uid) <> 2 THEN
    RAISE EXCEPTION 'Redução de parcela duplicou ou não conciliou valores: histórico %, legado %', total_pago, valor_entrada;
  END IF;

  PERFORM public.editar_recebimento_pedido(pagamento1, 35, current_date, 'pix', 'Valor aumentado');
  SELECT COALESCE(SUM(valor), 0) INTO total_pago
  FROM public.pedido_pagamentos WHERE pedido_id = pedido AND user_id = uid;
  SELECT p.valor_entrada, p.saldo_quitado INTO valor_entrada, quitado FROM public.pedidos p WHERE p.id = pedido;
  IF total_pago <> 55 OR valor_entrada <> 55 OR quitado THEN
    RAISE EXCEPTION 'Aumento de parcela não conciliou valores: histórico %, legado %, quitado %',
      total_pago, valor_entrada, quitado;
  END IF;

  -- A edição não pode fazer o total recebido superar o total da venda.
  BEGIN
    PERFORM public.editar_recebimento_pedido(pagamento1, 90, current_date, 'pix', 'Excederia o pedido');
    RAISE EXCEPTION 'Edição acima do total deveria ser bloqueada.';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM = 'Edição acima do total deveria ser bloqueada.' THEN RAISE; END IF;
    IF position('excede o total do pedido' IN SQLERRM) = 0 THEN RAISE; END IF;
  END;

  -- A função de registro deve usar o maior entre o saldo legado e o histórico.
  INSERT INTO public.pedidos(
    user_id, data_entrega, status, valor_entrada, saldo_quitado,
    desconto, taxa_entrega, forma_pagamento
  ) VALUES (uid, current_date, 'recebido', 80, false, 0, 0, 'pix')
  RETURNING id INTO pedido_legado;
  INSERT INTO public.pedido_itens(
    user_id, pedido_id, produto_id, descricao, quantidade, preco_unitario, custo_unitario
  ) VALUES (uid, pedido_legado, produto, 'Produto legado teste', 1, 100, 25);
  INSERT INTO public.pedido_pagamentos(pedido_id, user_id, valor, data_pagamento, forma_pagamento)
  VALUES (pedido_legado, uid, 30, current_date, 'pix');
  BEGIN
    PERFORM public.registrar_recebimento_pedido(pedido_legado, 21, current_date, 'pix', 'Tentativa excedente legado');
    RAISE EXCEPTION 'Registro acima do saldo legado deveria ser bloqueado.';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM = 'Registro acima do saldo legado deveria ser bloqueado.' THEN RAISE; END IF;
    IF position('excede o saldo do pedido' IN SQLERRM) = 0 THEN RAISE; END IF;
  END;
  IF (SELECT count(*) FROM public.pedido_pagamentos WHERE pedido_id = pedido_legado AND user_id = uid) <> 1 THEN
    RAISE EXCEPTION 'Tentativa recusada inseriu recebimento no histórico.';
  END IF;

  -- Pedidos cancelados não aceitam novos recebimentos nem edição de recebimento existente.
  INSERT INTO public.pedidos(
    user_id, data_entrega, status, valor_entrada, saldo_quitado,
    desconto, taxa_entrega, forma_pagamento
  ) VALUES (uid, current_date, 'recebido', 0, false, 0, 0, 'pix')
  RETURNING id INTO pedido_cancelado;
  INSERT INTO public.pedido_itens(
    user_id, pedido_id, produto_id, descricao, quantidade, preco_unitario, custo_unitario
  ) VALUES (uid, pedido_cancelado, produto, 'Produto cancelado teste', 1, 100, 25);
  pagamento2 := public.registrar_recebimento_pedido(pedido_cancelado, 10, current_date, 'pix', 'Histórico antes do cancelamento');
  UPDATE public.pedidos SET status = 'cancelado' WHERE id = pedido_cancelado;

  BEGIN
    PERFORM public.registrar_recebimento_pedido(pedido_cancelado, 1, current_date, 'pix', 'Bloqueado cancelado');
    RAISE EXCEPTION 'Pedido cancelado deveria bloquear novo recebimento.';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM = 'Pedido cancelado deveria bloquear novo recebimento.' THEN RAISE; END IF;
    IF position('pedido cancelado' IN SQLERRM) = 0 THEN RAISE; END IF;
  END;
  BEGIN
    PERFORM public.editar_recebimento_pedido(pagamento2, 5, current_date, 'pix', 'Bloqueado cancelado');
    RAISE EXCEPTION 'Pedido cancelado deveria bloquear edição de recebimento.';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM = 'Pedido cancelado deveria bloquear edição de recebimento.' THEN RAISE; END IF;
    IF position('pedido cancelado' IN SQLERRM) = 0 THEN RAISE; END IF;
  END;
  IF (SELECT valor FROM public.pedido_pagamentos WHERE id = pagamento2) <> 10 THEN
    RAISE EXCEPTION 'A tentativa de edição no pedido cancelado alterou o histórico.';
  END IF;
END
$test$;
ROLLBACK;
