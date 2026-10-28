\set ON_ERROR_STOP on
-- Plataforma: administração por e-mail (sem confeitaria), aprovação de contas,
-- planos e assinaturas (teste, atraso, suspensão automática), limites, catálogo
-- por plano e bloqueio aplicado no banco (política RESTRICTIVE).
BEGIN;

-- No Supabase estas colunas existem; o banco de testes só tem id e created_at.
ALTER TABLE auth.users ADD COLUMN IF NOT EXISTS email text;
ALTER TABLE auth.users ADD COLUMN IF NOT EXISTS raw_user_meta_data jsonb;

-- Conta de administração: e-mail cadastrado, sem confeitaria nem assinatura.
INSERT INTO auth.users(id, email) VALUES ('d0000000-0000-4000-8000-000000000000', 'Dennys.Saymmon@gmail.com');
DO $t$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.plataforma_admins WHERE user_id = 'd0000000-0000-4000-8000-000000000000') THEN
    RAISE EXCEPTION 'TESTE_FALHOU: o e-mail de administração não virou administrador.';
  END IF;
  IF EXISTS (SELECT 1 FROM public.confeitarias WHERE user_id = 'd0000000-0000-4000-8000-000000000000')
     OR EXISTS (SELECT 1 FROM public.assinaturas WHERE user_id = 'd0000000-0000-4000-8000-000000000000') THEN
    RAISE EXCEPTION 'TESTE_FALHOU: a conta de administração não pode ser confeitaria.';
  END IF;
END $t$;

-- Primeira confeitaria: ativa, em teste grátis no plano Vitrine, sem administrar.
INSERT INTO auth.users(id, email) VALUES ('a1111111-1111-4111-8111-111111111111', 'dona@a.test');
DO $t$
DECLARE
  a public.assinaturas%ROWTYPE;
BEGIN
  IF (SELECT acesso FROM public.confeitarias WHERE user_id = 'a1111111-1111-4111-8111-111111111111') <> 'ativo' THEN
    RAISE EXCEPTION 'TESTE_FALHOU: a primeira confeitaria deveria estar ativa.';
  END IF;
  SELECT * INTO a FROM public.assinaturas WHERE user_id = 'a1111111-1111-4111-8111-111111111111';
  IF a.plano_id <> 'vitrine' OR a.situacao <> 'teste' OR a.teste_ate <> public._hoje_confeitaria() + 14 THEN
    RAISE EXCEPTION 'TESTE_FALHOU: teste grátis incorreto: %', to_jsonb(a);
  END IF;
  IF EXISTS (SELECT 1 FROM public.plataforma_admins WHERE user_id = 'a1111111-1111-4111-8111-111111111111') THEN
    RAISE EXCEPTION 'TESTE_FALHOU: confeitaria não administra a plataforma quando há e-mail de administração.';
  END IF;
END $t$;

-- Toda tabela da confeitaria tem a política de acesso liberado.
DO $t$
DECLARE
  v_sem text;
BEGIN
  SELECT string_agg(c.relname, ', ') INTO v_sem
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relrowsecurity
    AND EXISTS (SELECT 1 FROM pg_attribute a WHERE a.attrelid = c.oid AND a.attname = 'user_id' AND NOT a.attisdropped)
    AND c.relname NOT IN ('confeitarias', 'plataforma_admins', 'plataforma_contas', 'assinaturas', 'assinatura_pagamentos')
    AND NOT EXISTS (SELECT 1 FROM pg_policies p WHERE p.schemaname = 'public' AND p.tablename = c.relname
                    AND p.policyname = 'acesso_liberado' AND p.permissive = 'RESTRICTIVE');
  IF v_sem IS NOT NULL THEN
    RAISE EXCEPTION 'TESTE_FALHOU: tabelas sem a política acesso_liberado: %', v_sem;
  END IF;
END $t$;

-- Cadastro aberto com aprovação manual: B fica pendente, com dados do formulário.
UPDATE public.plataforma_config SET cadastro_aberto = true;
INSERT INTO auth.users(id, email, raw_user_meta_data) VALUES (
  'b2222222-2222-4222-8222-222222222222', 'b@doces.test',
  '{"nome_confeitaria": "  Doces   da B ", "whatsapp": "(19) 98888-7777", "termos_versao": "2026-10-28"}'
);
DO $t$
DECLARE
  c public.confeitarias%ROWTYPE;
BEGIN
  SELECT * INTO c FROM public.confeitarias WHERE user_id = 'b2222222-2222-4222-8222-222222222222';
  IF c.acesso <> 'pendente' OR c.nome <> 'Doces da B' OR c.whatsapp <> '(19) 98888-7777'
     OR c.termos_versao <> '2026-10-28' OR c.termos_aceitos_em IS NULL OR c.onboarding_concluido_em IS NOT NULL THEN
    RAISE EXCEPTION 'TESTE_FALHOU: cadastro da B incorreto: %', to_jsonb(c);
  END IF;
END $t$;

-- B pendente: vê os próprios dados, mas não usa o sistema nem a administração.
SELECT set_config('request.jwt.claim.sub', 'b2222222-2222-4222-8222-222222222222', true);
SET LOCAL ROLE authenticated;
DO $t$
BEGIN
  IF (SELECT count(*) FROM public.confeitarias) <> 1 THEN RAISE EXCEPTION 'TESTE_FALHOU: B deveria ver só a própria confeitaria.'; END IF;
  UPDATE public.confeitarias SET cidade = 'Campinas', slug = 'doces-da-b', catalogo_ativo = true;
  IF (SELECT catalogo_ativo FROM public.confeitarias) THEN RAISE EXCEPTION 'TESTE_FALHOU: conta pendente publicou o catálogo.'; END IF;
  IF (SELECT count(*) FROM public.assinaturas) <> 1 THEN RAISE EXCEPTION 'TESTE_FALHOU: B deveria ver a própria assinatura.'; END IF;

  BEGIN
    UPDATE public.confeitarias SET acesso = 'ativo';
    RAISE EXCEPTION 'TESTE_FALHOU: a confeitaria liberou o próprio acesso.';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    UPDATE public.assinaturas SET situacao = 'cortesia';
    RAISE EXCEPTION 'TESTE_FALHOU: a confeitaria alterou a própria assinatura.';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    INSERT INTO public.produtos(nome, rendimento, preco_venda) VALUES ('Bolo da B', 1, 50);
    RAISE EXCEPTION 'TESTE_FALHOU: conta pendente cadastrou produto.';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  IF public.eh_admin_plataforma() THEN RAISE EXCEPTION 'TESTE_FALHOU: B não é administradora.'; END IF;
  BEGIN PERFORM public.admin_listar_confeitarias(); RAISE EXCEPTION 'TESTE_FALHOU: B listou empresas.';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE 'ADMIN:%' THEN RAISE; END IF; END;
  BEGIN PERFORM public.admin_resumo(); RAISE EXCEPTION 'TESTE_FALHOU: B leu o resumo.';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE 'ADMIN:%' THEN RAISE; END IF; END;
  BEGIN PERFORM public.admin_salvar_empresa('b2222222-2222-4222-8222-222222222222', '{"acesso":"ativo","plano_id":"vitrine","situacao":"cortesia"}');
    RAISE EXCEPTION 'TESTE_FALHOU: B liberou a si mesma.';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE 'ADMIN:%' THEN RAISE; END IF; END;
  BEGIN PERFORM public.admin_registrar_pagamento('b2222222-2222-4222-8222-222222222222', 1, current_date, 12, NULL, NULL);
    RAISE EXCEPTION 'TESTE_FALHOU: B registrou pagamento.';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE 'ADMIN:%' THEN RAISE; END IF; END;
  BEGIN PERFORM public.admin_salvar_plano('{"id":"vitrine","nome":"Grátis","preco_mensal":0,"recursos":[]}');
    RAISE EXCEPTION 'TESTE_FALHOU: B alterou um plano.';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE 'ADMIN:%' THEN RAISE; END IF; END;
  BEGIN PERFORM public.admin_salvar_plataforma('{"cadastro_aberto": true, "aprovacao_manual": false}');
    RAISE EXCEPTION 'TESTE_FALHOU: B alterou a plataforma.';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE 'ADMIN:%' THEN RAISE; END IF; END;
  BEGIN PERFORM 1 FROM public.plataforma_contas; RAISE EXCEPTION 'TESTE_FALHOU: B leu as anotações.';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  PERFORM public.aceitar_termos('2026-11-01');
  IF (SELECT termos_versao FROM public.confeitarias) <> '2026-11-01' THEN RAISE EXCEPTION 'TESTE_FALHOU: aceite dos termos não gravou.'; END IF;
END $t$;
RESET ROLE;

-- Administração: lista, libera (o teste grátis começa na liberação) e configura.
SELECT set_config('request.jwt.claim.sub', 'd0000000-0000-4000-8000-000000000000', true);
SET LOCAL ROLE authenticated;
DO $t$
DECLARE
  v jsonb := public.admin_listar_confeitarias();
  b jsonb;
BEGIN
  IF NOT public.eh_admin_plataforma() OR NOT public._acesso_liberado() THEN RAISE EXCEPTION 'TESTE_FALHOU: administração sem acesso.'; END IF;
  IF jsonb_array_length(v) <> 2 OR v->0->>'nome' <> 'Doces da B' OR v->0->>'acesso' <> 'pendente'
     OR v->0->>'email' <> 'b@doces.test' OR v->0->>'plano_id' <> 'vitrine' OR v->0->>'situacao' <> 'teste' THEN
    RAISE EXCEPTION 'TESTE_FALHOU: lista do painel incorreta: %', v;
  END IF;
END $t$;
RESET ROLE;
-- Simula uma conta que ficou dias aguardando liberação (teste grátis quase no fim).
UPDATE public.assinaturas SET teste_ate = public._hoje_confeitaria() + 2 WHERE user_id = 'b2222222-2222-4222-8222-222222222222';
SET LOCAL ROLE authenticated;
DO $t$
BEGIN
  PERFORM public.admin_salvar_empresa('b2222222-2222-4222-8222-222222222222', jsonb_build_object(
    'acesso', 'ativo', 'plano_id', 'vitrine', 'ciclo', 'mensal', 'situacao', 'teste',
    'teste_ate', public._hoje_confeitaria() + 2, 'observacao', ' Indicação da Ana '));
  IF (SELECT teste_ate FROM public.assinaturas WHERE user_id = 'b2222222-2222-4222-8222-222222222222') <> public._hoje_confeitaria() + 14 THEN
    RAISE EXCEPTION 'TESTE_FALHOU: o teste grátis não recomeçou na liberação.';
  END IF;
  IF public.admin_listar_confeitarias()->0->>'observacao' <> 'Indicação da Ana' THEN RAISE EXCEPTION 'TESTE_FALHOU: anotação não gravada.'; END IF;
  BEGIN
    PERFORM public.admin_salvar_empresa('d0000000-0000-4000-8000-000000000000', '{"acesso":"ativo","plano_id":"vitrine","situacao":"cortesia"}');
    RAISE EXCEPTION 'TESTE_FALHOU: administração virou empresa.';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE 'ADMIN: empresa não encontrada%' THEN RAISE; END IF;
  END;
  PERFORM public.admin_salvar_plataforma('{"cadastro_aberto": true, "aprovacao_manual": true, "empresa_nome": "Doce Gestão Ltda", "contato_email": "contato@docegestao.test", "dias_teste": 14, "dias_tolerancia": 7}');
  IF (public.admin_config()->>'dias_tolerancia')::int <> 7 THEN RAISE EXCEPTION 'TESTE_FALHOU: configuração do painel.'; END IF;
  BEGIN
    PERFORM public.admin_salvar_plataforma('{"cadastro_aberto": true, "aprovacao_manual": true, "dias_teste": 500}');
    RAISE EXCEPTION 'TESTE_FALHOU: aceitou teste de 500 dias.';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE 'ADMIN:%' THEN RAISE; END IF;
  END;
END $t$;
RESET ROLE;

-- B liberada e em teste no Vitrine: usa tudo e publica o catálogo.
SELECT set_config('request.jwt.claim.sub', 'b2222222-2222-4222-8222-222222222222', true);
SET LOCAL ROLE authenticated;
DO $t$
BEGIN
  INSERT INTO public.produtos(nome, rendimento, preco_venda, no_catalogo) VALUES ('Bolo da B', 1, 50, true);
  UPDATE public.confeitarias SET catalogo_ativo = true, onboarding_concluido_em = now();
  IF public.minha_assinatura()->>'situacao' <> 'teste' OR public.minha_assinatura()->'plano'->>'id' <> 'vitrine' THEN
    RAISE EXCEPTION 'TESTE_FALHOU: minha_assinatura: %', public.minha_assinatura();
  END IF;
END $t$;
RESET ROLE;
SET LOCAL ROLE anon;
DO $t$
BEGIN
  IF public.catalogo_publico('doces-da-b') IS NULL THEN RAISE EXCEPTION 'TESTE_FALHOU: catálogo da B liberada não abriu.'; END IF;
  IF (SELECT count(*) FROM public.planos) <> 3 THEN RAISE EXCEPTION 'TESTE_FALHOU: planos devem ser públicos.'; END IF;
END $t$;
RESET ROLE;

-- Plano Essencial (sem catálogo, limites baixos para o teste).
SELECT set_config('request.jwt.claim.sub', 'd0000000-0000-4000-8000-000000000000', true);
SET LOCAL ROLE authenticated;
SELECT public.admin_salvar_plano('{"id":"essencial","nome":"Essencial","preco_mensal":29.9,"preco_anual":299,"limite_pedidos_mes":1,"limite_produtos":1,"recursos":[],"ordem":1,"ativo":true}');
SELECT public.admin_salvar_empresa('b2222222-2222-4222-8222-222222222222', jsonb_build_object(
  'acesso', 'ativo', 'plano_id', 'essencial', 'ciclo', 'mensal', 'situacao', 'ativa', 'pago_ate', public._hoje_confeitaria() + 30));
DO $t$
BEGIN
  BEGIN
    PERFORM public.admin_salvar_plano('{"id":"x","nome":"X","preco_mensal":1,"recursos":["voar"]}');
    RAISE EXCEPTION 'TESTE_FALHOU: plano com recurso inexistente.';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE 'ADMIN:%' THEN RAISE; END IF;
  END;
END $t$;
RESET ROLE;
SET LOCAL ROLE anon;
DO $t$
BEGIN
  IF public.catalogo_publico('doces-da-b') IS NOT NULL THEN RAISE EXCEPTION 'TESTE_FALHOU: catálogo no ar num plano sem catálogo.'; END IF;
END $t$;
RESET ROLE;
SELECT set_config('request.jwt.claim.sub', 'b2222222-2222-4222-8222-222222222222', true);
SET LOCAL ROLE authenticated;
DO $t$
BEGIN
  BEGIN
    INSERT INTO public.produtos(nome, rendimento, preco_venda) VALUES ('Segundo bolo', 1, 50);
    RAISE EXCEPTION 'TESTE_FALHOU: passou do limite de produtos.';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE 'PLANO:%' THEN RAISE; END IF;
  END;
  INSERT INTO public.pedidos(data_entrega, status) VALUES (current_date, 'recebido');
  BEGIN
    INSERT INTO public.pedidos(data_entrega, status) VALUES (current_date, 'recebido');
    RAISE EXCEPTION 'TESTE_FALHOU: passou do limite de pedidos do mês.';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE 'PLANO:%' THEN RAISE; END IF;
  END;
END $t$;
RESET ROLE;

-- Vencimento: atrasada continua usando; após 7 dias de tolerância, suspensa.
UPDATE public.assinaturas SET pago_ate = public._hoje_confeitaria() - 7 WHERE user_id = 'b2222222-2222-4222-8222-222222222222';
SET LOCAL ROLE authenticated;
DO $t$
BEGIN
  IF public.minha_assinatura()->>'situacao' <> 'atrasada' THEN RAISE EXCEPTION 'TESTE_FALHOU: deveria estar atrasada: %', public.minha_assinatura(); END IF;
  IF (SELECT count(*) FROM public.produtos) <> 1 THEN RAISE EXCEPTION 'TESTE_FALHOU: atrasada (na tolerância) deveria usar o sistema.'; END IF;
END $t$;
RESET ROLE;
UPDATE public.assinaturas SET pago_ate = public._hoje_confeitaria() - 8 WHERE user_id = 'b2222222-2222-4222-8222-222222222222';
SET LOCAL ROLE authenticated;
DO $t$
BEGIN
  IF public.minha_assinatura()->>'situacao' <> 'suspensa' THEN RAISE EXCEPTION 'TESTE_FALHOU: deveria estar suspensa: %', public.minha_assinatura(); END IF;
  IF (SELECT count(*) FROM public.produtos) <> 0 THEN RAISE EXCEPTION 'TESTE_FALHOU: suspensa ainda lê produtos.'; END IF;
  BEGIN
    INSERT INTO public.clientes(nome, telefone) VALUES ('Cliente', '19999990000');
    RAISE EXCEPTION 'TESTE_FALHOU: suspensa gravou cliente.';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END $t$;
RESET ROLE;

-- Pagamento registrado: volta a ficar ativa, com vencimento contado do vencimento anterior.
SELECT set_config('request.jwt.claim.sub', 'd0000000-0000-4000-8000-000000000000', true);
SET LOCAL ROLE authenticated;
DO $t$
DECLARE
  v_novo date;
  r jsonb;
BEGIN
  v_novo := public.admin_registrar_pagamento('b2222222-2222-4222-8222-222222222222', 29.9, public._hoje_confeitaria(), 1, 'Pix', 'Outubro');
  IF v_novo <> ((public._hoje_confeitaria() - 8) + interval '1 month')::date THEN RAISE EXCEPTION 'TESTE_FALHOU: novo vencimento %', v_novo; END IF;
  IF jsonb_array_length(public.admin_listar_pagamentos('b2222222-2222-4222-8222-222222222222')) <> 1 THEN RAISE EXCEPTION 'TESTE_FALHOU: histórico de pagamentos.'; END IF;
  r := public.admin_resumo();
  IF (r->>'total')::int <> 2 OR (r->>'ativas')::int <> 1 OR (r->>'em_teste')::int <> 1 OR (r->>'recebido_mes')::numeric <> 29.9
     OR (r->>'receita_mensal')::numeric <> 29.9 THEN
    RAISE EXCEPTION 'TESTE_FALHOU: resumo %', r;
  END IF;
END $t$;
RESET ROLE;
SELECT set_config('request.jwt.claim.sub', 'b2222222-2222-4222-8222-222222222222', true);
SET LOCAL ROLE authenticated;
DO $t$
BEGIN
  IF public.minha_assinatura()->>'situacao' <> 'ativa' THEN RAISE EXCEPTION 'TESTE_FALHOU: pagamento não reativou.'; END IF;
  IF (SELECT count(*) FROM public.produtos) <> 1 THEN RAISE EXCEPTION 'TESTE_FALHOU: reativada não lê produtos.'; END IF;
  IF (SELECT count(*) FROM public.assinatura_pagamentos) <> 1 THEN RAISE EXCEPTION 'TESTE_FALHOU: B deveria ver o próprio pagamento.'; END IF;
END $t$;
RESET ROLE;

-- Bloqueio manual: catálogo sai do ar e a conta não lê mais nada.
SELECT set_config('request.jwt.claim.sub', 'd0000000-0000-4000-8000-000000000000', true);
SET LOCAL ROLE authenticated;
SELECT public.admin_salvar_empresa('b2222222-2222-4222-8222-222222222222', jsonb_build_object(
  'acesso', 'bloqueado', 'plano_id', 'vitrine', 'ciclo', 'mensal', 'situacao', 'ativa', 'pago_ate', public._hoje_confeitaria() + 30));
RESET ROLE;
SELECT set_config('request.jwt.claim.sub', 'b2222222-2222-4222-8222-222222222222', true);
SET LOCAL ROLE authenticated;
DO $t$
BEGIN
  IF public.catalogo_publico('doces-da-b') IS NOT NULL THEN RAISE EXCEPTION 'TESTE_FALHOU: catálogo de conta bloqueada no ar.'; END IF;
  IF (SELECT count(*) FROM public.produtos) <> 0 THEN RAISE EXCEPTION 'TESTE_FALHOU: conta bloqueada ainda lê produtos.'; END IF;
END $t$;
RESET ROLE;

-- A primeira confeitaria segue normal.
SELECT set_config('request.jwt.claim.sub', 'a1111111-1111-4111-8111-111111111111', true);
SET LOCAL ROLE authenticated;
INSERT INTO public.clientes(nome, telefone) VALUES ('Cliente da A', '19999990000');
RESET ROLE;

-- Sem aprovação manual, a nova conta já entra ativa e em teste.
UPDATE public.plataforma_config SET aprovacao_manual = false;
INSERT INTO auth.users(id) VALUES ('c3333333-3333-4333-8333-333333333333');
DO $t$
BEGIN
  IF (SELECT acesso FROM public.confeitarias WHERE user_id = 'c3333333-3333-4333-8333-333333333333') <> 'ativo'
     OR (SELECT situacao FROM public.assinaturas WHERE user_id = 'c3333333-3333-4333-8333-333333333333') <> 'teste' THEN
    RAISE EXCEPTION 'TESTE_FALHOU: cadastro sem aprovação incorreto.';
  END IF;
  IF NOT public._slug_reservado('plataforma') OR NOT public._slug_reservado('comecar') THEN
    RAISE EXCEPTION 'TESTE_FALHOU: endereços das páginas novas não reservados.';
  END IF;
  -- Situação calculada: datas limite.
  IF public._situacao_assinatura('ativa', NULL, '2026-10-20', '2026-10-27', 7) <> 'atrasada'
     OR public._situacao_assinatura('ativa', NULL, '2026-10-20', '2026-10-28', 7) <> 'suspensa'
     OR public._situacao_assinatura('teste', '2026-10-28', NULL, '2026-10-28', 7) <> 'teste'
     OR public._situacao_assinatura('cortesia', NULL, '2020-01-01', '2026-10-28', 7) <> 'cortesia' THEN
    RAISE EXCEPTION 'TESTE_FALHOU: cálculo da situação.';
  END IF;
END $t$;

ROLLBACK;
