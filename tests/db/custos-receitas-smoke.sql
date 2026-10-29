\set ON_ERROR_STOP on
-- Etapa D: fórmula do custo por unidade (conversão de unidades, rendimento, custos extras)
-- e regra de que o custo gravado no pedido não muda quando o preço do insumo muda.
BEGIN;
INSERT INTO auth.users(id) VALUES ('d1d1d1d1-d1d1-4d1d-8d1d-d1d1d1d1d1d1');
SELECT set_config('request.jwt.claim.sub', 'd1d1d1d1-d1d1-4d1d-8d1d-d1d1d1d1d1d1', true);

DO $test$
DECLARE
  uid uuid := 'd1d1d1d1-d1d1-4d1d-8d1d-d1d1d1d1d1d1';
  farinha uuid; oleo uuid; ovos uuid;
  prod uuid; pedido uuid; item_id uuid;
  v numeric; snap numeric;
BEGIN
  -- Embalagem de 1 kg a R$ 10; óleo de 900 ml a R$ 9; ovo a R$ 0,50 a unidade.
  INSERT INTO public.insumos(user_id, nome, unidade, preco_unidade, preco_embalagem, quantidade_embalagem, unidade_embalagem)
  VALUES (uid, 'Farinha teste', 'kg', 10, 10, 1, 'kg') RETURNING id INTO farinha;
  INSERT INTO public.insumos(user_id, nome, unidade, preco_unidade, preco_embalagem, quantidade_embalagem, unidade_embalagem)
  VALUES (uid, 'Óleo teste', 'L', 10, 9, 900, 'ml') RETURNING id INTO oleo;
  INSERT INTO public.insumos(user_id, nome, unidade, preco_unidade, preco_embalagem, quantidade_embalagem, unidade_embalagem)
  VALUES (uid, 'Ovo teste', 'un', 0.5, 0.5, 1, 'un') RETURNING id INTO ovos;

  -- Receita rende 2 unidades, com custos extras de gás 1, energia 1 e mão de obra 2.
  INSERT INTO public.produtos(user_id, nome, rendimento, preco_venda, custo_gas, custo_energia, custo_mao_obra)
  VALUES (uid, 'Produto custo teste', 2, 40, 1, 1, 2) RETURNING id INTO prod;
  INSERT INTO public.receita_itens(user_id, produto_id, insumo_id, quantidade, quantidade_utilizada, unidade_receita)
  VALUES (uid, prod, farinha, 0.5, 500, 'g'),   -- 500 g de um pacote de 1 kg = 5,00
         (uid, prod, oleo, 100, 100, 'ml'),      -- 100 ml de 900 ml a R$ 9 = 1,00
         (uid, prod, ovos, 2, 2, 'un');          -- 2 ovos = 1,00

  -- (5 + 1 + 1 + gás 1 + energia 1 + mão de obra 2) / rendimento 2 = 5,50 por unidade.
  v := public._custo_unitario_produto(prod, uid);
  IF v <> 5.5 THEN RAISE EXCEPTION 'TESTE_FALHOU: custo por unidade esperado 5.5, obtido %', v; END IF;

  -- Custo gravado no pedido é um retrato: mudar o preço do insumo não o altera.
  pedido := public.salvar_pedido(jsonb_build_object(
      'data_entrega', current_date, 'status', 'recebido', 'forma_pagamento', 'pix',
      'valor_entrada', 0, 'saldo_quitado', false, 'desconto', 0, 'taxa_entrega', 0),
    jsonb_build_array(jsonb_build_object('produto_id', prod, 'descricao', 'Produto custo teste',
      'quantidade', 1, 'preco_unitario', 40, 'custo_unitario', v)));
  SELECT id, custo_unitario INTO item_id, snap FROM public.pedido_itens WHERE pedido_id = pedido;

  UPDATE public.insumos SET preco_unidade = 20, preco_embalagem = 20 WHERE id = farinha;
  v := public._custo_unitario_produto(prod, uid);
  IF v <> 8 THEN RAISE EXCEPTION 'TESTE_FALHOU: custo atual após reajuste esperado 8, obtido %', v; END IF;
  SELECT custo_unitario INTO snap FROM public.pedido_itens WHERE id = item_id;
  IF snap <> 5.5 THEN RAISE EXCEPTION 'TESTE_FALHOU: custo gravado no pedido mudou para %', snap; END IF;
END
$test$;

ROLLBACK;
