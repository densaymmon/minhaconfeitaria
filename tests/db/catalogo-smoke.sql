\set ON_ERROR_STOP on
-- Catálogo público: o visitante anônimo só usa as funções públicas, o preço e o
-- custo vêm do servidor e o pedido sempre cai na confeitaria dona do catálogo.
BEGIN;

UPDATE public.plataforma_config SET cadastro_aberto = true, aprovacao_manual = false;
INSERT INTO auth.users(id) VALUES
  ('a1111111-1111-4111-8111-111111111111'),
  ('b2222222-2222-4222-8222-222222222222');

-- Confeitaria A com catálogo ativo; B com um produto próprio.
DO $t$
DECLARE
  ua uuid := 'a1111111-1111-4111-8111-111111111111';
  ub uuid := 'b2222222-2222-4222-8222-222222222222';
  v_farinha uuid;
  v_bolo uuid;
BEGIN
  UPDATE public.confeitarias SET nome = 'Doces da A', slug = 'doces-da-a', catalogo_ativo = true,
    aceita_retirada = true, aceita_entrega = true, taxa_entrega = 10, limite_pedidos_dia = 3
  WHERE user_id = ua;
  UPDATE public.confeitarias SET nome = 'Doces da B', slug = 'doces-da-b', catalogo_ativo = true WHERE user_id = ub;
  INSERT INTO public.configuracoes(user_id, pix_chave) VALUES (ua, 'pix@docesdaa.com');

  INSERT INTO public.insumos(user_id, nome, unidade, preco_unidade, preco_embalagem, quantidade_embalagem, unidade_embalagem)
  VALUES (ua, 'Farinha', 'g', 0.01, 10, 1000, 'g') RETURNING id INTO v_farinha;
  INSERT INTO public.produtos(user_id, nome, categoria, rendimento, preco_venda, no_catalogo, antecedencia_dias, descricao)
  VALUES (ua, 'Bolo da A', 'Bolos', 1, 50, true, 1, 'Bolo caseiro') RETURNING id INTO v_bolo;
  INSERT INTO public.receita_itens(user_id, produto_id, insumo_id, quantidade, quantidade_utilizada, unidade_receita)
  VALUES (ua, v_bolo, v_farinha, 500, 500, 'g');
  INSERT INTO public.produtos(user_id, nome, rendimento, preco_venda, no_catalogo) VALUES (ua, 'Fora do catálogo', 1, 30, false);
  INSERT INTO public.produtos(user_id, nome, rendimento, preco_venda, no_catalogo, ativo) VALUES (ua, 'Inativo', 1, 30, true, false);
  INSERT INTO public.produtos(user_id, nome, rendimento, preco_venda, no_catalogo) VALUES (ub, 'Bolo da B', 1, 40, true);
END $t$;

SELECT set_config('teste.fora', (SELECT id::text FROM public.produtos WHERE nome = 'Fora do catálogo'), true),
       set_config('teste.inativo', (SELECT id::text FROM public.produtos WHERE nome = 'Inativo'), true),
       set_config('teste.bolo_b', (SELECT id::text FROM public.produtos WHERE nome = 'Bolo da B'), true);

-- Visitante anônimo ------------------------------------------------------------
SELECT set_config('request.jwt.claim.sub', '', true);
SET LOCAL ROLE anon;
DO $t$
DECLARE
  v jsonb;
  v_pedido jsonb;
  v_repetido jsonb;
  v_bolo_a uuid;
  v_fora uuid := current_setting('teste.fora')::uuid;
  v_inativo uuid := current_setting('teste.inativo')::uuid;
  v_bolo_b uuid := current_setting('teste.bolo_b')::uuid;
  v_amanha text := to_char(public._hoje_confeitaria() + 1, 'YYYY-MM-DD');
  v_token uuid := gen_random_uuid();
BEGIN
  -- Sem acesso direto às tabelas.
  BEGIN
    PERFORM count(*) FROM public.pedidos;
    RAISE EXCEPTION 'TESTE_FALHOU: anônimo leu a tabela de pedidos.';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    PERFORM count(*) FROM public.produtos;
    RAISE EXCEPTION 'TESTE_FALHOU: anônimo leu a tabela de produtos.';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;

  -- Catálogo mostra só produtos ativos e marcados, sem custo nem receita.
  v := public.catalogo_publico('Doces-da-A ');
  IF v IS NULL OR v->>'nome' <> 'Doces da A' OR jsonb_array_length(v->'produtos') <> 1
     OR v->'produtos'->0->>'nome' <> 'Bolo da A' THEN
    RAISE EXCEPTION 'TESTE_FALHOU: catálogo público incorreto: %', v;
  END IF;
  IF v::text ~* '(custo|margem|receita|insumo|user_id|pix)' THEN
    RAISE EXCEPTION 'TESTE_FALHOU: catálogo expôs dados internos: %', v;
  END IF;
  IF public.catalogo_publico('nao-existe') IS NOT NULL THEN
    RAISE EXCEPTION 'TESTE_FALHOU: slug inexistente retornou catálogo.';
  END IF;
  v_bolo_a := (v->'produtos'->0->>'id')::uuid;

  -- Preço enviado pelo navegador é ignorado; taxa de entrega vem da confeitaria.
  v_pedido := public.criar_pedido_catalogo('doces-da-a', v_token,
    jsonb_build_object('nome', 'Maria Souza', 'telefone', '(19) 98888-7777', 'endereco', 'Rua das Flores, 10'),
    jsonb_build_object('tipo', 'entrega', 'data', v_amanha, 'hora', '15:00', 'observacoes', 'Sem cobertura'),
    jsonb_build_array(jsonb_build_object('produto_id', v_bolo_a, 'quantidade', 2, 'preco', 0.01)));
  IF v_pedido->>'codigo' IS NULL THEN RAISE EXCEPTION 'TESTE_FALHOU: pedido sem código.'; END IF;

  -- Repetir o envio (duplo clique) devolve o mesmo pedido.
  v_repetido := public.criar_pedido_catalogo('doces-da-a', v_token,
    jsonb_build_object('nome', 'Maria Souza', 'telefone', '19988887777', 'endereco', 'Rua das Flores, 10'),
    jsonb_build_object('tipo', 'entrega', 'data', v_amanha),
    jsonb_build_array(jsonb_build_object('produto_id', v_bolo_a, 'quantidade', 2)));
  IF v_repetido->>'codigo' <> v_pedido->>'codigo' THEN RAISE EXCEPTION 'TESTE_FALHOU: envio repetido criou outro pedido.'; END IF;

  -- Acompanhamento pelo código.
  v := public.acompanhar_pedido_catalogo((v_pedido->>'codigo')::uuid);
  IF (v->>'total')::numeric <> 110 OR (v->>'pago')::numeric <> 0 OR v->>'cliente' <> 'Maria'
     OR v->'confeitaria'->>'pix_chave' <> 'pix@docesdaa.com' OR (v->>'pagamento_informado')::boolean THEN
    RAISE EXCEPTION 'TESTE_FALHOU: acompanhamento incorreto: %', v;
  END IF;
  IF v::text ~* '(custo|user_id|telefone)' THEN RAISE EXCEPTION 'TESTE_FALHOU: acompanhamento expôs dados internos: %', v; END IF;
  IF public.acompanhar_pedido_catalogo(gen_random_uuid()) IS NOT NULL THEN
    RAISE EXCEPTION 'TESTE_FALHOU: código inexistente retornou pedido.';
  END IF;
  IF NOT public.informar_pagamento_catalogo((v_pedido->>'codigo')::uuid) THEN
    RAISE EXCEPTION 'TESTE_FALHOU: não registrou aviso de pagamento.';
  END IF;
  IF NOT (public.acompanhar_pedido_catalogo((v_pedido->>'codigo')::uuid)->>'pagamento_informado')::boolean THEN
    RAISE EXCEPTION 'TESTE_FALHOU: aviso de pagamento não aparece no acompanhamento.';
  END IF;

  -- Pedidos recusados: produto de outra confeitaria, fora do catálogo, inativo,
  -- antes da antecedência, entrega sem endereço, telefone inválido, quantidade inválida.
  FOR v IN SELECT * FROM (VALUES
    (jsonb_build_object('itens', jsonb_build_array(jsonb_build_object('produto_id', v_bolo_b, 'quantidade', 1)), 'tipo', 'retirada', 'data', v_amanha, 'tel', '19988887777', 'end', '')),
    (jsonb_build_object('itens', jsonb_build_array(jsonb_build_object('produto_id', v_fora, 'quantidade', 1)), 'tipo', 'retirada', 'data', v_amanha, 'tel', '19988887777', 'end', '')),
    (jsonb_build_object('itens', jsonb_build_array(jsonb_build_object('produto_id', v_inativo, 'quantidade', 1)), 'tipo', 'retirada', 'data', v_amanha, 'tel', '19988887777', 'end', '')),
    (jsonb_build_object('itens', jsonb_build_array(jsonb_build_object('produto_id', v_bolo_a, 'quantidade', 1)), 'tipo', 'retirada', 'data', to_char(public._hoje_confeitaria(), 'YYYY-MM-DD'), 'tel', '19988887777', 'end', '')),
    (jsonb_build_object('itens', jsonb_build_array(jsonb_build_object('produto_id', v_bolo_a, 'quantidade', 1)), 'tipo', 'entrega', 'data', v_amanha, 'tel', '19988887777', 'end', '')),
    (jsonb_build_object('itens', jsonb_build_array(jsonb_build_object('produto_id', v_bolo_a, 'quantidade', 1)), 'tipo', 'retirada', 'data', v_amanha, 'tel', '123', 'end', '')),
    (jsonb_build_object('itens', jsonb_build_array(jsonb_build_object('produto_id', v_bolo_a, 'quantidade', -1)), 'tipo', 'retirada', 'data', v_amanha, 'tel', '19988887777', 'end', '')),
    (jsonb_build_object('itens', '[]'::jsonb, 'tipo', 'retirada', 'data', v_amanha, 'tel', '19988887777', 'end', ''))
  ) AS casos(v)
  LOOP
    BEGIN
      PERFORM public.criar_pedido_catalogo('doces-da-a', gen_random_uuid(),
        jsonb_build_object('nome', 'Teste', 'telefone', v->>'tel', 'endereco', v->>'end'),
        jsonb_build_object('tipo', v->>'tipo', 'data', v->>'data'),
        v->'itens');
      RAISE EXCEPTION 'TESTE_FALHOU: pedido inválido aceito: %', v;
    EXCEPTION WHEN OTHERS THEN
      IF SQLERRM NOT LIKE 'CATALOGO:%' THEN RAISE; END IF;
    END;
  END LOOP;

  -- Capacidade diária (3): já há 1 pedido para amanhã; mais 2 cabem, o próximo não.
  PERFORM public.criar_pedido_catalogo('doces-da-a', gen_random_uuid(),
    jsonb_build_object('nome', 'Ana', 'telefone', '11977776666'), jsonb_build_object('tipo', 'retirada', 'data', v_amanha),
    jsonb_build_array(jsonb_build_object('produto_id', v_bolo_a, 'quantidade', 1)));
  PERFORM public.criar_pedido_catalogo('doces-da-a', gen_random_uuid(),
    jsonb_build_object('nome', 'Ana', 'telefone', '11977776666'), jsonb_build_object('tipo', 'retirada', 'data', v_amanha),
    jsonb_build_array(jsonb_build_object('produto_id', v_bolo_a, 'quantidade', 1)));
  BEGIN
    PERFORM public.criar_pedido_catalogo('doces-da-a', gen_random_uuid(),
      jsonb_build_object('nome', 'Ana', 'telefone', '11977776666'), jsonb_build_object('tipo', 'retirada', 'data', v_amanha),
      jsonb_build_array(jsonb_build_object('produto_id', v_bolo_a, 'quantidade', 1)));
    RAISE EXCEPTION 'TESTE_FALHOU: capacidade diária ultrapassada.';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE 'CATALOGO: não há mais vagas%' THEN RAISE; END IF;
  END;

  -- Limite por WhatsApp: no máximo 5 pedidos em 24h (Ana já tem 2).
  FOR i IN 2..4 LOOP
    PERFORM public.criar_pedido_catalogo('doces-da-a', gen_random_uuid(),
      jsonb_build_object('nome', 'Ana', 'telefone', '+55 11 97777-6666'), jsonb_build_object('tipo', 'retirada', 'data', to_char(public._hoje_confeitaria() + i, 'YYYY-MM-DD')),
      jsonb_build_array(jsonb_build_object('produto_id', v_bolo_a, 'quantidade', 1)));
  END LOOP;
  BEGIN
    PERFORM public.criar_pedido_catalogo('doces-da-a', gen_random_uuid(),
      jsonb_build_object('nome', 'Ana', 'telefone', '11977776666'), jsonb_build_object('tipo', 'retirada', 'data', to_char(public._hoje_confeitaria() + 9, 'YYYY-MM-DD')),
      jsonb_build_array(jsonb_build_object('produto_id', v_bolo_a, 'quantidade', 1)));
    RAISE EXCEPTION 'TESTE_FALHOU: limite por WhatsApp ultrapassado.';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE 'CATALOGO: muitos pedidos deste WhatsApp%' THEN RAISE; END IF;
  END;
END $t$;
RESET ROLE;

-- Conferência no banco ---------------------------------------------------------
DO $t$
DECLARE
  ua uuid := 'a1111111-1111-4111-8111-111111111111';
  ub uuid := 'b2222222-2222-4222-8222-222222222222';
  v_pedido public.pedidos%ROWTYPE;
BEGIN
  SELECT * INTO v_pedido FROM public.pedidos WHERE observacoes LIKE '%Maria Souza%';
  IF v_pedido.user_id <> ua OR v_pedido.origem <> 'catalogo' OR v_pedido.taxa_entrega <> 10
     OR v_pedido.tipo_entrega <> 'entrega' OR v_pedido.hora_entrega <> '15:00' OR v_pedido.visualizado_em IS NOT NULL
     OR v_pedido.pagamento_informado_em IS NULL OR v_pedido.status <> 'recebido' THEN
    RAISE EXCEPTION 'TESTE_FALHOU: pedido do catálogo gravado incorretamente.';
  END IF;
  -- Preço do servidor (50, não 0,01) e custo calculado da receita (500 g de farinha a R$ 10/kg = R$ 5).
  IF (SELECT count(*) FROM public.pedido_itens WHERE pedido_id = v_pedido.id) <> 1
     OR (SELECT preco_unitario FROM public.pedido_itens WHERE pedido_id = v_pedido.id) <> 50
     OR (SELECT quantidade FROM public.pedido_itens WHERE pedido_id = v_pedido.id) <> 2
     OR (SELECT custo_unitario FROM public.pedido_itens WHERE pedido_id = v_pedido.id) <> 5
     OR (SELECT user_id FROM public.pedido_itens WHERE pedido_id = v_pedido.id) <> ua THEN
    RAISE EXCEPTION 'TESTE_FALHOU: itens do pedido com preço, custo ou dono incorretos.';
  END IF;
  -- Cliente criado na confeitaria A e reaproveitado pelo telefone (Ana: um único cadastro).
  IF (SELECT count(*) FROM public.clientes WHERE user_id = ua AND nome = 'Maria Souza' AND telefone = '19988887777') <> 1
     OR (SELECT count(*) FROM public.clientes WHERE user_id = ua AND nome = 'Ana') <> 1 THEN
    RAISE EXCEPTION 'TESTE_FALHOU: cadastro de clientes do catálogo incorreto.';
  END IF;
  IF EXISTS (SELECT 1 FROM public.pedidos WHERE user_id = ub) OR EXISTS (SELECT 1 FROM public.clientes WHERE user_id = ub) THEN
    RAISE EXCEPTION 'TESTE_FALHOU: pedido do catálogo da A caiu na B.';
  END IF;
END $t$;

-- A confeitaria B (logada) não vê os pedidos do catálogo da A.
SELECT set_config('request.jwt.claim.sub', 'b2222222-2222-4222-8222-222222222222', true);
SET LOCAL ROLE authenticated;
DO $t$
BEGIN
  IF EXISTS (SELECT 1 FROM public.pedidos) THEN RAISE EXCEPTION 'TESTE_FALHOU: B viu pedidos da A.'; END IF;
END $t$;
RESET ROLE;

-- Catálogo desativado deixa de responder e de aceitar pedidos.
UPDATE public.confeitarias SET catalogo_ativo = false WHERE slug = 'doces-da-a';
SET LOCAL ROLE anon;
DO $t$
BEGIN
  IF public.catalogo_publico('doces-da-a') IS NOT NULL THEN RAISE EXCEPTION 'TESTE_FALHOU: catálogo desativado ainda responde.'; END IF;
END $t$;
RESET ROLE;

ROLLBACK;
