\set ON_ERROR_STOP on
-- Preparos (migração 0053): custo pelo rendimento, uso proporcional na receita do produto,
-- recálculo quando um ingrediente muda de preço, produção sem baixa do preparo, proteções
-- e isolamento entre confeitarias.
BEGIN;

UPDATE public.plataforma_config SET cadastro_aberto = true, aprovacao_manual = false;
INSERT INTO auth.users(id) VALUES
  ('a1111111-1111-4111-8111-111111111111'),
  ('b2222222-2222-4222-8222-222222222222');

CREATE FUNCTION pg_temp.entrar(id uuid) RETURNS void LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claim.sub', id::text, true),
         set_config('request.jwt.claims', jsonb_build_object('sub', id)::text, true)
$$;

CREATE TEMP TABLE ids_a (nome text PRIMARY KEY, id uuid) ON COMMIT DROP;
GRANT ALL ON ids_a TO authenticated;

-- Dona A --------------------------------------------------------------------------------------------
-- (como superusuário, igual ao teste do estoque pronto, para poder chamar _custo_unitario_produto)
SELECT pg_temp.entrar('a1111111-1111-4111-8111-111111111111');

DO $t$
DECLARE
  choc uuid; creme uuid; farinha uuid; cob uuid; pid uuid; ped uuid; item uuid;
  v numeric;
  ok boolean;
  payload jsonb := jsonb_build_object(
    'cliente_id', NULL, 'data_entrega', current_date, 'hora_entrega', NULL, 'status', 'recebido',
    'forma_pagamento', 'pix', 'valor_entrada', 0, 'saldo_quitado', false,
    'desconto', 0, 'taxa_entrega', 0, 'observacoes', NULL);
BEGIN
  -- Chocolate 1 kg por R$ 40 (R$ 0,04/g); creme de leite 200 g por R$ 4 (R$ 0,02/g).
  INSERT INTO public.insumos(nome, unidade, preco_unidade, preco_embalagem, quantidade_embalagem, unidade_embalagem)
  VALUES ('Chocolate', 'kg', 40, 40, 1, 'kg') RETURNING id INTO choc;
  INSERT INTO public.insumos(nome, unidade, preco_unidade, preco_embalagem, quantidade_embalagem, unidade_embalagem)
  VALUES ('Creme de leite', 'g', 0.02, 4, 200, 'g') RETURNING id INTO creme;
  INSERT INTO public.insumos(nome, unidade, preco_unidade, preco_embalagem, quantidade_embalagem, unidade_embalagem)
  VALUES ('Farinha', 'g', 0.01, 10, 1000, 'g') RETURNING id INTO farinha;

  -- Cobertura: 400 g de chocolate (R$ 16) + 200 g de creme (R$ 4) = R$ 20, rende 500 g.
  cob := public.salvar_preparo('Cobertura de chocolate', 500, 'g', jsonb_build_array(
    jsonb_build_object('insumo_id', choc, 'quantidade', 0.4, 'unidade', 'kg'),
    jsonb_build_object('insumo_id', creme, 'quantidade', 200, 'unidade', 'g')));
  SELECT preco_embalagem INTO v FROM public.insumos WHERE id = cob;
  IF v <> 20 THEN RAISE EXCEPTION 'TESTE_FALHOU: custo do preparo deveria ser 20, é %.', v; END IF;
  IF (SELECT tipo FROM public.insumos WHERE id = cob) <> 'preparo' THEN RAISE EXCEPTION 'TESTE_FALHOU: tipo do preparo.'; END IF;
  IF (SELECT count(*) FROM public.preparo_itens WHERE preparo_id = cob) <> 2 THEN RAISE EXCEPTION 'TESTE_FALHOU: itens do preparo.'; END IF;

  -- Bolo: rende 1, usa 100 g da cobertura (R$ 4) + 200 g de farinha (R$ 2).
  INSERT INTO public.produtos(nome, rendimento, preco_venda) VALUES ('Bolo com cobertura', 1, 50) RETURNING id INTO pid;
  INSERT INTO public.receita_itens(produto_id, insumo_id, quantidade, quantidade_utilizada, unidade_receita)
  VALUES (pid, cob, 100, 100, 'g'), (pid, farinha, 200, 200, 'g');
  v := public._custo_unitario_produto(pid, 'a1111111-1111-4111-8111-111111111111');
  IF v <> 6 THEN RAISE EXCEPTION 'TESTE_FALHOU: custo do bolo deveria ser 6, é %.', v; END IF;

  -- Chocolate sobe para R$ 80/kg → cobertura 32 + 4 = 36; 100 g = 7,20; bolo = 9,20.
  UPDATE public.insumos SET preco_embalagem = 80 WHERE id = choc;
  SELECT preco_embalagem INTO v FROM public.insumos WHERE id = cob;
  IF v <> 36 THEN RAISE EXCEPTION 'TESTE_FALHOU: preparo não recalculou (%).', v; END IF;
  v := public._custo_unitario_produto(pid, 'a1111111-1111-4111-8111-111111111111');
  IF v <> 9.2 THEN RAISE EXCEPTION 'TESTE_FALHOU: custo do bolo depois do aumento deveria ser 9,20, é %.', v; END IF;

  -- Editar: rende 1 kg com os mesmos ingredientes → 100 g = 3,60.
  PERFORM public.salvar_preparo('Cobertura de chocolate', 1, 'kg', jsonb_build_array(
    jsonb_build_object('insumo_id', choc, 'quantidade', 400, 'unidade', 'g'),
    jsonb_build_object('insumo_id', creme, 'quantidade', 200, 'unidade', 'g')), cob);
  v := public._custo_unitario_produto(pid, 'a1111111-1111-4111-8111-111111111111');
  IF v <> 5.6 THEN RAISE EXCEPTION 'TESTE_FALHOU: custo depois de mudar o rendimento deveria ser 5,60, é %.', v; END IF;

  -- Produção: baixa a farinha, nunca o preparo.
  PERFORM public.salvar_compra('{"data_compra":"2026-11-18"}'::jsonb,
    jsonb_build_array(jsonb_build_object('insumo_id', farinha, 'quantidade', 1000, 'unidade', 'g', 'preco_unitario', 0.01)),
    NULL, 'cccccccc-cccc-4ccc-8ccc-cccccccccc01');
  ped := public.salvar_pedido(payload, jsonb_build_array(jsonb_build_object(
    'produto_id', pid, 'descricao', 'Bolo com cobertura', 'quantidade', 2, 'preco_unitario', 50, 'custo_unitario', 5.6)));
  SELECT id INTO item FROM public.pedido_itens WHERE pedido_id = ped;
  PERFORM public.ajustar_producao('dddddddd-dddd-4ddd-8ddd-dddddddddd01', item, 2);
  SELECT s.saldo INTO v FROM public.saldo_estoque() s WHERE s.insumo_id = farinha;
  IF v <> 600 THEN RAISE EXCEPTION 'TESTE_FALHOU: produção deveria baixar 400 g de farinha (saldo %).', v; END IF;
  IF EXISTS (SELECT 1 FROM public.estoque_movimentos WHERE insumo_id = cob) THEN
    RAISE EXCEPTION 'TESTE_FALHOU: a produção movimentou o estoque do preparo.';
  END IF;
  -- Produção para o estoque pronto também ignora o preparo.
  PERFORM public.registrar_producao_estoque('dddddddd-dddd-4ddd-8ddd-dddddddddd02', pid, 1);
  IF EXISTS (SELECT 1 FROM public.estoque_movimentos WHERE insumo_id = cob) THEN
    RAISE EXCEPTION 'TESTE_FALHOU: registrar_producao_estoque movimentou o preparo.';
  END IF;

  -- Proteções -----------------------------------------------------------------------------------
  ok := false;
  BEGIN
    PERFORM public.salvar_preparo('Recheio duplo', 300, 'g', jsonb_build_array(jsonb_build_object('insumo_id', cob, 'quantidade', 100, 'unidade', 'g')));
  EXCEPTION WHEN raise_exception THEN ok := SQLERRM LIKE '%outro preparo%';
  END;
  IF NOT ok THEN RAISE EXCEPTION 'TESTE_FALHOU: preparo dentro de preparo foi aceito.'; END IF;

  ok := false;
  BEGIN
    PERFORM public.salvar_preparo('Medida errada', 300, 'g', jsonb_build_array(jsonb_build_object('insumo_id', choc, 'quantidade', 2, 'unidade', 'un')));
  EXCEPTION WHEN raise_exception THEN ok := SQLERRM LIKE '%Medida incompatível%';
  END;
  IF NOT ok THEN RAISE EXCEPTION 'TESTE_FALHOU: medida incompatível foi aceita.'; END IF;

  ok := false;
  BEGIN
    PERFORM public.salvar_preparo('Cobertura de chocolate', 10, 'un', jsonb_build_array(jsonb_build_object('insumo_id', choc, 'quantidade', 1, 'unidade', 'g')), cob);
  EXCEPTION WHEN raise_exception THEN ok := SQLERRM LIKE '%mesma medida%';
  END;
  IF NOT ok THEN RAISE EXCEPTION 'TESTE_FALHOU: trocar o rendimento de peso para unidade foi aceito.'; END IF;

  ok := false;
  BEGIN
    UPDATE public.insumos SET tipo = 'ingrediente' WHERE id = cob;
  EXCEPTION WHEN raise_exception THEN ok := true;
  END;
  IF NOT ok THEN RAISE EXCEPTION 'TESTE_FALHOU: preparo virou insumo comum.'; END IF;

  ok := false;
  BEGIN
    DELETE FROM public.insumos WHERE id = creme;
  EXCEPTION WHEN raise_exception THEN ok := SQLERRM LIKE 'INSUMO_USADO_EM_RECEITA%';
  END;
  IF NOT ok THEN RAISE EXCEPTION 'TESTE_FALHOU: excluir ingrediente de preparo foi aceito.'; END IF;

  ok := false;
  BEGIN
    PERFORM public.salvar_preparo('Vazio', 100, 'g', '[]'::jsonb);
  EXCEPTION WHEN raise_exception THEN ok := true;
  END;
  IF NOT ok THEN RAISE EXCEPTION 'TESTE_FALHOU: preparo sem ingredientes foi aceito.'; END IF;

  INSERT INTO ids_a VALUES ('cob', cob), ('choc', choc);
END $t$;

-- Dona A como usuária logada (papel authenticated), igual ao app: salvar e recálculo pelo trigger -----
-- (regressão da 0054: as funções de custo precisam ser executáveis pelo papel authenticated)
SELECT pg_temp.entrar('a1111111-1111-4111-8111-111111111111');
SET LOCAL ROLE authenticated;
DO $t$
DECLARE
  cob uuid := (SELECT id FROM ids_a WHERE nome = 'cob');
  choc uuid := (SELECT id FROM ids_a WHERE nome = 'choc');
  calda uuid;
  v numeric;
BEGIN
  calda := public.salvar_preparo('Calda de chocolate', 200, 'g', jsonb_build_array(
    jsonb_build_object('insumo_id', choc, 'quantidade', 100, 'unidade', 'g')));
  SELECT preco_embalagem INTO v FROM public.insumos WHERE id = calda;
  IF v <> 8 THEN RAISE EXCEPTION 'TESTE_FALHOU: custo da calda (como authenticated) deveria ser 8, é %.', v; END IF;
  -- Chocolate volta para R$ 40/kg: calda 4 e cobertura (400 g + creme) 16 + 4 = 20.
  UPDATE public.insumos SET preco_embalagem = 40 WHERE id = choc;
  SELECT preco_embalagem INTO v FROM public.insumos WHERE id = calda;
  IF v <> 4 THEN RAISE EXCEPTION 'TESTE_FALHOU: recálculo pelo trigger (como authenticated) deu %.', v; END IF;
  SELECT preco_embalagem INTO v FROM public.insumos WHERE id = cob;
  IF v <> 20 THEN RAISE EXCEPTION 'TESTE_FALHOU: cobertura depois do recálculo deveria ser 20, é %.', v; END IF;
END $t$;
RESET ROLE;

-- Dona B: não vê nem altera o preparo da A --------------------------------------------------------
SELECT pg_temp.entrar('b2222222-2222-4222-8222-222222222222');
SET LOCAL ROLE authenticated;
DO $t$
DECLARE
  cob uuid := (SELECT id FROM ids_a WHERE nome = 'cob');
  choc uuid := (SELECT id FROM ids_a WHERE nome = 'choc');
  ok boolean;
BEGIN
  IF EXISTS (SELECT 1 FROM public.preparo_itens) THEN
    RAISE EXCEPTION 'TESTE_FALHOU: B leu ingredientes de preparo da A.';
  END IF;
  ok := false;
  BEGIN
    PERFORM public.salvar_preparo('Invasão', 100, 'g', jsonb_build_array(jsonb_build_object('insumo_id', choc, 'quantidade', 1, 'unidade', 'g')), cob);
  EXCEPTION WHEN raise_exception THEN ok := SQLERRM LIKE '%não encontrado%';
  END;
  IF NOT ok THEN RAISE EXCEPTION 'TESTE_FALHOU: B alterou o preparo da A.'; END IF;
  ok := false;
  BEGIN
    PERFORM public.salvar_preparo('Com insumo alheio', 100, 'g', jsonb_build_array(jsonb_build_object('insumo_id', choc, 'quantidade', 1, 'unidade', 'g')));
  EXCEPTION WHEN raise_exception THEN ok := SQLERRM LIKE '%não encontrado%';
  END;
  IF NOT ok THEN RAISE EXCEPTION 'TESTE_FALHOU: B usou um insumo da A no preparo.'; END IF;
END $t$;
RESET ROLE;

-- Anônimo não lê nem salva -----------------------------------------------------------------------
SELECT set_config('request.jwt.claim.sub', '', true);
SET LOCAL ROLE anon;
DO $t$
BEGIN
  BEGIN
    PERFORM count(*) FROM public.preparo_itens;
    RAISE EXCEPTION 'TESTE_FALHOU: anônimo leu preparo_itens.';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    PERFORM public.salvar_preparo('x', 1, 'g', '[]'::jsonb);
    RAISE EXCEPTION 'TESTE_FALHOU: anônimo executou salvar_preparo.';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END $t$;
RESET ROLE;

ROLLBACK;
