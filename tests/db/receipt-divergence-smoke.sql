\set ON_ERROR_STOP on
BEGIN;
INSERT INTO auth.users(id) VALUES ('adadadad-adad-4dad-8dad-adadadadadad');
SELECT set_config('request.jwt.claim.sub', 'adadadad-adad-4dad-8dad-adadadadadad', true);

DO $test$
DECLARE
  uid uuid := 'adadadad-adad-4dad-8dad-adadadadadad';
  produto uuid;
  pedido uuid;
  total_pago numeric;
  legado numeric;
  quitado boolean;
BEGIN
  INSERT INTO public.produtos(user_id, nome, rendimento, preco_venda)
  VALUES (uid, 'Produto divergência recebimentos', 1, 100)
  RETURNING id INTO produto;

  INSERT INTO public.pedidos(
    user_id, data_entrega, status, valor_entrada, saldo_quitado,
    desconto, taxa_entrega, forma_pagamento
  ) VALUES (uid, current_date, 'recebido', 20, false, 0, 0, 'pix')
  RETURNING id INTO pedido;

  INSERT INTO public.pedido_itens(
    user_id, pedido_id, produto_id, descricao, quantidade, preco_unitario, custo_unitario
  ) VALUES (uid, pedido, produto, 'Produto divergência recebimentos', 1, 100, 25);

  -- Detailed sum (55) is greater than legacy paid value (20): only 45 remain.
  INSERT INTO public.pedido_pagamentos(pedido_id, user_id, valor, data_pagamento, forma_pagamento)
  VALUES
    (pedido, uid, 30, current_date, 'pix'),
    (pedido, uid, 25, current_date, 'dinheiro');

  BEGIN
    PERFORM public.registrar_recebimento_pedido(pedido, 46, current_date, 'pix', 'Tentativa excedente');
    RAISE EXCEPTION 'Recebimento acima do saldo detalhado deveria ser bloqueado.';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM = 'Recebimento acima do saldo detalhado deveria ser bloqueado.' THEN RAISE; END IF;
    IF position('excede o saldo do pedido' IN SQLERRM) = 0 THEN RAISE; END IF;
  END;

  IF (SELECT count(*) FROM public.pedido_pagamentos WHERE pedido_id = pedido AND user_id = uid) <> 2
     OR (SELECT valor_entrada FROM public.pedidos WHERE id = pedido) <> 20 THEN
    RAISE EXCEPTION 'Tentativa recusada alterou os dados do pedido.';
  END IF;

  PERFORM public.registrar_recebimento_pedido(pedido, 45, current_date, 'pix', 'Completa saldo disponível');
  SELECT COALESCE(SUM(valor), 0) INTO total_pago
  FROM public.pedido_pagamentos WHERE pedido_id = pedido AND user_id = uid;
  SELECT valor_entrada, saldo_quitado INTO legado, quitado
  FROM public.pedidos WHERE id = pedido;

  IF total_pago <> 100 OR legado <> 100 OR NOT quitado THEN
    RAISE EXCEPTION 'Conciliação falhou: detalhado %, legado %, quitado %', total_pago, legado, quitado;
  END IF;
END
$test$;
ROLLBACK;
