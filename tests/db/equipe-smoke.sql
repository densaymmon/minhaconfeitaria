\set ON_ERROR_STOP on
-- Equipe: convite, cadastro pelo link (mesmo com cadastro fechado), aceite por conta existente,
-- dados compartilhados com a confeitaria, papel "produção" sem financeiro e isolamento entre confeitarias.
BEGIN;

ALTER TABLE auth.users ADD COLUMN IF NOT EXISTS email text;
ALTER TABLE auth.users ADD COLUMN IF NOT EXISTS raw_user_meta_data jsonb;
CREATE OR REPLACE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS
  $$ SELECT coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
GRANT EXECUTE ON FUNCTION auth.jwt() TO anon, authenticated;

CREATE FUNCTION pg_temp.entrar(id uuid, email text) RETURNS void LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claim.sub', id::text, true), set_config('request.jwt.claims', jsonb_build_object('sub', id, 'email', email)::text, true)
$$;

UPDATE public.plataforma_config SET cadastro_aberto = true, aprovacao_manual = false;
INSERT INTO auth.users(id, email) VALUES
  ('a1111111-1111-4111-8111-111111111111', 'dona@a.test'),
  ('b2222222-2222-4222-8222-222222222222', 'dona@b.test'),
  ('e5555555-5555-4555-8555-555555555555', 'prod@x.test'),
  ('f6666666-6666-4666-8666-666666666666', 'cheia@x.test');

-- Dona A: dados e convites.
SELECT pg_temp.entrar('a1111111-1111-4111-8111-111111111111', 'dona@a.test');
SET LOCAL ROLE authenticated;
CREATE TEMP TABLE IF NOT EXISTS tokens (papel text, token uuid);
GRANT ALL ON tokens TO authenticated, anon;
DO $t$
BEGIN
  INSERT INTO public.produtos(nome, rendimento, preco_venda) VALUES ('Bolo da A', 1, 50);
  INSERT INTO public.clientes(nome, telefone) VALUES ('Cliente da A', '19999990001');
  INSERT INTO public.despesas(descricao, valor, data, categoria) VALUES ('Aluguel', 900, current_date, 'Aluguel');
  INSERT INTO public.cupons(codigo, tipo, valor) VALUES ('AMIGA10', 'percentual', 10);
  INSERT INTO tokens SELECT 'gerente', (public.convidar_membro(' Gerente@X.test ', 'gerente')->>'token')::uuid;
  INSERT INTO tokens SELECT 'producao', (public.convidar_membro('prod@x.test', 'producao')->>'token')::uuid;
  INSERT INTO tokens SELECT 'cheia', (public.convidar_membro('cheia@x.test', 'producao')->>'token')::uuid;
  BEGIN PERFORM public.convidar_membro('dona@a.test', 'gerente'); RAISE EXCEPTION 'TESTE_FALHOU: convidou a si mesma.';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM NOT LIKE 'EQUIPE: este é o seu próprio%' THEN RAISE; END IF; END;
  BEGIN PERFORM public.convidar_membro('x@x.test', 'dono'); RAISE EXCEPTION 'TESTE_FALHOU: papel inválido aceito.';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM NOT LIKE 'EQUIPE: escolha o papel%' THEN RAISE; END IF; END;
  IF (SELECT count(*) FROM public.equipe_convites WHERE aceito_em IS NULL AND cancelado_em IS NULL) <> 3 THEN RAISE EXCEPTION 'TESTE_FALHOU: convites pendentes.'; END IF;
  IF (public.meu_papel()->>'papel') <> 'dono' THEN RAISE EXCEPTION 'TESTE_FALHOU: papel da dona.'; END IF;
END $t$;
RESET ROLE;

-- Dona B tem sua própria confeitaria.
SELECT pg_temp.entrar('b2222222-2222-4222-8222-222222222222', 'dona@b.test');
SET LOCAL ROLE authenticated;
INSERT INTO public.produtos(nome, rendimento, preco_venda) VALUES ('Bolo da B', 1, 40);
RESET ROLE;

-- Cadastro pelo link com o cadastro fechado: entra na equipe, sem confeitaria própria.
UPDATE public.plataforma_config SET cadastro_aberto = false;
INSERT INTO auth.users(id, email, raw_user_meta_data)
SELECT 'c3333333-3333-4333-8333-333333333333', 'gerente@x.test', jsonb_build_object('convite_token', token, 'nome', 'Gil') FROM tokens WHERE papel = 'gerente';
DO $t$ BEGIN
  IF EXISTS (SELECT 1 FROM public.confeitarias WHERE user_id = 'c3333333-3333-4333-8333-333333333333') THEN RAISE EXCEPTION 'TESTE_FALHOU: membro ganhou confeitaria.'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.equipe_membros WHERE membro_id = 'c3333333-3333-4333-8333-333333333333' AND papel = 'gerente' AND nome = 'Gil') THEN
    RAISE EXCEPTION 'TESTE_FALHOU: cadastro pelo convite não entrou na equipe.';
  END IF;
END $t$;
-- Sem convite (ou com convite de outro e-mail), o cadastro fechado continua barrando.
DO $t$ BEGIN
  BEGIN
    INSERT INTO auth.users(id, email, raw_user_meta_data)
    SELECT 'd4444444-4444-4444-8444-444444444444', 'intrusa@x.test', jsonb_build_object('convite_token', token) FROM tokens WHERE papel = 'producao';
    RAISE EXCEPTION 'TESTE_FALHOU: convite usado por outro e-mail.';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM NOT LIKE 'CADASTRO_FECHADO%' THEN RAISE; END IF; END;
END $t$;
UPDATE public.plataforma_config SET cadastro_aberto = true;

-- Conta existente (com confeitaria vazia) aceita o convite de produção.
SELECT pg_temp.entrar('e5555555-5555-4555-8555-555555555555', 'outra@x.test');
SET LOCAL ROLE authenticated;
DO $t$ BEGIN
  BEGIN PERFORM public.aceitar_convite((SELECT token FROM tokens WHERE papel = 'producao')); RAISE EXCEPTION 'TESTE_FALHOU: aceitou com e-mail diferente.';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM NOT LIKE 'EQUIPE: este convite foi enviado para prod@x.test%' THEN RAISE; END IF; END;
END $t$;
RESET ROLE;
SELECT pg_temp.entrar('e5555555-5555-4555-8555-555555555555', 'prod@x.test');
SET LOCAL ROLE authenticated;
DO $t$ BEGIN
  IF (public.aceitar_convite((SELECT token FROM tokens WHERE papel = 'producao'))->>'papel') <> 'producao' THEN RAISE EXCEPTION 'TESTE_FALHOU: aceite.'; END IF;
  BEGIN PERFORM public.aceitar_convite((SELECT token FROM tokens WHERE papel = 'producao')); RAISE EXCEPTION 'TESTE_FALHOU: convite usado duas vezes.';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM NOT LIKE 'EQUIPE: convite inválido%' THEN RAISE; END IF; END;
END $t$;
RESET ROLE;
DO $t$ BEGIN
  IF EXISTS (SELECT 1 FROM public.confeitarias WHERE user_id = 'e5555555-5555-4555-8555-555555555555') THEN RAISE EXCEPTION 'TESTE_FALHOU: confeitaria vazia do membro ficou.'; END IF;
END $t$;

-- Conta com dados próprios não entra na equipe (não perde nada sem querer).
SELECT pg_temp.entrar('f6666666-6666-4666-8666-666666666666', 'cheia@x.test');
SET LOCAL ROLE authenticated;
DO $t$ BEGIN
  INSERT INTO public.clientes(nome) VALUES ('Cliente próprio');
  BEGIN PERFORM public.aceitar_convite((SELECT token FROM tokens WHERE papel = 'cheia')); RAISE EXCEPTION 'TESTE_FALHOU: conta com dados entrou.';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM NOT LIKE 'EQUIPE: esta conta já tem uma confeitaria com dados%' THEN RAISE; END IF; END;
END $t$;
RESET ROLE;

-- Gerente: vê e grava na confeitaria A; não gere a equipe.
SELECT pg_temp.entrar('c3333333-3333-4333-8333-333333333333', 'gerente@x.test');
SET LOCAL ROLE authenticated;
DO $t$ BEGIN
  IF (SELECT string_agg(nome, ',') FROM public.produtos) <> 'Bolo da A' THEN RAISE EXCEPTION 'TESTE_FALHOU: gerente não vê os produtos da A.'; END IF;
  IF (SELECT count(*) FROM public.despesas) <> 1 THEN RAISE EXCEPTION 'TESTE_FALHOU: gerente não vê despesas.'; END IF;
  INSERT INTO public.produtos(nome, rendimento, preco_venda) VALUES ('Torta da gerente', 1, 30);
  IF (SELECT user_id FROM public.produtos WHERE nome = 'Torta da gerente') <> 'a1111111-1111-4111-8111-111111111111' THEN
    RAISE EXCEPTION 'TESTE_FALHOU: produto da gerente não ficou na confeitaria A.';
  END IF;
  UPDATE public.confeitarias SET slogan = 'Feito com amor';
  IF NOT FOUND THEN RAISE EXCEPTION 'TESTE_FALHOU: gerente não altera a loja.'; END IF;
  IF (SELECT count(*) FROM public.equipe_membros) <> 2 OR (SELECT count(*) FROM public.equipe_convites) <> 0 THEN
    RAISE EXCEPTION 'TESTE_FALHOU: visão da equipe pela gerente.';
  END IF;
  BEGIN PERFORM public.convidar_membro('nova@x.test', 'gerente'); RAISE EXCEPTION 'TESTE_FALHOU: gerente convidou.';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM NOT LIKE 'EQUIPE: só a conta dona%' THEN RAISE; END IF; END;
  IF (public.meu_papel()->>'confeitaria_id')::uuid <> 'a1111111-1111-4111-8111-111111111111' THEN RAISE EXCEPTION 'TESTE_FALHOU: meu_papel da gerente.'; END IF;
END $t$;
RESET ROLE;

-- Produção: pedidos, produtos e clientes sim; dinheiro, cupons e configurações não.
SELECT pg_temp.entrar('e5555555-5555-4555-8555-555555555555', 'prod@x.test');
SET LOCAL ROLE authenticated;
DO $t$ BEGIN
  IF (SELECT count(*) FROM public.produtos) <> 2 OR (SELECT count(*) FROM public.clientes) <> 1 THEN RAISE EXCEPTION 'TESTE_FALHOU: produção não vê produtos/clientes.'; END IF;
  IF (SELECT count(*) FROM public.despesas) <> 0 OR (SELECT count(*) FROM public.cupons) <> 0 THEN RAISE EXCEPTION 'TESTE_FALHOU: produção viu financeiro/cupons.'; END IF;
  BEGIN
    INSERT INTO public.despesas(descricao, valor, data, categoria) VALUES ('X', 1, current_date, 'Outros');
    RAISE EXCEPTION 'TESTE_FALHOU: produção lançou despesa.';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  UPDATE public.confeitarias SET slogan = 'hackeado';
  IF FOUND THEN RAISE EXCEPTION 'TESTE_FALHOU: produção alterou a loja.'; END IF;
  IF (SELECT nome FROM public.confeitarias) IS NULL THEN RAISE EXCEPTION 'TESTE_FALHOU: produção não lê a loja.'; END IF;
  BEGIN PERFORM public.excluir_compra(gen_random_uuid(), gen_random_uuid()); RAISE EXCEPTION 'TESTE_FALHOU: produção chamou operação de compra.';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM NOT LIKE 'EQUIPE: seu acesso é de produção%' THEN RAISE; END IF; END;
  UPDATE public.produtos SET descricao = 'Atualizado pela produção' WHERE nome = 'Bolo da A';
  IF NOT FOUND THEN RAISE EXCEPTION 'TESTE_FALHOU: produção não edita produto.'; END IF;
END $t$;
RESET ROLE;

-- Isolamento: B continua só com os dados dela.
SELECT pg_temp.entrar('b2222222-2222-4222-8222-222222222222', 'dona@b.test');
SET LOCAL ROLE authenticated;
DO $t$ BEGIN
  IF (SELECT string_agg(nome, ',') FROM public.produtos) <> 'Bolo da B' OR (SELECT count(*) FROM public.equipe_membros) <> 0
     OR (SELECT count(*) FROM public.despesas) <> 0 THEN
    RAISE EXCEPTION 'TESTE_FALHOU: B viu dados ou equipe da A.';
  END IF;
  BEGIN PERFORM public.alterar_membro((SELECT id FROM public.equipe_membros LIMIT 1), NULL); EXCEPTION WHEN OTHERS THEN NULL; END;
END $t$;
RESET ROLE;
DO $t$ BEGIN
  IF (SELECT count(*) FROM public.equipe_membros WHERE dono_id = 'a1111111-1111-4111-8111-111111111111') <> 2 THEN RAISE EXCEPTION 'TESTE_FALHOU: B mexeu na equipe da A.'; END IF;
END $t$;

-- Anônimo vê o convite (para a página do link) mas não os dados.
SET LOCAL ROLE anon;
DO $t$ BEGIN
  IF (public.ver_convite((SELECT token FROM tokens WHERE papel = 'gerente'))->>'aceito')::boolean IS NOT TRUE THEN RAISE EXCEPTION 'TESTE_FALHOU: ver_convite.'; END IF;
  IF public.ver_convite(gen_random_uuid()) IS NOT NULL THEN RAISE EXCEPTION 'TESTE_FALHOU: convite inexistente.'; END IF;
  BEGIN PERFORM 1 FROM public.equipe_membros; RAISE EXCEPTION 'TESTE_FALHOU: anônimo leu a equipe.';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $t$;
RESET ROLE;

-- Dona muda o papel e remove: quem sai volta a não ver nada da A.
SELECT pg_temp.entrar('a1111111-1111-4111-8111-111111111111', 'dona@a.test');
SET LOCAL ROLE authenticated;
DO $t$ BEGIN
  PERFORM public.alterar_membro((SELECT id FROM public.equipe_membros WHERE email = 'gerente@x.test'), 'producao');
  PERFORM public.alterar_membro((SELECT id FROM public.equipe_membros WHERE email = 'prod@x.test'), NULL);
  PERFORM public.cancelar_convite((SELECT id FROM public.equipe_convites WHERE email = 'cheia@x.test'));
  IF (SELECT count(*) FROM public.equipe_membros) <> 1 THEN RAISE EXCEPTION 'TESTE_FALHOU: remoção.'; END IF;
END $t$;
RESET ROLE;
SELECT pg_temp.entrar('e5555555-5555-4555-8555-555555555555', 'prod@x.test');
SET LOCAL ROLE authenticated;
DO $t$ BEGIN
  IF (SELECT count(*) FROM public.produtos) <> 0 THEN RAISE EXCEPTION 'TESTE_FALHOU: removida ainda vê a confeitaria.'; END IF;
END $t$;
RESET ROLE;
SELECT pg_temp.entrar('c3333333-3333-4333-8333-333333333333', 'gerente@x.test');
SET LOCAL ROLE authenticated;
DO $t$ BEGIN
  IF (SELECT count(*) FROM public.despesas) <> 0 THEN RAISE EXCEPTION 'TESTE_FALHOU: rebaixada para produção ainda vê despesas.'; END IF;
  PERFORM public.sair_da_equipe();
  IF (SELECT count(*) FROM public.produtos) <> 0 THEN RAISE EXCEPTION 'TESTE_FALHOU: saiu e ainda vê a confeitaria.'; END IF;
END $t$;
RESET ROLE;

ROLLBACK;
