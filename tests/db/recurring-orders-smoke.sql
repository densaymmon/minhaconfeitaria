\set ON_ERROR_STOP on
BEGIN;
INSERT INTO auth.users(id) VALUES ('acacacac-acac-4cac-8cac-acacacacacac');
SELECT set_config('request.jwt.claim.sub', 'acacacac-acac-4cac-8cac-acacacacacac', true);

DO $test$
DECLARE
  uid uuid := 'acacacac-acac-4cac-8cac-acacacacacac';
  cliente uuid;
  produto uuid;
  recorrencia uuid;
  ocorrencia uuid;
  pedido uuid;
  itens jsonb;
BEGIN
  INSERT INTO public.clientes(user_id, nome)
  VALUES (uid, 'Cliente recorrência teste') RETURNING id INTO cliente;
  INSERT INTO public.produtos(user_id, nome, rendimento, preco_venda)
  VALUES (uid, 'Produto recorrência teste', 1, 25) RETURNING id INTO produto;

  INSERT INTO public.pedidos_recorrentes(user_id, cliente_id, frequencia, data_inicio)
  VALUES (uid, cliente, 'semanal', current_date + 7) RETURNING id INTO recorrencia;
  INSERT INTO public.pedidos_recorrentes_ocorrencias(user_id, recorrencia_id, data_entrega)
  VALUES (uid, recorrencia, current_date + 7) RETURNING id INTO ocorrencia;

  itens := jsonb_build_array(jsonb_build_object(
    'produto_id', produto, 'descricao', 'Produto recorrência teste',
    'quantidade', 2, 'preco_unitario', 25, 'custo_unitario', 5
  ));

  pedido := public.confirmar_ocorrencia_recorrente(
    ocorrencia,
    jsonb_build_object('forma_pagamento', 'pix', 'valor_entrada', 0, 'saldo_quitado', false,
      'desconto', 0, 'taxa_entrega', 0, 'status', 'entregue'),
    itens
  );

  IF NOT EXISTS (
    SELECT 1 FROM public.pedidos p
    WHERE p.id = pedido AND p.user_id = uid AND p.cliente_id = cliente
      AND p.data_entrega = current_date + 7 AND p.status = 'recebido'
  ) THEN
    RAISE EXCEPTION 'O pedido recorrente não foi criado com os dados/status esperados.';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.pedidos_recorrentes_ocorrencias o
    WHERE o.id = ocorrencia AND o.pedido_id = pedido AND o.status = 'confirmada'
  ) THEN
    RAISE EXCEPTION 'A ocorrência não foi vinculada ao pedido criado.';
  END IF;

  BEGIN
    PERFORM public.confirmar_ocorrencia_recorrente(ocorrencia, '{}'::jsonb, itens);
    RAISE EXCEPTION 'A mesma ocorrência não pode criar dois pedidos.';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM = 'A mesma ocorrência não pode criar dois pedidos.' THEN RAISE; END IF;
    IF position('já foi convertida em pedido' IN SQLERRM) = 0 THEN RAISE; END IF;
  END;
END
$test$;
ROLLBACK;
