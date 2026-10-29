\set ON_ERROR_STOP on
-- Etapa F: visitante anônimo (catálogo público) nunca lê tabelas diretamente.
-- Garante que (1) toda tabela do schema public tem RLS ligada, (2) nenhuma política vale para
-- anon/public além de "planos_leitura" (preços dos planos, públicos de propósito) e
-- (3) mesmo com dados reais no banco, o anônimo enxerga 0 linhas em qualquer tabela, exceto planos.
-- Se uma tabela nova esquecer a RLS, este teste falha.
BEGIN;
INSERT INTO auth.users(id) VALUES ('f1f1f1f1-f1f1-4f1f-8f1f-f1f1f1f1f1f1');
SELECT set_config('request.jwt.claim.sub', 'f1f1f1f1-f1f1-4f1f-8f1f-f1f1f1f1f1f1', true);

DO $seed$
DECLARE
  uid uuid := 'f1f1f1f1-f1f1-4f1f-8f1f-f1f1f1f1f1f1';
  cli uuid; prod uuid;
BEGIN
  INSERT INTO public.clientes(user_id, nome, telefone) VALUES (uid, 'Cliente anon teste', '19999990000') RETURNING id INTO cli;
  INSERT INTO public.produtos(user_id, nome, rendimento, preco_venda) VALUES (uid, 'Produto anon teste', 1, 10) RETURNING id INTO prod;
  PERFORM public.salvar_pedido(jsonb_build_object(
      'cliente_id', cli, 'data_entrega', current_date, 'status', 'recebido', 'forma_pagamento', 'pix',
      'valor_entrada', 0, 'saldo_quitado', false, 'desconto', 0, 'taxa_entrega', 0),
    jsonb_build_array(jsonb_build_object('produto_id', prod, 'descricao', 'Produto anon teste',
      'quantidade', 1, 'preco_unitario', 10, 'custo_unitario', 2)));
END
$seed$;

DO $rls$
DECLARE sem_rls text;
BEGIN
  SELECT string_agg(c.relname, ', ') INTO sem_rls
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p') AND NOT c.relrowsecurity;
  IF sem_rls IS NOT NULL THEN RAISE EXCEPTION 'TESTE_FALHOU: tabelas sem RLS: %', sem_rls; END IF;
  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND ('anon' = ANY (roles) OR 'public' = ANY (roles)) AND policyname <> 'planos_leitura'
  ) THEN
    RAISE EXCEPTION 'TESTE_FALHOU: política aplicável a anon/public além de planos_leitura.';
  END IF;
END
$rls$;

-- Em produção (Supabase) o papel anon recebe privilégios de tabela por padrão; a RLS é o que o bloqueia.
-- Reproduz isso aqui (a transação é desfeita no fim) para que o teste valha em qualquer ambiente.
GRANT SELECT ON ALL TABLES IN SCHEMA public TO anon;
SET LOCAL ROLE anon;
DO $anon$
DECLARE t record; n bigint; vazadas text := '';
BEGIN
  FOR t IN
    SELECT c.relname FROM pg_class c JOIN pg_namespace ns ON ns.oid = c.relnamespace
    WHERE ns.nspname = 'public' AND c.relkind IN ('r', 'p') AND c.relname <> 'planos'
      AND has_table_privilege('anon', c.oid, 'SELECT')
  LOOP
    EXECUTE format('SELECT count(*) FROM public.%I', t.relname) INTO n;
    IF n > 0 THEN vazadas := vazadas || t.relname || '(' || n || ') '; END IF;
  END LOOP;
  IF vazadas <> '' THEN RAISE EXCEPTION 'TESTE_FALHOU: anônimo leu linhas de: %', vazadas; END IF;
END
$anon$;
RESET ROLE;

ROLLBACK;
