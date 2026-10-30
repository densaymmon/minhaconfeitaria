\set ON_ERROR_STOP on
-- Estoque de produtos prontos (migração 0049): produção para estoque, uso em pedidos
-- (manual e catálogo), devolução, descarte, desfazer, isolamento entre confeitarias.
BEGIN;

UPDATE public.plataforma_config SET cadastro_aberto = true, aprovacao_manual = false;
INSERT INTO auth.users(id) VALUES
  ('a1111111-1111-4111-8111-111111111111'),
  ('b2222222-2222-4222-8222-222222222222');
UPDATE public.confeitarias SET nome = 'Doces da A', slug = 'doces-da-a', catalogo_ativo = true,
  aceita_retirada = true, aceita_entrega = false WHERE user_id = 'a1111111-1111-4111-8111-111111111111';

SELECT set_config('request.jwt.claim.sub', 'a1111111-1111-4111-8111-111111111111', true);

DO $t$
DECLARE
  uid uuid := 'a1111111-1111-4111-8111-111111111111';
  iid uuid;
  pid uuid;
  p1 uuid;
  p2 uuid;
  p3 uuid;
  i1 uuid;
  i2 uuid;
  i3 uuid;
  v_saldo numeric;
  v_insumo numeric;
  v_prod numeric;
  v_est numeric;
  v_pronto numeric;
  v_n integer;

  function_payload jsonb := jsonb_build_object(
    'cliente_id', NULL, 'data_entrega', current_date, 'hora_entrega', NULL, 'status', 'recebido',
    'forma_pagamento', 'pix', 'valor_entrada', 0, 'saldo_quitado', false,
    'desconto', 0, 'taxa_entrega', 0, 'observacoes', NULL);
BEGIN
  INSERT INTO public.insumos(user_id, nome, unidade, preco_unidade, preco_embalagem, quantidade_embalagem, unidade_embalagem)
  VALUES (uid, 'Farinha estoque pronto', 'g', 0.01, 10, 1000, 'g') RETURNING id INTO iid;
  PERFORM public.salvar_compra(
    '{"data_compra":"2026-10-14"}'::jsonb,
    jsonb_build_array(jsonb_build_object('insumo_id', iid, 'quantidade', 1000, 'unidade', 'g', 'preco_unitario', 0.01)),
    NULL, 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01');

  INSERT INTO public.produtos(user_id, nome, rendimento, preco_venda, no_catalogo, antecedencia_dias)
  VALUES (uid, 'Bolo pronto', 1, 50, true, 0) RETURNING id INTO pid;
  INSERT INTO public.receita_itens(user_id, produto_id, insumo_id, quantidade, quantidade_utilizada, unidade_receita)
  VALUES (uid, pid, iid, 10, 10, 'g');

  -- 1. Registrar produção: soma ao estoque pronto e baixa os insumos ----------------------
  v_saldo := public.registrar_producao_estoque('11111111-1111-4111-8111-111111111101', pid, 3, 'Sobrou da feira');
  SELECT s.saldo INTO v_insumo FROM public.saldo_estoque() s WHERE s.insumo_id = iid;
  IF v_saldo <> 3 OR v_insumo <> 970 THEN
    RAISE EXCEPTION 'TESTE_FALHOU: produção para estoque (pronto %, insumo %).', v_saldo, v_insumo;
  END IF;

  -- Repetir o evento (clique duplo) não repete a baixa nem a entrada.
  v_saldo := public.registrar_producao_estoque('11111111-1111-4111-8111-111111111101', pid, 3, 'Sobrou da feira');
  SELECT s.saldo INTO v_insumo FROM public.saldo_estoque() s WHERE s.insumo_id = iid;
  IF v_saldo <> 3 OR v_insumo <> 970 THEN
    RAISE EXCEPTION 'TESTE_FALHOU: evento repetido duplicou a produção (pronto %, insumo %).', v_saldo, v_insumo;
  END IF;
  BEGIN
    PERFORM public.registrar_producao_estoque('11111111-1111-4111-8111-111111111101', pid, 4);
    RAISE EXCEPTION 'TESTE_FALHOU: evento reutilizado com outra quantidade foi aceito.';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE 'TESTE_FALHOU%' THEN RAISE; END IF;
  END;
  -- Quantidades inválidas.
  FOREACH v_prod IN ARRAY ARRAY[0, -1, 10000, 1.2345]::numeric[] LOOP
    BEGIN
      PERFORM public.registrar_producao_estoque(gen_random_uuid(), pid, v_prod);
      RAISE EXCEPTION 'TESTE_FALHOU: quantidade inválida % aceita.', v_prod;
    EXCEPTION WHEN OTHERS THEN
      IF SQLERRM LIKE 'TESTE_FALHOU%' THEN RAISE; END IF;
    END;
  END LOOP;

  -- 2. Pedido manual: a pessoa escolhe usar o estoque pronto em cada item ------------------
  p1 := public.salvar_pedido(function_payload, jsonb_build_array(jsonb_build_object(
    'produto_id', pid, 'descricao', 'Bolo pronto', 'quantidade', 2, 'preco_unitario', 50,
    'custo_unitario', 0.1, 'usar_estoque', true)));
  SELECT id, quantidade_produzida, quantidade_do_estoque INTO i1, v_prod, v_est FROM public.pedido_itens WHERE pedido_id = p1;
  SELECT quantidade INTO v_pronto FROM public.produtos_prontos WHERE produto_id = pid;
  SELECT s.saldo INTO v_insumo FROM public.saldo_estoque() s WHERE s.insumo_id = iid;
  IF v_prod <> 2 OR v_est <> 2 OR v_pronto <> 1 OR v_insumo <> 970 THEN
    RAISE EXCEPTION 'TESTE_FALHOU: pedido manual com estoque (produzida %, do estoque %, pronto %, insumo %).', v_prod, v_est, v_pronto, v_insumo;
  END IF;

  -- Sem marcar a opção, produz novo: nada sai do estoque pronto.
  p3 := public.salvar_pedido(function_payload, jsonb_build_array(jsonb_build_object(
    'produto_id', pid, 'descricao', 'Bolo pronto', 'quantidade', 1, 'preco_unitario', 50, 'custo_unitario', 0.1)));
  SELECT quantidade_produzida INTO v_prod FROM public.pedido_itens WHERE pedido_id = p3;
  SELECT quantidade INTO v_pronto FROM public.produtos_prontos WHERE produto_id = pid;
  IF v_prod <> 0 OR v_pronto <> 1 THEN
    RAISE EXCEPTION 'TESTE_FALHOU: pedido sem a opção mexeu no estoque (produzida %, pronto %).', v_prod, v_pronto;
  END IF;

  -- Pedido maior que o estoque: usa só o que existe, o resto fica para produzir.
  p2 := public.salvar_pedido(function_payload, jsonb_build_array(jsonb_build_object(
    'produto_id', pid, 'descricao', 'Bolo pronto', 'quantidade', 5, 'preco_unitario', 50,
    'custo_unitario', 0.1, 'usar_estoque', true)));
  SELECT id, quantidade_produzida, quantidade_do_estoque INTO i2, v_prod, v_est FROM public.pedido_itens WHERE pedido_id = p2;
  SELECT quantidade INTO v_pronto FROM public.produtos_prontos WHERE produto_id = pid;
  IF v_prod <> 1 OR v_est <> 1 OR v_pronto <> 0 THEN
    RAISE EXCEPTION 'TESTE_FALHOU: uso parcial do estoque (produzida %, do estoque %, pronto %).', v_prod, v_est, v_pronto;
  END IF;

  -- Sem estoque, marcar a opção não faz nada nem dá erro.
  PERFORM public.salvar_pedido(function_payload, jsonb_build_array(jsonb_build_object(
    'produto_id', pid, 'descricao', 'Bolo pronto', 'quantidade', 1, 'preco_unitario', 50,
    'custo_unitario', 0.1, 'usar_estoque', true)));

  -- 3. Produção do restante: só as unidades próprias baixam insumos ------------------------
  PERFORM public.ajustar_producao('22222222-2222-4222-8222-222222222201', i2, 3);
  SELECT s.saldo INTO v_insumo FROM public.saldo_estoque() s WHERE s.insumo_id = iid;
  IF v_insumo <> 950 THEN RAISE EXCEPTION 'TESTE_FALHOU: produzir +2 deveria baixar 20 g: %', v_insumo; END IF;

  -- Reduzir tudo: 2 unidades próprias estornam insumos; 1 do estoque volta ao estoque pronto.
  PERFORM public.ajustar_producao('22222222-2222-4222-8222-222222222202', i2, 0);
  SELECT s.saldo INTO v_insumo FROM public.saldo_estoque() s WHERE s.insumo_id = iid;
  SELECT quantidade INTO v_pronto FROM public.produtos_prontos WHERE produto_id = pid;
  SELECT quantidade_do_estoque INTO v_est FROM public.pedido_itens WHERE id = i2;
  IF v_insumo <> 970 OR v_pronto <> 1 OR v_est <> 0 THEN
    RAISE EXCEPTION 'TESTE_FALHOU: redução da produção (insumo %, pronto %, do estoque %).', v_insumo, v_pronto, v_est;
  END IF;

  -- 4. Cancelar o pedido devolve ao estoque pronto o que ele retirou -------------------------
  UPDATE public.pedidos SET status = 'cancelado' WHERE id = p1;
  SELECT quantidade INTO v_pronto FROM public.produtos_prontos WHERE produto_id = pid;
  SELECT quantidade_produzida, quantidade_do_estoque INTO v_prod, v_est FROM public.pedido_itens WHERE id = i1;
  SELECT s.saldo INTO v_insumo FROM public.saldo_estoque() s WHERE s.insumo_id = iid;
  IF v_pronto <> 3 OR v_prod <> 0 OR v_est <> 0 OR v_insumo <> 970 THEN
    RAISE EXCEPTION 'TESTE_FALHOU: cancelamento (pronto %, produzida %, do estoque %, insumo %).', v_pronto, v_prod, v_est, v_insumo;
  END IF;
  -- Cancelar de novo não devolve em dobro.
  UPDATE public.pedidos SET status = 'cancelado' WHERE id = p1;
  SELECT quantidade INTO v_pronto FROM public.produtos_prontos WHERE produto_id = pid;
  IF v_pronto <> 3 THEN RAISE EXCEPTION 'TESTE_FALHOU: cancelamento repetido devolveu em dobro: %', v_pronto; END IF;

  -- 5. Descartar: sai do estoque e os insumos não voltam ------------------------------------
  v_saldo := public.descartar_estoque_pronto('33333333-3333-4333-8333-333333333301', pid, 1, 'Estragou');
  v_saldo := public.descartar_estoque_pronto('33333333-3333-4333-8333-333333333301', pid, 1, 'Estragou');
  SELECT s.saldo INTO v_insumo FROM public.saldo_estoque() s WHERE s.insumo_id = iid;
  IF v_saldo <> 2 OR v_insumo <> 970 THEN
    RAISE EXCEPTION 'TESTE_FALHOU: descarte (pronto %, insumo %).', v_saldo, v_insumo;
  END IF;
  BEGIN
    PERFORM public.descartar_estoque_pronto(gen_random_uuid(), pid, 3);
    RAISE EXCEPTION 'TESTE_FALHOU: descarte acima do saldo aceito.';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE 'TESTE_FALHOU%' THEN RAISE; END IF;
  END;

  -- 6. Desfazer produção ----------------------------------------------------------------------
  -- A primeira produção (3 un.) já teve unidades usadas/descartadas: não dá para desfazer.
  BEGIN
    PERFORM public.desfazer_producao_estoque(gen_random_uuid(), '11111111-1111-4111-8111-111111111101');
    RAISE EXCEPTION 'TESTE_FALHOU: desfez produção já consumida.';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE 'TESTE_FALHOU%' THEN RAISE; END IF;
  END;
  PERFORM public.registrar_producao_estoque('11111111-1111-4111-8111-111111111102', pid, 1);
  SELECT s.saldo INTO v_insumo FROM public.saldo_estoque() s WHERE s.insumo_id = iid;
  IF v_insumo <> 960 THEN RAISE EXCEPTION 'TESTE_FALHOU: segunda produção: %', v_insumo; END IF;
  v_saldo := public.desfazer_producao_estoque('44444444-4444-4444-8444-444444444401', '11111111-1111-4111-8111-111111111102');
  v_saldo := public.desfazer_producao_estoque('44444444-4444-4444-8444-444444444401', '11111111-1111-4111-8111-111111111102');
  SELECT s.saldo INTO v_insumo FROM public.saldo_estoque() s WHERE s.insumo_id = iid;
  IF v_saldo <> 2 OR v_insumo <> 970 THEN
    RAISE EXCEPTION 'TESTE_FALHOU: desfazer produção (pronto %, insumo %).', v_saldo, v_insumo;
  END IF;
  BEGIN
    PERFORM public.desfazer_producao_estoque(gen_random_uuid(), '11111111-1111-4111-8111-111111111102');
    RAISE EXCEPTION 'TESTE_FALHOU: desfez a mesma produção duas vezes.';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE 'TESTE_FALHOU%' THEN RAISE; END IF;
  END;

  -- 7. Produto com unidades prontas não pode ser excluído --------------------------------------
  BEGIN
    DELETE FROM public.produtos WHERE id = pid;
    RAISE EXCEPTION 'TESTE_FALHOU: excluiu produto com estoque pronto.';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE 'TESTE_FALHOU%' THEN RAISE; END IF;
  END;

  -- 8. Catálogo público usa o estoque pronto automaticamente ---------------------------------------
  PERFORM set_config('teste.pid', pid::text, true);
  PERFORM set_config('teste.iid', iid::text, true);

  -- Histórico: nada foi apagado e cada movimento tem tipo válido.
  SELECT count(*) INTO v_n FROM public.produtos_prontos_movimentos WHERE user_id = uid;
  IF v_n <> 8 THEN RAISE EXCEPTION 'TESTE_FALHOU: histórico incompleto (% movimentos).', v_n; END IF;
END $t$;

-- Visitante anônimo faz um pedido de 3 bolos; há 2 prontos -------------------------------------------
SELECT set_config('request.jwt.claim.sub', '', true);
SET LOCAL ROLE anon;
DO $t$
DECLARE
  v_pedido jsonb;
BEGIN
  v_pedido := public.criar_pedido_catalogo('doces-da-a', gen_random_uuid(),
    jsonb_build_object('nome', 'Maria Souza', 'telefone', '(19) 98888-7777'),
    jsonb_build_object('tipo', 'retirada', 'data', to_char(public._hoje_confeitaria() + 1, 'YYYY-MM-DD')),
    jsonb_build_array(jsonb_build_object('produto_id', current_setting('teste.pid')::uuid, 'quantidade', 3)));
  PERFORM set_config('teste.codigo', v_pedido->>'codigo', true);
END $t$;
RESET ROLE;

SELECT set_config('request.jwt.claim.sub', 'a1111111-1111-4111-8111-111111111111', true);
DO $t$
DECLARE
  uid uuid := 'a1111111-1111-4111-8111-111111111111';
  pid uuid := current_setting('teste.pid')::uuid;
  iid uuid := current_setting('teste.iid')::uuid;
  v_ped uuid;
  v_prod numeric;
  v_est numeric;
  v_pronto numeric;
  v_insumo numeric;
BEGIN
  SELECT id INTO v_ped FROM public.pedidos WHERE codigo_publico = current_setting('teste.codigo')::uuid;
  SELECT quantidade_produzida, quantidade_do_estoque INTO v_prod, v_est FROM public.pedido_itens WHERE pedido_id = v_ped;
  SELECT quantidade INTO v_pronto FROM public.produtos_prontos WHERE produto_id = pid;
  SELECT s.saldo INTO v_insumo FROM public.saldo_estoque() s WHERE s.insumo_id = iid;
  IF v_prod <> 2 OR v_est <> 2 OR v_pronto <> 0 OR v_insumo <> 970 THEN
    RAISE EXCEPTION 'TESTE_FALHOU: catálogo automático (produzida %, do estoque %, pronto %, insumo %).', v_prod, v_est, v_pronto, v_insumo;
  END IF;

  -- Cancelar o pedido do catálogo devolve as 2 unidades.
  UPDATE public.pedidos SET status = 'cancelado' WHERE id = v_ped;
  SELECT quantidade INTO v_pronto FROM public.produtos_prontos WHERE produto_id = pid;
  IF v_pronto <> 2 THEN RAISE EXCEPTION 'TESTE_FALHOU: cancelar pedido do catálogo não devolveu ao estoque: %', v_pronto; END IF;

  -- Pedido entregue não devolve nada ao cancelar/alterar.
  PERFORM public.salvar_pedido(jsonb_build_object(
    'cliente_id', NULL, 'data_entrega', current_date, 'hora_entrega', NULL, 'status', 'recebido',
    'forma_pagamento', 'pix', 'valor_entrada', 0, 'saldo_quitado', false, 'desconto', 0, 'taxa_entrega', 0, 'observacoes', NULL),
    jsonb_build_array(jsonb_build_object('produto_id', pid, 'descricao', 'Bolo pronto', 'quantidade', 1,
      'preco_unitario', 50, 'custo_unitario', 0.1, 'usar_estoque', true)));
  SELECT quantidade INTO v_pronto FROM public.produtos_prontos WHERE produto_id = pid;
  IF v_pronto <> 1 THEN RAISE EXCEPTION 'TESTE_FALHOU: pedido seguinte deveria usar 1 unidade: %', v_pronto; END IF;
  UPDATE public.pedidos SET status = 'entregue' WHERE id = (SELECT p.id FROM public.pedidos p JOIN public.pedido_itens pi ON pi.pedido_id = p.id WHERE pi.quantidade_do_estoque = 1 AND p.status = 'recebido' LIMIT 1);
  UPDATE public.pedidos SET status = 'cancelado' WHERE status = 'entregue';
  SELECT quantidade INTO v_pronto FROM public.produtos_prontos WHERE produto_id = pid;
  IF v_pronto <> 1 THEN RAISE EXCEPTION 'TESTE_FALHOU: pedido entregue devolveu ao estoque: %', v_pronto; END IF;
END $t$;

-- Isolamento entre confeitarias ------------------------------------------------------------------------------------
SELECT set_config('request.jwt.claim.sub', 'b2222222-2222-4222-8222-222222222222', true);
SET LOCAL ROLE authenticated;
DO $t$
DECLARE
  pid uuid := current_setting('teste.pid')::uuid;
  v_n integer;
  v_item uuid;
BEGIN
  SELECT count(*) INTO v_n FROM public.produtos_prontos;
  IF v_n <> 0 THEN RAISE EXCEPTION 'TESTE_FALHOU: outra confeitaria enxerga o estoque pronto.'; END IF;
  SELECT count(*) INTO v_n FROM public.produtos_prontos_movimentos;
  IF v_n <> 0 THEN RAISE EXCEPTION 'TESTE_FALHOU: outra confeitaria enxerga o histórico do estoque pronto.'; END IF;

  BEGIN
    PERFORM public.registrar_producao_estoque(gen_random_uuid(), pid, 1);
    RAISE EXCEPTION 'TESTE_FALHOU: produziu para produto de outra confeitaria.';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE 'TESTE_FALHOU%' THEN RAISE; END IF;
  END;
  BEGIN
    PERFORM public.descartar_estoque_pronto(gen_random_uuid(), pid, 1);
    RAISE EXCEPTION 'TESTE_FALHOU: descartou estoque de outra confeitaria.';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE 'TESTE_FALHOU%' THEN RAISE; END IF;
  END;
  BEGIN
    -- O navegador não escreve direto nas tabelas.
    INSERT INTO public.produtos_prontos(produto_id, quantidade) VALUES (pid, 99);
    RAISE EXCEPTION 'TESTE_FALHOU: authenticated inseriu direto no estoque pronto.';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    PERFORM public._mover_estoque_pronto(current_setting('request.jwt.claim.sub')::uuid, pid, 1, 'producao', gen_random_uuid());
    RAISE EXCEPTION 'TESTE_FALHOU: authenticated chamou a função interna.';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END $t$;
RESET ROLE;

-- Anônimo não executa nenhuma das funções de estoque pronto ----------------------------------------------------------
SELECT set_config('request.jwt.claim.sub', '', true);
SET LOCAL ROLE anon;
DO $t$
BEGIN
  BEGIN
    PERFORM public.registrar_producao_estoque(gen_random_uuid(), gen_random_uuid(), 1);
    RAISE EXCEPTION 'TESTE_FALHOU: anônimo executou registrar_producao_estoque.';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    PERFORM count(*) FROM public.produtos_prontos;
    RAISE EXCEPTION 'TESTE_FALHOU: anônimo leu produtos_prontos.';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END $t$;
RESET ROLE;

ROLLBACK;
