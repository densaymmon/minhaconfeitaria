\set ON_ERROR_STOP on
-- Plataforma: primeira conta administradora, aprovação manual de novas contas,
-- bloqueio aplicado no banco (política RESTRICTIVE), termos e painel da plataforma.
BEGIN;

-- No Supabase estas colunas existem; o banco de testes só tem id e created_at.
ALTER TABLE auth.users ADD COLUMN IF NOT EXISTS email text;
ALTER TABLE auth.users ADD COLUMN IF NOT EXISTS raw_user_meta_data jsonb;

INSERT INTO auth.users(id, email) VALUES ('a1111111-1111-4111-8111-111111111111', 'dona@plataforma.test');
DO $t$
BEGIN
  IF (SELECT acesso FROM public.confeitarias WHERE user_id = 'a1111111-1111-4111-8111-111111111111') <> 'ativo' THEN
    RAISE EXCEPTION 'TESTE_FALHOU: a primeira conta deveria estar ativa.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.plataforma_admins WHERE user_id = 'a1111111-1111-4111-8111-111111111111') THEN
    RAISE EXCEPTION 'TESTE_FALHOU: a primeira conta deveria ser administradora.';
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
    AND c.relname NOT IN ('confeitarias', 'plataforma_admins', 'plataforma_contas')
    AND NOT EXISTS (SELECT 1 FROM pg_policies p WHERE p.schemaname = 'public' AND p.tablename = c.relname
                    AND p.policyname = 'acesso_liberado' AND p.permissive = 'RESTRICTIVE');
  IF v_sem IS NOT NULL THEN
    RAISE EXCEPTION 'TESTE_FALHOU: tabelas sem a política acesso_liberado: %', v_sem;
  END IF;
END $t$;

-- Cadastro aberto com aprovação manual (padrão): a nova conta fica pendente,
-- com nome, WhatsApp e aceite dos termos vindos do formulário de cadastro.
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
  IF EXISTS (SELECT 1 FROM public.plataforma_admins WHERE user_id = c.user_id) THEN
    RAISE EXCEPTION 'TESTE_FALHOU: a segunda conta não pode ser administradora.';
  END IF;
END $t$;

-- B pendente: vê e edita os próprios dados de cadastro, mas não usa o sistema.
SELECT set_config('request.jwt.claim.sub', 'b2222222-2222-4222-8222-222222222222', true);
SET LOCAL ROLE authenticated;
DO $t$
BEGIN
  IF (SELECT count(*) FROM public.confeitarias) <> 1 THEN RAISE EXCEPTION 'TESTE_FALHOU: B deveria ver só a própria confeitaria.'; END IF;
  UPDATE public.confeitarias SET cidade = 'Campinas', slug = 'doces-da-b', catalogo_ativo = true;
  IF (SELECT catalogo_ativo FROM public.confeitarias) THEN RAISE EXCEPTION 'TESTE_FALHOU: conta pendente publicou o catálogo.'; END IF;
  IF (SELECT cidade FROM public.confeitarias) <> 'Campinas' THEN RAISE EXCEPTION 'TESTE_FALHOU: B não salvou a cidade.'; END IF;

  BEGIN
    UPDATE public.confeitarias SET acesso = 'ativo';
    RAISE EXCEPTION 'TESTE_FALHOU: a confeitaria liberou o próprio acesso.';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    UPDATE public.confeitarias SET termos_versao = 'x';
    RAISE EXCEPTION 'TESTE_FALHOU: termos alterados sem a função aceitar_termos.';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    INSERT INTO public.produtos(nome, rendimento, preco_venda) VALUES ('Bolo da B', 1, 50);
    RAISE EXCEPTION 'TESTE_FALHOU: conta pendente cadastrou produto.';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    INSERT INTO public.clientes(nome, telefone) VALUES ('Cliente', '19999990000');
    RAISE EXCEPTION 'TESTE_FALHOU: conta pendente cadastrou cliente.';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  IF public.eh_admin_plataforma() THEN RAISE EXCEPTION 'TESTE_FALHOU: B não é administradora.'; END IF;
  BEGIN
    PERFORM public.admin_listar_confeitarias();
    RAISE EXCEPTION 'TESTE_FALHOU: B listou as confeitarias.';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE 'ADMIN:%' THEN RAISE; END IF;
  END;
  BEGIN
    PERFORM public.admin_atualizar_confeitaria('b2222222-2222-4222-8222-222222222222', 'ativo', NULL, NULL);
    RAISE EXCEPTION 'TESTE_FALHOU: B liberou a si mesma.';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE 'ADMIN:%' THEN RAISE; END IF;
  END;
  BEGIN
    PERFORM public.admin_salvar_plataforma('{"cadastro_aberto": true, "aprovacao_manual": false}');
    RAISE EXCEPTION 'TESTE_FALHOU: B alterou a plataforma.';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE 'ADMIN:%' THEN RAISE; END IF;
  END;
  BEGIN
    PERFORM 1 FROM public.plataforma_contas;
    RAISE EXCEPTION 'TESTE_FALHOU: B leu as anotações da plataforma.';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  PERFORM public.aceitar_termos('2026-11-01');
  IF (SELECT termos_versao FROM public.confeitarias) <> '2026-11-01' THEN RAISE EXCEPTION 'TESTE_FALHOU: aceite dos termos não gravou.'; END IF;
END $t$;
RESET ROLE;

-- A administradora lista, libera e anota.
SELECT set_config('request.jwt.claim.sub', 'a1111111-1111-4111-8111-111111111111', true);
SET LOCAL ROLE authenticated;
DO $t$
DECLARE
  v jsonb := public.admin_listar_confeitarias();
BEGIN
  IF NOT public.eh_admin_plataforma() THEN RAISE EXCEPTION 'TESTE_FALHOU: A deveria ser administradora.'; END IF;
  IF jsonb_array_length(v) <> 2 OR v->0->>'nome' <> 'Doces da B' OR v->0->>'acesso' <> 'pendente'
     OR v->0->>'email' <> 'b@doces.test' OR (v->1->>'admin')::boolean IS NOT TRUE THEN
    RAISE EXCEPTION 'TESTE_FALHOU: lista do painel incorreta: %', v;
  END IF;
  BEGIN
    PERFORM public.admin_atualizar_confeitaria('a1111111-1111-4111-8111-111111111111', 'bloqueado', NULL, NULL);
    RAISE EXCEPTION 'TESTE_FALHOU: a administradora bloqueou a própria conta.';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE 'ADMIN:%' THEN RAISE; END IF;
  END;
  PERFORM public.admin_atualizar_confeitaria('b2222222-2222-4222-8222-222222222222', 'ativo', '2026-12-31', ' Pagou novembro por Pix ');
  v := public.admin_listar_confeitarias();
  IF v->0->>'pago_ate' <> '2026-12-31' OR v->0->>'observacao' <> 'Pagou novembro por Pix' THEN
    RAISE EXCEPTION 'TESTE_FALHOU: anotações não gravadas: %', v->0;
  END IF;
  PERFORM public.admin_salvar_plataforma('{"cadastro_aberto": true, "aprovacao_manual": true, "empresa_nome": "Doce Gestão Ltda", "contato_email": "contato@docegestao.test"}');
END $t$;
RESET ROLE;

-- B liberada: usa o sistema e publica o catálogo.
SELECT set_config('request.jwt.claim.sub', 'b2222222-2222-4222-8222-222222222222', true);
SET LOCAL ROLE authenticated;
DO $t$
BEGIN
  INSERT INTO public.produtos(nome, rendimento, preco_venda, no_catalogo) VALUES ('Bolo da B', 1, 50, true);
  UPDATE public.confeitarias SET catalogo_ativo = true, onboarding_concluido_em = now();
  IF NOT (SELECT catalogo_ativo FROM public.confeitarias) THEN RAISE EXCEPTION 'TESTE_FALHOU: B liberada não ativou o catálogo.'; END IF;
END $t$;
RESET ROLE;
SET LOCAL ROLE anon;
DO $t$
BEGIN
  IF public.catalogo_publico('doces-da-b') IS NULL THEN RAISE EXCEPTION 'TESTE_FALHOU: catálogo da B liberada não abriu.'; END IF;
  IF public.plataforma_publica()->>'contato_email' <> 'contato@docegestao.test' THEN RAISE EXCEPTION 'TESTE_FALHOU: dados públicos da plataforma.'; END IF;
END $t$;
RESET ROLE;

-- Bloqueio: catálogo sai do ar e a conta não lê nem grava mais nada.
SELECT set_config('request.jwt.claim.sub', 'a1111111-1111-4111-8111-111111111111', true);
SET LOCAL ROLE authenticated;
SELECT public.admin_atualizar_confeitaria('b2222222-2222-4222-8222-222222222222', 'bloqueado', '2026-12-31', NULL);
RESET ROLE;
SELECT set_config('request.jwt.claim.sub', 'b2222222-2222-4222-8222-222222222222', true);
SET LOCAL ROLE authenticated;
DO $t$
BEGIN
  IF public.catalogo_publico('doces-da-b') IS NOT NULL THEN RAISE EXCEPTION 'TESTE_FALHOU: catálogo de conta bloqueada no ar.'; END IF;
  IF (SELECT count(*) FROM public.produtos) <> 0 THEN RAISE EXCEPTION 'TESTE_FALHOU: conta bloqueada ainda lê produtos.'; END IF;
  IF (SELECT acesso FROM public.confeitarias) <> 'bloqueado' THEN RAISE EXCEPTION 'TESTE_FALHOU: B deveria ver que está bloqueada.'; END IF;
  BEGIN
    INSERT INTO public.clientes(nome, telefone) VALUES ('Cliente', '19999990000');
    RAISE EXCEPTION 'TESTE_FALHOU: conta bloqueada gravou cliente.';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END $t$;
RESET ROLE;

-- A administradora continua com acesso aos próprios dados.
SELECT set_config('request.jwt.claim.sub', 'a1111111-1111-4111-8111-111111111111', true);
SET LOCAL ROLE authenticated;
INSERT INTO public.clientes(nome, telefone) VALUES ('Cliente da A', '19999990000');
RESET ROLE;

-- Sem aprovação manual, a nova conta já entra ativa e sem termos aceitos.
UPDATE public.plataforma_config SET aprovacao_manual = false;
INSERT INTO auth.users(id) VALUES ('c3333333-3333-4333-8333-333333333333');
DO $t$
DECLARE
  c public.confeitarias%ROWTYPE;
BEGIN
  SELECT * INTO c FROM public.confeitarias WHERE user_id = 'c3333333-3333-4333-8333-333333333333';
  IF c.acesso <> 'ativo' OR c.nome <> 'Minha confeitaria' OR c.termos_versao IS NOT NULL THEN
    RAISE EXCEPTION 'TESTE_FALHOU: cadastro sem aprovação incorreto: %', to_jsonb(c);
  END IF;
END $t$;

-- Endereços das páginas novas são reservados.
DO $t$
BEGIN
  IF NOT public._slug_reservado('plataforma') OR NOT public._slug_reservado('comecar') THEN
    RAISE EXCEPTION 'TESTE_FALHOU: endereços das páginas novas não reservados.';
  END IF;
END $t$;

ROLLBACK;
