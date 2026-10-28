\set ON_ERROR_STOP on
-- Fotos e vídeos por produto, endereços reservados e link curto do pedido.
BEGIN;

UPDATE public.plataforma_config SET cadastro_aberto = true, aprovacao_manual = false;
INSERT INTO auth.users(id) VALUES
  ('a1111111-1111-4111-8111-111111111111'),
  ('b2222222-2222-4222-8222-222222222222');

-- Endereço igual a uma página do sistema é recusado.
DO $t$
BEGIN
  BEGIN
    UPDATE public.confeitarias SET slug = 'painel' WHERE user_id = 'a1111111-1111-4111-8111-111111111111';
    RAISE EXCEPTION 'TESTE_FALHOU: endereço reservado aceito.';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
END $t$;

UPDATE public.confeitarias SET slug = 'casaldobolo', catalogo_ativo = true
WHERE user_id = 'a1111111-1111-4111-8111-111111111111';

-- A dona cadastra o produto e as mídias.
SELECT set_config('request.jwt.claim.sub', 'a1111111-1111-4111-8111-111111111111', true);
SET LOCAL ROLE authenticated;
DO $t$
DECLARE
  v_produto uuid;
  v_capa text;
BEGIN
  INSERT INTO public.produtos(nome, rendimento, preco_venda, no_catalogo, antecedencia_dias)
  VALUES ('Bolo com fotos', 1, 40, true, 0) RETURNING id INTO v_produto;
  PERFORM set_config('teste.produto', v_produto::text, true);

  PERFORM public.salvar_midias_produto(v_produto, jsonb_build_array(
    jsonb_build_object('tipo', 'video', 'url', 'https://exemplo.test/v.mp4'),
    jsonb_build_object('tipo', 'imagem', 'url', 'https://exemplo.test/1.jpg'),
    jsonb_build_object('tipo', 'imagem', 'url', 'https://exemplo.test/2.jpg')));
  SELECT imagem_url INTO v_capa FROM public.produtos WHERE id = v_produto;
  IF v_capa IS DISTINCT FROM 'https://exemplo.test/1.jpg' THEN
    RAISE EXCEPTION 'TESTE_FALHOU: a capa deveria ser a primeira foto, veio %', v_capa;
  END IF;
  IF (SELECT string_agg(tipo || ':' || ordem, ',' ORDER BY ordem) FROM public.produto_midias WHERE produto_id = v_produto)
     <> 'video:0,imagem:1,imagem:2' THEN
    RAISE EXCEPTION 'TESTE_FALHOU: ordem das mídias incorreta.';
  END IF;

  -- Salvar de novo substitui a lista (sem duplicar).
  PERFORM public.salvar_midias_produto(v_produto, jsonb_build_array(
    jsonb_build_object('tipo', 'imagem', 'url', 'https://exemplo.test/2.jpg'),
    jsonb_build_object('tipo', 'video', 'url', 'https://exemplo.test/v.mp4')));
  IF (SELECT count(*) FROM public.produto_midias WHERE produto_id = v_produto) <> 2
     OR (SELECT imagem_url FROM public.produtos WHERE id = v_produto) <> 'https://exemplo.test/2.jpg' THEN
    RAISE EXCEPTION 'TESTE_FALHOU: substituição das mídias incorreta.';
  END IF;

  BEGIN
    PERFORM public.salvar_midias_produto(v_produto, (SELECT jsonb_agg(jsonb_build_object('tipo', 'imagem', 'url', 'https://exemplo.test/' || g || '.jpg')) FROM generate_series(1, 11) g));
    RAISE EXCEPTION 'TESTE_FALHOU: aceitou mais de 10 mídias.';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE 'TESTE_FALHOU%' THEN RAISE; END IF;
  END;
  BEGIN
    PERFORM public.salvar_midias_produto(v_produto, jsonb_build_array(jsonb_build_object('tipo', 'imagem', 'url', 'javascript:alert(1)')));
    RAISE EXCEPTION 'TESTE_FALHOU: aceitou endereço que não é https.';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE 'TESTE_FALHOU%' THEN RAISE; END IF;
  END;
END $t$;
RESET ROLE;

-- Outra confeitaria não vê nem altera as mídias da A.
SELECT set_config('request.jwt.claim.sub', 'b2222222-2222-4222-8222-222222222222', true);
SET LOCAL ROLE authenticated;
DO $t$
BEGIN
  IF EXISTS (SELECT 1 FROM public.produto_midias) THEN RAISE EXCEPTION 'TESTE_FALHOU: B viu mídias da A.'; END IF;
  BEGIN
    PERFORM public.salvar_midias_produto(current_setting('teste.produto')::uuid, '[]'::jsonb);
    RAISE EXCEPTION 'TESTE_FALHOU: B alterou mídias da A.';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE 'TESTE_FALHOU%' THEN RAISE; END IF;
  END;
  BEGIN
    INSERT INTO public.produto_midias(produto_id, tipo, url) VALUES (current_setting('teste.produto')::uuid, 'imagem', 'https://x.test/a.jpg');
    RAISE EXCEPTION 'TESTE_FALHOU: B inseriu mídia no produto da A.';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE 'TESTE_FALHOU%' THEN RAISE; END IF;
  END;
END $t$;
RESET ROLE;

-- Visitante: catálogo com mídias, pedido com código curto e acompanhamento pelo link curto.
SELECT set_config('request.jwt.claim.sub', '', true);
SET LOCAL ROLE anon;
DO $t$
DECLARE
  v jsonb;
  v_pedido jsonb;
  v_curto text;
BEGIN
  BEGIN
    PERFORM count(*) FROM public.produto_midias;
    RAISE EXCEPTION 'TESTE_FALHOU: visitante leu a tabela de mídias.';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;

  v := public.catalogo_publico('casaldobolo');
  IF jsonb_array_length(v->'produtos'->0->'midias') <> 2
     OR v->'produtos'->0->'midias'->0->>'url' <> 'https://exemplo.test/2.jpg'
     OR v->'produtos'->0->'midias'->1->>'tipo' <> 'video' THEN
    RAISE EXCEPTION 'TESTE_FALHOU: mídias do catálogo incorretas: %', v->'produtos';
  END IF;

  v_pedido := public.criar_pedido_catalogo('casaldobolo', gen_random_uuid(),
    jsonb_build_object('nome', 'Joana', 'telefone', '19977778888'),
    jsonb_build_object('tipo', 'retirada', 'data', to_char(public._hoje_confeitaria(), 'YYYY-MM-DD')),
    jsonb_build_array(jsonb_build_object('produto_id', current_setting('teste.produto'), 'quantidade', 1)));
  v_curto := public.codigo_curto_pedido((v_pedido->>'codigo')::uuid);
  IF v_curto IS NULL OR v_curto !~ '^[a-z2-9]{10}$' THEN RAISE EXCEPTION 'TESTE_FALHOU: código curto inválido: %', v_curto; END IF;

  IF public.pedido_publico(v_curto) IS DISTINCT FROM public.pedido_publico(v_pedido->>'codigo')
     OR (public.pedido_publico(upper(v_curto))->>'total')::numeric <> 40 THEN
    RAISE EXCEPTION 'TESTE_FALHOU: link curto e link longo divergem.';
  END IF;
  IF public.pedido_publico('aaaaaaaaaa') IS NOT NULL OR public.pedido_publico('x''; drop table pedidos; --') IS NOT NULL THEN
    RAISE EXCEPTION 'TESTE_FALHOU: código inexistente retornou pedido.';
  END IF;
  IF NOT public.informar_pagamento_pedido(v_curto) THEN
    RAISE EXCEPTION 'TESTE_FALHOU: aviso de pagamento pelo código curto não encontrou o pedido.';
  END IF;
  IF NOT (public.pedido_publico(v_curto)->>'pagamento_informado')::boolean THEN
    RAISE EXCEPTION 'TESTE_FALHOU: aviso de pagamento pelo código curto.';
  END IF;
END $t$;
RESET ROLE;

-- Pedido manual não recebe código público.
DO $t$
DECLARE v_id uuid;
BEGIN
  INSERT INTO public.pedidos(user_id, data_entrega) VALUES ('a1111111-1111-4111-8111-111111111111', current_date) RETURNING id INTO v_id;
  IF (SELECT codigo_curto FROM public.pedidos WHERE id = v_id) IS NOT NULL THEN
    RAISE EXCEPTION 'TESTE_FALHOU: pedido manual recebeu código curto.';
  END IF;
END $t$;

ROLLBACK;
