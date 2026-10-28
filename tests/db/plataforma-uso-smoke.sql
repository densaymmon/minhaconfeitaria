\set ON_ERROR_STOP on
-- Métricas de uso (só administração) e monitoramento de erros (registro aberto, leitura só da administração).
BEGIN;

ALTER TABLE auth.users ADD COLUMN IF NOT EXISTS email text;
UPDATE public.plataforma_config SET cadastro_aberto = true, aprovacao_manual = false;
INSERT INTO public.plataforma_admin_emails (email) VALUES ('admin@plataforma.test') ON CONFLICT DO NOTHING;
INSERT INTO auth.users(id, email) VALUES
  ('d0000000-0000-4000-8000-000000000000', 'admin@plataforma.test'),
  ('a1111111-1111-4111-8111-111111111111', 'dona@a.test');

SELECT set_config('request.jwt.claim.sub', 'a1111111-1111-4111-8111-111111111111', true);
SET LOCAL ROLE authenticated;
DO $t$ BEGIN
  INSERT INTO public.produtos(nome, rendimento, preco_venda) VALUES ('Bolo', 1, 50);
  INSERT INTO public.pedidos(data_entrega, status) VALUES (current_date + 1, 'recebido');
  BEGIN PERFORM public.admin_metricas(); RAISE EXCEPTION 'TESTE_FALHOU: confeitaria leu métricas.';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM NOT LIKE 'ADMIN:%' THEN RAISE; END IF; END;
  BEGIN PERFORM public.admin_listar_erros(7); RAISE EXCEPTION 'TESTE_FALHOU: confeitaria leu erros.';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM NOT LIKE 'ADMIN:%' THEN RAISE; END IF; END;
  BEGIN PERFORM 1 FROM public.erros_app; RAISE EXCEPTION 'TESTE_FALHOU: leu a tabela de erros.';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  -- Erro repetido na mesma página soma, sem criar linhas novas (o endereço perde ?query e #hash).
  PERFORM public.registrar_erro('app', 'TypeError: x is undefined', 'at Painel (painel.tsx:10)', 'https://site/painel?a=1', 'Chrome');
  PERFORM public.registrar_erro('app', 'TypeError: x is undefined', 'at Painel (painel.tsx:10)', 'https://site/painel#b', 'Chrome');
  PERFORM public.registrar_erro('lixo', 'ignorado', NULL, NULL, NULL);
  PERFORM public.registrar_erro('app', '   ', NULL, NULL, NULL);
END $t$;
RESET ROLE;

SET LOCAL ROLE anon;
DO $t$ BEGIN
  PERFORM public.registrar_erro('catalogo', 'Falha ao carregar o catálogo', NULL, 'https://site/loja', 'Safari');
  BEGIN PERFORM public.admin_metricas(); RAISE EXCEPTION 'TESTE_FALHOU: anônimo leu métricas.';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $t$;
RESET ROLE;

DO $t$ BEGIN
  IF (SELECT count(*) FROM public.erros_app) <> 2 OR (SELECT vezes FROM public.erros_app WHERE origem = 'app') <> 2
     OR (SELECT url FROM public.erros_app WHERE origem = 'app') <> 'https://site/painel'
     OR (SELECT confeitaria_id FROM public.erros_app WHERE origem = 'app') <> 'a1111111-1111-4111-8111-111111111111' THEN
    RAISE EXCEPTION 'TESTE_FALHOU: registro de erros: %', (SELECT jsonb_agg(to_jsonb(e)) FROM public.erros_app e);
  END IF;
END $t$;

SELECT set_config('request.jwt.claim.sub', 'd0000000-0000-4000-8000-000000000000', true);
SET LOCAL ROLE authenticated;
DO $t$
DECLARE
  m jsonb := public.admin_metricas();
  e jsonb := public.admin_listar_erros(7);
  u jsonb;
BEGIN
  SELECT x INTO u FROM jsonb_array_elements(m->'uso') x WHERE x->>'user_id' = 'a1111111-1111-4111-8111-111111111111';
  IF (m->>'pedidos_30_dias')::int <> 1 OR (m->>'ativas_7_dias')::int <> 1 OR jsonb_array_length(m->'cadastros_por_mes') <> 6
     OR (u->>'pedidos_30_dias')::int <> 1 OR (u->>'produtos')::int <> 1 THEN
    RAISE EXCEPTION 'TESTE_FALHOU: métricas: %', m;
  END IF;
  IF jsonb_array_length(e) <> 2 OR (SELECT (x->>'vezes')::int FROM jsonb_array_elements(e) x WHERE x->>'origem' = 'app') <> 2 THEN
    RAISE EXCEPTION 'TESTE_FALHOU: erros agrupados: %', e;
  END IF;
  PERFORM public.admin_limpar_erro('Falha ao carregar o catálogo');
  IF jsonb_array_length(public.admin_listar_erros(7)) <> 1 THEN RAISE EXCEPTION 'TESTE_FALHOU: limpar erro.'; END IF;
END $t$;
RESET ROLE;

ROLLBACK;
