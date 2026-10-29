\set ON_ERROR_STOP on
-- Etapa C: salvar_pedido não pode sobrescrever o valor pago de pedidos com recebimentos
-- registrados (aparelho com tela desatualizada), mas continua gravando os demais campos.
BEGIN;
INSERT INTO auth.users(id) VALUES ('c1c1c1c1-c1c1-4c1c-8c1c-c1c1c1c1c1c1');
UPDATE public.plataforma_config SET cadastro_aberto = true, aprovacao_manual = false;
INSERT INTO auth.users(id) VALUES ('c2c2c2c2-c2c2-4c2c-8c2c-c2c2c2c2c2c2');
SELECT set_config('request.jwt.claim.sub', 'c1c1c1c1-c1c1-4c1c-8c1c-c1c1c1c1c1c1', true);

DO $test$
DECLARE
  uid uuid := 'c1c1c1c1-c1c1-4c1c-8c1c-c1c1c1c1c1c1';
  produto uuid;
  pedido uuid;
  pedido_legado uuid;
  v_entrada numeric;
  v_quitado boolean;
  v_desconto numeric;
  v_status text;
  v_soma numeric;
  itens jsonb;
BEGIN
  INSERT INTO public.produtos(user_id, nome, rendimento, preco_venda)
  VALUES (uid, 'Produto salvar teste', 1, 100) RETURNING id INTO produto;
  itens := jsonb_build_array(jsonb_build_object(
    'produto_id', produto, 'descricao', 'Produto salvar teste', 'quantidade', 1,
    'preco_unitario', 100, 'custo_unitario', 25));

  -- Pedido novo, criado sem entrada (como a tela faz) e depois com recebimento de outro aparelho.
  pedido := public.salvar_pedido(jsonb_build_object(
    'data_entrega', current_date, 'status', 'recebido', 'forma_pagamento', 'pix',
    'valor_entrada', 0, 'saldo_quitado', false, 'desconto', 0, 'taxa_entrega', 0), itens);
  PERFORM public.registrar_recebimento_pedido(pedido, 50, current_date, 'pix', 'outro aparelho');

  -- Aparelho desatualizado salva com o valor pago antigo (0) e muda o desconto.
  PERFORM public.salvar_pedido(jsonb_build_object(
    'data_entrega', current_date, 'status', 'confirmado', 'forma_pagamento', 'pix',
    'valor_entrada', 0, 'saldo_quitado', true, 'desconto', 10, 'taxa_entrega', 0), itens, pedido);

  SELECT valor_entrada, saldo_quitado, desconto, status INTO v_entrada, v_quitado, v_desconto, v_status
  FROM public.pedidos WHERE id = pedido;
  SELECT COALESCE(SUM(valor), 0) INTO v_soma FROM public.pedido_pagamentos WHERE pedido_id = pedido;
  IF v_entrada <> 50 OR v_soma <> 50 THEN
    RAISE EXCEPTION 'Valor pago foi sobrescrito: pedido %, pagamentos %', v_entrada, v_soma;
  END IF;
  IF v_quitado THEN
    RAISE EXCEPTION 'saldo_quitado foi sobrescrito por um salvamento desatualizado.';
  END IF;
  IF v_desconto <> 10 OR v_status <> 'confirmado' THEN
    RAISE EXCEPTION 'Os demais campos deveriam ser gravados: desconto %, status %', v_desconto, v_status;
  END IF;

  -- Pedido legado (sem linhas em pedido_pagamentos): os valores enviados continuam valendo.
  pedido_legado := public.salvar_pedido(jsonb_build_object(
    'data_entrega', current_date, 'status', 'entregue', 'forma_pagamento', 'pix',
    'valor_entrada', 0, 'saldo_quitado', false, 'desconto', 0, 'taxa_entrega', 0), itens);
  PERFORM public.salvar_pedido(jsonb_build_object(
    'data_entrega', current_date, 'status', 'entregue', 'forma_pagamento', 'pix',
    'valor_entrada', 0, 'saldo_quitado', true, 'desconto', 0, 'taxa_entrega', 0), itens, pedido_legado);
  SELECT saldo_quitado INTO v_quitado FROM public.pedidos WHERE id = pedido_legado;
  IF NOT v_quitado THEN
    RAISE EXCEPTION 'Pedido sem recebimentos registrados deveria aceitar saldo_quitado enviado.';
  END IF;

  -- Outra confeitaria não consegue editar este pedido.
  PERFORM set_config('request.jwt.claim.sub', 'c2c2c2c2-c2c2-4c2c-8c2c-c2c2c2c2c2c2', true);
  BEGIN
    PERFORM public.salvar_pedido(jsonb_build_object(
      'data_entrega', current_date, 'status', 'recebido', 'forma_pagamento', 'pix',
      'valor_entrada', 0, 'saldo_quitado', false, 'desconto', 0, 'taxa_entrega', 0), itens, pedido);
    RAISE EXCEPTION 'Outra confeitaria não deveria editar este pedido.';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM = 'Outra confeitaria não deveria editar este pedido.' THEN RAISE; END IF;
    IF position('Pedido não encontrado' IN SQLERRM) = 0 THEN RAISE; END IF;
  END;
END
$test$;

ROLLBACK;
