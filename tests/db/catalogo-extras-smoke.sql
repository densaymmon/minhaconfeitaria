\set ON_ERROR_STOP on
-- Catálogo completo: agenda (dias fechados, datas bloqueadas, horários de retirada),
-- cor/logo, taxa por bairro, cupons e encomenda personalizada.
BEGIN;

UPDATE public.plataforma_config SET cadastro_aberto = true, aprovacao_manual = false;
INSERT INTO auth.users(id) VALUES ('a1111111-1111-4111-8111-111111111111'), ('b2222222-2222-4222-8222-222222222222');

-- Datas de teste: um dia útil livre, um domingo e uma data bloqueada.
CREATE TEMP TABLE datas_teste AS
SELECT
  (SELECT d::date FROM generate_series(public._hoje_confeitaria() + 4, public._hoje_confeitaria() + 20, interval '1 day') d
   WHERE extract(dow FROM d) NOT IN (0) LIMIT 1) AS livre,
  (SELECT d::date FROM generate_series(public._hoje_confeitaria() + 1, public._hoje_confeitaria() + 14, interval '1 day') d
   WHERE extract(dow FROM d) = 0 LIMIT 1) AS domingo,
  (SELECT d::date FROM generate_series(public._hoje_confeitaria() + 1, public._hoje_confeitaria() + 3, interval '1 day') d
   WHERE extract(dow FROM d) <> 0 LIMIT 1) AS bloqueada;
GRANT SELECT ON datas_teste TO anon, authenticated;

-- Auxiliares de teste: o anônimo não lê pedidos diretamente.
CREATE FUNCTION pg_temp.pedido_por_codigo(c text) RETURNS public.pedidos LANGUAGE sql SECURITY DEFINER AS
  $$ SELECT * FROM public.pedidos WHERE codigo_publico = c::uuid $$;
CREATE FUNCTION pg_temp.qtd_itens(id uuid) RETURNS bigint LANGUAGE sql SECURITY DEFINER AS
  $$ SELECT count(*) FROM public.pedido_itens WHERE pedido_id = id $$;

SELECT set_config('request.jwt.claim.sub', 'a1111111-1111-4111-8111-111111111111', true);
SET LOCAL ROLE authenticated;
DO $t$
BEGIN
  UPDATE public.confeitarias SET nome = 'Doces da A', slug = 'doces-a', catalogo_ativo = true, aceita_retirada = true, aceita_entrega = true,
    taxa_entrega = 10, dias_fechados = '{0}', datas_bloqueadas = ARRAY[(SELECT bloqueada FROM datas_teste)],
    horarios_retirada = '{10:00,15:00}', taxas_bairro = '[{"bairro": "Centro", "taxa": 5}, {"bairro": "Jardim Sul", "taxa": 12}]',
    aceita_encomenda = true, cor_primaria = '#AA3344';
  INSERT INTO public.produtos(nome, rendimento, preco_venda, no_catalogo) VALUES ('Bolo', 1, 50, true);
  BEGIN
    UPDATE public.confeitarias SET cor_primaria = 'vermelho';
    RAISE EXCEPTION 'TESTE_FALHOU: aceitou cor inválida.';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  BEGIN
    UPDATE public.confeitarias SET taxas_bairro = '[{"bairro": "Centro", "taxa": 5}, {"bairro": "centro", "taxa": 6}]';
    RAISE EXCEPTION 'TESTE_FALHOU: aceitou bairro repetido.';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  BEGIN
    UPDATE public.confeitarias SET horarios_retirada = '{25:00}';
    RAISE EXCEPTION 'TESTE_FALHOU: aceitou horário inválido.';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  INSERT INTO public.cupons(codigo, tipo, valor, pedido_minimo, primeira_compra) VALUES ('PROMO10', 'percentual', 10, 40, true);
  INSERT INTO public.cupons(codigo, tipo, valor, limite_usos) VALUES ('FIXO5', 'valor', 5, 1);
  INSERT INTO public.cupons(codigo, tipo, valor, valido_ate) VALUES ('VENCIDO', 'valor', 5, public._hoje_confeitaria() - 1);
  BEGIN
    INSERT INTO public.cupons(codigo, tipo, valor) VALUES ('MEIO', 'percentual', 150);
    RAISE EXCEPTION 'TESTE_FALHOU: aceitou 150%%.';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
END $t$;
RESET ROLE;

-- B não vê os cupons da A.
SELECT set_config('request.jwt.claim.sub', 'b2222222-2222-4222-8222-222222222222', true);
SET LOCAL ROLE authenticated;
DO $t$ BEGIN
  IF (SELECT count(*) FROM public.cupons) <> 0 THEN RAISE EXCEPTION 'TESTE_FALHOU: B viu cupons da A.'; END IF;
END $t$;
RESET ROLE;

SET LOCAL ROLE anon;
DO $t$
DECLARE
  cat jsonb := public.catalogo_publico('doces-a');
  livre date := (SELECT livre FROM datas_teste);
  produto uuid := (cat->'produtos'->0->>'id')::uuid;
  r jsonb;
  p public.pedidos%ROWTYPE;
BEGIN
  IF cat->>'cor' <> '#AA3344' OR jsonb_array_length(cat->'bairros') <> 2 OR cat->'horarios_retirada' <> '["10:00", "15:00"]'::jsonb
     OR cat->'dias_fechados' <> '[0]'::jsonb OR jsonb_array_length(cat->'datas_bloqueadas') <> 1 OR NOT (cat->>'aceita_encomenda')::boolean
     OR NOT (cat->>'tem_cupons')::boolean THEN
    RAISE EXCEPTION 'TESTE_FALHOU: catálogo sem os campos novos: %', cat;
  END IF;
  BEGIN PERFORM 1 FROM public.cupons; RAISE EXCEPTION 'TESTE_FALHOU: anônimo leu cupons.';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;

  -- Agenda.
  BEGIN
    PERFORM public.criar_pedido_catalogo('doces-a', gen_random_uuid(), '{"nome":"Ana","telefone":"19999990001"}',
      jsonb_build_object('tipo', 'retirada', 'data', (SELECT domingo FROM datas_teste), 'hora', '10:00'), jsonb_build_array(jsonb_build_object('produto_id', produto, 'quantidade', 1)));
    RAISE EXCEPTION 'TESTE_FALHOU: aceitou pedido em dia fechado.';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE 'CATALOGO: a confeitaria não atende neste dia%' THEN RAISE; END IF; END;
  BEGIN
    PERFORM public.criar_pedido_catalogo('doces-a', gen_random_uuid(), '{"nome":"Ana","telefone":"19999990001"}',
      jsonb_build_object('tipo', 'retirada', 'data', (SELECT bloqueada FROM datas_teste), 'hora', '10:00'), jsonb_build_array(jsonb_build_object('produto_id', produto, 'quantidade', 1)));
    RAISE EXCEPTION 'TESTE_FALHOU: aceitou data bloqueada.';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE 'CATALOGO: a confeitaria não atende em%' THEN RAISE; END IF; END;
  BEGIN
    PERFORM public.criar_pedido_catalogo('doces-a', gen_random_uuid(), '{"nome":"Ana","telefone":"19999990001"}',
      jsonb_build_object('tipo', 'retirada', 'data', livre, 'hora', '11:00'), jsonb_build_array(jsonb_build_object('produto_id', produto, 'quantidade', 1)));
    RAISE EXCEPTION 'TESTE_FALHOU: aceitou horário fora da lista.';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE 'CATALOGO: escolha um dos horários%' THEN RAISE; END IF; END;

  -- Bairro.
  BEGIN
    PERFORM public.criar_pedido_catalogo('doces-a', gen_random_uuid(), '{"nome":"Ana","telefone":"19999990001","endereco":"Rua A, 10"}',
      jsonb_build_object('tipo', 'entrega', 'data', livre, 'bairro', 'Bairro X'), jsonb_build_array(jsonb_build_object('produto_id', produto, 'quantidade', 1)));
    RAISE EXCEPTION 'TESTE_FALHOU: aceitou bairro fora da lista.';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE 'CATALOGO: escolha o bairro%' THEN RAISE; END IF; END;
  r := public.criar_pedido_catalogo('doces-a', gen_random_uuid(), '{"nome":"Ana","telefone":"19999990001","endereco":"Rua A, 10"}',
    jsonb_build_object('tipo', 'entrega', 'data', livre, 'bairro', ' jardim sul '), jsonb_build_array(jsonb_build_object('produto_id', produto, 'quantidade', 1)));
  p := pg_temp.pedido_por_codigo(r->>'codigo');
  IF p.taxa_entrega <> 12 OR p.endereco_entrega <> 'Rua A, 10 — Jardim Sul' THEN RAISE EXCEPTION 'TESTE_FALHOU: taxa por bairro: % %', p.taxa_entrega, p.endereco_entrega; END IF;

  -- Retirada em horário da lista funciona.
  PERFORM public.criar_pedido_catalogo('doces-a', gen_random_uuid(), '{"nome":"Bia","telefone":"19999990002"}',
    jsonb_build_object('tipo', 'retirada', 'data', livre, 'hora', '15:00'), jsonb_build_array(jsonb_build_object('produto_id', produto, 'quantidade', 1)));

  -- Cupons.
  r := public.validar_cupom_catalogo('doces-a', ' promo10 ', 100, '(19) 98888-0003');
  IF NOT (r->>'ok')::boolean OR (r->>'desconto')::numeric <> 10 THEN RAISE EXCEPTION 'TESTE_FALHOU: prévia do cupom: %', r; END IF;
  r := public.validar_cupom_catalogo('doces-a', 'PROMO10', 30, '19988880003');
  IF (r->>'ok')::boolean OR r->>'mensagem' NOT LIKE '%a partir de R$ 40,00%' THEN RAISE EXCEPTION 'TESTE_FALHOU: mínimo do cupom: %', r; END IF;
  r := public.validar_cupom_catalogo('doces-a', 'PROMO10', 100, '19999990001');
  IF (r->>'ok')::boolean OR r->>'mensagem' NOT LIKE '%primeira compra%' THEN RAISE EXCEPTION 'TESTE_FALHOU: primeira compra: %', r; END IF;
  r := public.validar_cupom_catalogo('doces-a', 'VENCIDO', 100, '19988880003');
  IF (r->>'ok')::boolean THEN RAISE EXCEPTION 'TESTE_FALHOU: cupom vencido aceito.'; END IF;
  r := public.validar_cupom_catalogo('doces-a', 'NAOEXISTE', 100, '19988880003');
  IF (r->>'ok')::boolean THEN RAISE EXCEPTION 'TESTE_FALHOU: cupom inexistente aceito.'; END IF;

  r := public.criar_pedido_catalogo('doces-a', gen_random_uuid(), '{"nome":"Caio","telefone":"19988880003"}',
    jsonb_build_object('tipo', 'retirada', 'data', livre, 'hora', '10:00', 'cupom', 'promo10'), jsonb_build_array(jsonb_build_object('produto_id', produto, 'quantidade', 2)));
  p := pg_temp.pedido_por_codigo(r->>'codigo');
  IF p.desconto <> 10 OR p.cupom_codigo <> 'PROMO10' OR p.observacoes NOT LIKE '%Cupom PROMO10: desconto de R$ 10,00%' THEN
    RAISE EXCEPTION 'TESTE_FALHOU: pedido com cupom: % % %', p.desconto, p.cupom_codigo, p.observacoes;
  END IF;
  BEGIN
    PERFORM public.criar_pedido_catalogo('doces-a', gen_random_uuid(), '{"nome":"Caio","telefone":"19988880003"}',
      jsonb_build_object('tipo', 'retirada', 'data', livre, 'hora', '10:00', 'cupom', 'PROMO10'), jsonb_build_array(jsonb_build_object('produto_id', produto, 'quantidade', 2)));
    RAISE EXCEPTION 'TESTE_FALHOU: cupom de primeira compra usado duas vezes.';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE 'CATALOGO: este cupom é só para a primeira compra%' THEN RAISE; END IF; END;

  PERFORM public.criar_pedido_catalogo('doces-a', gen_random_uuid(), '{"nome":"Davi","telefone":"19988880004"}',
    jsonb_build_object('tipo', 'retirada', 'data', livre, 'hora', '10:00', 'cupom', 'FIXO5'), jsonb_build_array(jsonb_build_object('produto_id', produto, 'quantidade', 1)));
  BEGIN
    PERFORM public.criar_pedido_catalogo('doces-a', gen_random_uuid(), '{"nome":"Eva","telefone":"19988880005"}',
      jsonb_build_object('tipo', 'retirada', 'data', livre, 'hora', '10:00', 'cupom', 'FIXO5'), jsonb_build_array(jsonb_build_object('produto_id', produto, 'quantidade', 1)));
    RAISE EXCEPTION 'TESTE_FALHOU: cupom passou do limite de usos.';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE 'CATALOGO: cupom inválido ou expirado%' THEN RAISE; END IF; END;

  -- Encomenda personalizada.
  BEGIN
    PERFORM public.criar_encomenda_catalogo('doces-a', gen_random_uuid(), '{"nome":"Fábio","telefone":"19988880006"}',
      jsonb_build_object('tipo', 'retirada', 'data', livre, 'hora', '10:00', 'descricao', 'bolo'));
    RAISE EXCEPTION 'TESTE_FALHOU: encomenda sem descrição aceita.';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE 'CATALOGO: descreva a encomenda%' THEN RAISE; END IF; END;
  BEGIN
    PERFORM public.criar_encomenda_catalogo('doces-a', gen_random_uuid(), '{"nome":"Fábio","telefone":"19988880006"}',
      jsonb_build_object('tipo', 'retirada', 'data', livre, 'hora', '10:00', 'descricao', 'Bolo do Homem-Aranha para 30 pessoas',
        'fotos', jsonb_build_array('https://evil.example/x.jpg')));
    RAISE EXCEPTION 'TESTE_FALHOU: foto de fora aceita.';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE 'CATALOGO: foto de referência inválida%' THEN RAISE; END IF; END;
  BEGIN
    PERFORM public.criar_encomenda_catalogo('doces-a', gen_random_uuid(), '{"nome":"Fábio","telefone":"19988880006"}',
      jsonb_build_object('tipo', 'retirada', 'data', livre, 'hora', '10:00', 'descricao', 'Bolo do Homem-Aranha para 30 pessoas',
        'fotos', jsonb_build_array('https://evil.example/storage/v1/object/public/catalogo/encomendas/doces-a/x.jpg')));
    RAISE EXCEPTION 'TESTE_FALHOU: foto de outro site aceita.';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE 'CATALOGO: foto de referência inválida%' THEN RAISE; END IF; END;
  BEGIN
    PERFORM public.criar_encomenda_catalogo('doces-a', gen_random_uuid(), '{"nome":"Fábio","telefone":"19988880006"}',
      jsonb_build_object('tipo', 'retirada', 'data', livre, 'hora', '10:00', 'descricao', 'Bolo do Homem-Aranha para 30 pessoas',
        'fotos', jsonb_build_array('https://x.supabase.co/storage/v1/object/public/catalogo/encomendas/outra-loja/x.jpg')));
    RAISE EXCEPTION 'TESTE_FALHOU: foto de outra confeitaria aceita.';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE 'CATALOGO: foto de referência inválida%' THEN RAISE; END IF; END;
  r := public.criar_encomenda_catalogo('doces-a', gen_random_uuid(), '{"nome":"Fábio","telefone":"19988880006","endereco":"Rua B, 20"}',
    jsonb_build_object('tipo', 'entrega', 'bairro', 'Centro', 'data', livre, 'descricao', 'Bolo de 2 andares tema jardim, 40 pessoas',
      'fotos', jsonb_build_array('https://x.supabase.co/storage/v1/object/public/catalogo/encomendas/doces-a/ref1.jpg')));
  p := pg_temp.pedido_por_codigo(r->>'codigo');
  IF NOT p.encomenda OR p.taxa_entrega <> 5 OR p.observacoes NOT LIKE '%tema jardim%' OR p.observacoes NOT LIKE '%encomendas/doces-a/ref1.jpg%'
     OR pg_temp.qtd_itens(p.id) > 0 THEN
    RAISE EXCEPTION 'TESTE_FALHOU: encomenda gravada errada: %', to_jsonb(p);
  END IF;
  IF NOT public._encomenda_aceita('doces-a') OR public._encomenda_aceita('nao-existe') THEN RAISE EXCEPTION 'TESTE_FALHOU: _encomenda_aceita.'; END IF;
END $t$;
RESET ROLE;

-- Pedidos sem os campos novos continuam funcionando quando a agenda está vazia.
SELECT set_config('request.jwt.claim.sub', 'a1111111-1111-4111-8111-111111111111', true);
SET LOCAL ROLE authenticated;
UPDATE public.confeitarias SET dias_fechados = '{}', datas_bloqueadas = '{}', horarios_retirada = '{}', taxas_bairro = '[]', aceita_encomenda = false;
DO $t$ BEGIN
  IF (SELECT usos FROM public.cupons WHERE codigo = 'FIXO5') <> 1 OR (SELECT usos FROM public.cupons WHERE codigo = 'PROMO10') <> 1 THEN
    RAISE EXCEPTION 'TESTE_FALHOU: contagem de usos dos cupons.';
  END IF;
END $t$;
RESET ROLE;
SET LOCAL ROLE anon;
DO $t$
DECLARE
  produto uuid := (public.catalogo_publico('doces-a')->'produtos'->0->>'id')::uuid;
  r jsonb;
BEGIN
  r := public.criar_pedido_catalogo('doces-a', gen_random_uuid(), '{"nome":"Gil","telefone":"19988880007","endereco":"Rua C, 1"}',
    jsonb_build_object('tipo', 'entrega', 'data', (SELECT domingo FROM datas_teste)), jsonb_build_array(jsonb_build_object('produto_id', produto, 'quantidade', 1)));
  IF (pg_temp.pedido_por_codigo(r->>'codigo')).taxa_entrega <> 10 THEN RAISE EXCEPTION 'TESTE_FALHOU: taxa padrão.'; END IF;
  BEGIN
    PERFORM public.criar_encomenda_catalogo('doces-a', gen_random_uuid(), '{"nome":"Gil","telefone":"19988880007"}',
      jsonb_build_object('tipo', 'retirada', 'data', (SELECT livre FROM datas_teste), 'descricao', 'Bolo simples para 10 pessoas'));
    RAISE EXCEPTION 'TESTE_FALHOU: encomenda com opção desligada.';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE 'CATALOGO: esta confeitaria não está aceitando%' THEN RAISE; END IF; END;
END $t$;
RESET ROLE;

ROLLBACK;
