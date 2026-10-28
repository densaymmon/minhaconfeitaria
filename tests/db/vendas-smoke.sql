\set ON_ERROR_STOP on
-- Vendas pelo catálogo: limite por produto/dia, janela de venda, kits, sinal, fidelidade e avaliação.
BEGIN;

UPDATE public.plataforma_config SET cadastro_aberto = true, aprovacao_manual = false;
INSERT INTO auth.users(id) VALUES ('a1111111-1111-4111-8111-111111111111'), ('b2222222-2222-4222-8222-222222222222');

CREATE FUNCTION pg_temp.pedido_por_codigo(c text) RETURNS public.pedidos LANGUAGE sql SECURITY DEFINER AS
  $$ SELECT * FROM public.pedidos WHERE codigo_publico = c::uuid $$;
CREATE TEMP TABLE ctx (chave text PRIMARY KEY, valor text);
GRANT ALL ON ctx TO anon, authenticated;
INSERT INTO ctx VALUES ('data', (public._hoje_confeitaria() + 5)::text);

SELECT set_config('request.jwt.claim.sub', 'a1111111-1111-4111-8111-111111111111', true);
SET LOCAL ROLE authenticated;
DO $t$
DECLARE
  bolo uuid; brig uuid; kit uuid; pascoa uuid; velho uuid;
BEGIN
  UPDATE public.confeitarias SET nome = 'Doces da A', slug = 'doces-a', catalogo_ativo = true, aceita_retirada = true,
    sinal_percentual = 50, sinal_a_partir_de = 100, fidelidade_a_cada = 2, fidelidade_tipo = 'percentual', fidelidade_valor = 10;
  INSERT INTO public.produtos(nome, rendimento, preco_venda, no_catalogo, limite_dia, custo_mao_obra) VALUES ('Bolo de pote', 1, 20, true, 3, 4) RETURNING id INTO bolo;
  INSERT INTO public.produtos(nome, rendimento, preco_venda, no_catalogo, custo_mao_obra) VALUES ('Brigadeiro', 10, 3, true, 5) RETURNING id INTO brig;
  INSERT INTO public.produtos(nome, rendimento, preco_venda, no_catalogo, componentes)
    VALUES ('Kit festa', 1, 60, true, jsonb_build_array(jsonb_build_object('produto_id', bolo, 'quantidade', 2), jsonb_build_object('produto_id', brig, 'quantidade', 10)))
    RETURNING id INTO kit;
  INSERT INTO public.produtos(nome, rendimento, preco_venda, no_catalogo, venda_de, venda_ate)
    VALUES ('Ovo de Páscoa', 1, 80, true, public._hoje_confeitaria() + 30, public._hoje_confeitaria() + 60) RETURNING id INTO pascoa;
  INSERT INTO public.produtos(nome, rendimento, preco_venda, no_catalogo, venda_ate)
    VALUES ('Panetone 2025', 1, 50, true, public._hoje_confeitaria() - 1) RETURNING id INTO velho;
  INSERT INTO ctx VALUES ('bolo', bolo), ('kit', kit), ('pascoa', pascoa), ('velho', velho);

  -- Kits: sem kit dentro de kit, sem repetir, sem ele mesmo, sem produto de outra confeitaria.
  BEGIN
    UPDATE public.produtos SET componentes = jsonb_build_array(jsonb_build_object('produto_id', kit, 'quantidade', 1)) WHERE id = pascoa;
    RAISE EXCEPTION 'TESTE_FALHOU: kit dentro de kit.';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM NOT LIKE 'KIT:%' THEN RAISE; END IF; END;
  BEGIN
    UPDATE public.produtos SET componentes = jsonb_build_array(jsonb_build_object('produto_id', pascoa, 'quantidade', 1)) WHERE id = bolo;
    RAISE EXCEPTION 'TESTE_FALHOU: componente virou kit.';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM NOT LIKE 'KIT: este produto faz parte de outro kit%' THEN RAISE; END IF; END;
  BEGIN
    UPDATE public.produtos SET componentes = jsonb_build_array(jsonb_build_object('produto_id', brig, 'quantidade', 1), jsonb_build_object('produto_id', brig, 'quantidade', 2)) WHERE id = pascoa;
    RAISE EXCEPTION 'TESTE_FALHOU: componente repetido.';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM NOT LIKE 'KIT:%duas vezes%' THEN RAISE; END IF; END;
  BEGIN
    UPDATE public.produtos SET limite_dia = 0 WHERE id = bolo;
    RAISE EXCEPTION 'TESTE_FALHOU: limite zero aceito.';
  EXCEPTION WHEN check_violation THEN NULL; END;
  BEGIN
    UPDATE public.confeitarias SET sinal_percentual = 120;
    RAISE EXCEPTION 'TESTE_FALHOU: sinal acima de 100%%.';
  EXCEPTION WHEN check_violation THEN NULL; END;
END $t$;
RESET ROLE;

-- Custo do kit = 2 × custo do bolo (4) + 10 × custo do brigadeiro (0,5) = 13.
DO $t$ BEGIN
  IF public._custo_unitario_produto((SELECT valor FROM ctx WHERE chave = 'kit')::uuid, 'a1111111-1111-4111-8111-111111111111') <> 13 THEN
    RAISE EXCEPTION 'TESTE_FALHOU: custo do kit = %', public._custo_unitario_produto((SELECT valor FROM ctx WHERE chave = 'kit')::uuid, 'a1111111-1111-4111-8111-111111111111');
  END IF;
  IF public._custo_unitario_produto((SELECT valor FROM ctx WHERE chave = 'bolo')::uuid, 'a1111111-1111-4111-8111-111111111111') <> 4 THEN
    RAISE EXCEPTION 'TESTE_FALHOU: custo de produto comum mudou.';
  END IF;
END $t$;

SET LOCAL ROLE anon;
DO $t$
DECLARE
  cat jsonb := public.catalogo_publico('doces-a');
  dia date := (SELECT valor FROM ctx WHERE chave = 'data')::date;
  bolo uuid := (SELECT valor FROM ctx WHERE chave = 'bolo')::uuid;
  kit uuid := (SELECT valor FROM ctx WHERE chave = 'kit')::uuid;
  r jsonb;
  p public.pedidos%ROWTYPE;
  nomes text;
BEGIN
  SELECT string_agg(x->>'nome', ',' ORDER BY x->>'nome') INTO nomes FROM jsonb_array_elements(cat->'produtos') x;
  IF nomes <> 'Bolo de pote,Brigadeiro,Kit festa' THEN RAISE EXCEPTION 'TESTE_FALHOU: janela de venda: %', nomes; END IF;
  IF (SELECT jsonb_array_length(x->'componentes') FROM jsonb_array_elements(cat->'produtos') x WHERE x->>'nome' = 'Kit festa') <> 2
     OR (SELECT x->>'limite_dia' FROM jsonb_array_elements(cat->'produtos') x WHERE x->>'nome' = 'Bolo de pote') <> '3'
     OR (cat->'fidelidade'->>'a_cada') <> '2' OR (cat->>'sinal_percentual')::numeric <> 50 THEN
    RAISE EXCEPTION 'TESTE_FALHOU: campos do catálogo: %', cat - 'produtos';
  END IF;

  -- Produto fora da janela não é vendido.
  BEGIN
    PERFORM public.criar_pedido_catalogo('doces-a', gen_random_uuid(), '{"nome":"Ana","telefone":"19999990001"}',
      jsonb_build_object('tipo', 'retirada', 'data', dia), jsonb_build_array(jsonb_build_object('produto_id', (SELECT valor FROM ctx WHERE chave = 'pascoa'), 'quantidade', 1)));
    RAISE EXCEPTION 'TESTE_FALHOU: vendeu fora da janela.';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE 'CATALOGO: um dos produtos não está mais disponível%' THEN RAISE; END IF; END;

  -- Limite: 3 bolos por dia.
  r := public.criar_pedido_catalogo('doces-a', gen_random_uuid(), '{"nome":"Ana","telefone":"19999990001"}',
    jsonb_build_object('tipo', 'retirada', 'data', dia), jsonb_build_array(jsonb_build_object('produto_id', bolo, 'quantidade', 2)));
  p := pg_temp.pedido_por_codigo(r->>'codigo');
  IF p.sinal_valor <> 0 OR p.fidelidade THEN RAISE EXCEPTION 'TESTE_FALHOU: sinal abaixo do mínimo/fidelidade no 1º pedido.'; END IF;
  INSERT INTO ctx VALUES ('pedido1', r->>'codigo');
  BEGIN
    PERFORM public.criar_pedido_catalogo('doces-a', gen_random_uuid(), '{"nome":"Bia","telefone":"19999990002"}',
      jsonb_build_object('tipo', 'retirada', 'data', dia), jsonb_build_array(jsonb_build_object('produto_id', bolo, 'quantidade', 2)));
    RAISE EXCEPTION 'TESTE_FALHOU: passou do limite do dia.';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE 'CATALOGO: Bolo de pote esgotou para %restam 1 unidade(s)%' THEN RAISE; END IF; END;
  IF (SELECT x->'reservas'->>dia::text FROM jsonb_array_elements(public.catalogo_publico('doces-a')->'produtos') x WHERE x->>'nome' = 'Bolo de pote') <> '2' THEN
    RAISE EXCEPTION 'TESTE_FALHOU: reservas no catálogo.';
  END IF;
  -- Outra data tem limite próprio.
  PERFORM public.criar_pedido_catalogo('doces-a', gen_random_uuid(), '{"nome":"Bia","telefone":"19999990002"}',
    jsonb_build_object('tipo', 'retirada', 'data', dia + 1), jsonb_build_array(jsonb_build_object('produto_id', bolo, 'quantidade', 3)));

  -- Kit de 60 + ... : sinal de 50%% a partir de R$ 100; 2º pedido da Ana ganha 10%% (fidelidade a cada 2).
  r := public.criar_pedido_catalogo('doces-a', gen_random_uuid(), '{"nome":"Ana","telefone":"19999990001"}',
    jsonb_build_object('tipo', 'retirada', 'data', dia + 2), jsonb_build_array(jsonb_build_object('produto_id', kit, 'quantidade', 2)));
  p := pg_temp.pedido_por_codigo(r->>'codigo');
  IF p.desconto <> 0 OR p.fidelidade THEN RAISE EXCEPTION 'TESTE_FALHOU: fidelidade antes da hora: %', to_jsonb(p); END IF;
  IF p.sinal_valor <> 60 THEN RAISE EXCEPTION 'TESTE_FALHOU: sinal = %', p.sinal_valor; END IF;
  IF (public.progresso_fidelidade('doces-a', '(19) 99999-0001')->>'ganha_agora')::boolean IS NOT TRUE THEN
    RAISE EXCEPTION 'TESTE_FALHOU: progresso da fidelidade: %', public.progresso_fidelidade('doces-a', '19999990001');
  END IF;
  r := public.criar_pedido_catalogo('doces-a', gen_random_uuid(), '{"nome":"Ana","telefone":"19999990001"}',
    jsonb_build_object('tipo', 'retirada', 'data', dia + 3), jsonb_build_array(jsonb_build_object('produto_id', kit, 'quantidade', 1)));
  p := pg_temp.pedido_por_codigo(r->>'codigo');
  IF NOT p.fidelidade OR p.desconto <> 6 OR p.observacoes NOT LIKE '%Fidelidade: desconto de R$ 6,00%' THEN
    RAISE EXCEPTION 'TESTE_FALHOU: fidelidade no 3º pedido: % %', p.desconto, p.observacoes;
  END IF;
  IF (public.progresso_fidelidade('doces-a', '19999990001')->>'faltam')::int <> 1 THEN RAISE EXCEPTION 'TESTE_FALHOU: faltam.'; END IF;

  -- Avaliação: só depois da entrega.
  BEGIN
    PERFORM public.avaliar_pedido((SELECT valor FROM ctx WHERE chave = 'pedido1'), 5, 'Ótimo');
    RAISE EXCEPTION 'TESTE_FALHOU: avaliou antes da entrega.';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE 'CATALOGO: a avaliação abre depois da entrega%' THEN RAISE; END IF; END;
  IF (public.acompanhar_pedido_catalogo((SELECT valor FROM ctx WHERE chave = 'pedido1')::uuid)->>'pode_avaliar')::boolean THEN
    RAISE EXCEPTION 'TESTE_FALHOU: pode_avaliar antes da entrega.';
  END IF;
END $t$;
RESET ROLE;

SELECT set_config('request.jwt.claim.sub', 'a1111111-1111-4111-8111-111111111111', true);
SET LOCAL ROLE authenticated;
UPDATE public.pedidos SET status = 'entregue' WHERE codigo_publico = (SELECT valor FROM ctx WHERE chave = 'pedido1')::uuid;
RESET ROLE;

SET LOCAL ROLE anon;
DO $t$
DECLARE
  cod uuid := (SELECT valor FROM ctx WHERE chave = 'pedido1')::uuid;
  a jsonb;
BEGIN
  IF NOT (public.acompanhar_pedido_catalogo(cod)->>'pode_avaliar')::boolean THEN RAISE EXCEPTION 'TESTE_FALHOU: não abriu a avaliação.'; END IF;
  BEGIN PERFORM public.avaliar_pedido(cod::text, 6, NULL); RAISE EXCEPTION 'TESTE_FALHOU: nota 6.';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE 'CATALOGO: escolha de 1 a 5%' THEN RAISE; END IF; END;
  PERFORM public.avaliar_pedido((SELECT codigo_curto FROM pg_temp.pedido_por_codigo(cod::text)), 5, '  Bolo maravilhoso!  ');
  BEGIN PERFORM public.avaliar_pedido(cod::text, 1, 'de novo'); RAISE EXCEPTION 'TESTE_FALHOU: avaliou duas vezes.';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE 'CATALOGO: este pedido já foi avaliado%' THEN RAISE; END IF; END;
  a := public.catalogo_publico('doces-a')->'avaliacoes';
  IF (a->>'media')::numeric <> 5 OR (a->>'total')::int <> 1 OR a->'ultimas'->0->>'comentario' <> 'Bolo maravilhoso!' OR a->'ultimas'->0->>'cliente' <> 'Ana' THEN
    RAISE EXCEPTION 'TESTE_FALHOU: avaliações no catálogo: %', a;
  END IF;
  IF (public.acompanhar_pedido_catalogo(cod)->'avaliacao'->>'nota') <> '5' THEN RAISE EXCEPTION 'TESTE_FALHOU: avaliação no acompanhamento.'; END IF;
  BEGIN PERFORM 1 FROM public.avaliacoes; RAISE EXCEPTION 'TESTE_FALHOU: anônimo leu avaliações.';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $t$;
RESET ROLE;

-- Dona esconde a avaliação; B não vê as avaliações da A.
SELECT set_config('request.jwt.claim.sub', 'a1111111-1111-4111-8111-111111111111', true);
SET LOCAL ROLE authenticated;
UPDATE public.avaliacoes SET publicada = false;
DO $t$ BEGIN
  BEGIN UPDATE public.avaliacoes SET nota = 1; RAISE EXCEPTION 'TESTE_FALHOU: dona alterou a nota.';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $t$;
RESET ROLE;
DO $t$ BEGIN
  IF public.catalogo_publico('doces-a')->'avaliacoes' <> 'null'::jsonb THEN RAISE EXCEPTION 'TESTE_FALHOU: avaliação escondida apareceu.'; END IF;
END $t$;
SELECT set_config('request.jwt.claim.sub', 'b2222222-2222-4222-8222-222222222222', true);
SET LOCAL ROLE authenticated;
DO $t$ BEGIN
  IF (SELECT count(*) FROM public.avaliacoes) <> 0 THEN RAISE EXCEPTION 'TESTE_FALHOU: B viu avaliações da A.'; END IF;
  BEGIN
    INSERT INTO public.produtos(nome, rendimento, preco_venda, componentes)
    VALUES ('Kit da B', 1, 10, jsonb_build_array(jsonb_build_object('produto_id', (SELECT valor FROM ctx WHERE chave = 'bolo'), 'quantidade', 1)));
    RAISE EXCEPTION 'TESTE_FALHOU: kit com produto de outra confeitaria.';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM NOT LIKE 'KIT: produto do kit não encontrado%' THEN RAISE; END IF; END;
END $t$;
RESET ROLE;

ROLLBACK;
