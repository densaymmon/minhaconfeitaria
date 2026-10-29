\set ON_ERROR_STOP on
-- Etapa F: a migração 0048 retira dos anônimos todo privilégio de tabela/sequência do schema public,
-- exceto SELECT em planos. Simula o estado de produção (anon com todos os privilégios) e reaplica
-- a migração; depois confere o resultado e que ela é idempotente. Este teste confirma as
-- permissões finais; não precisa de dados.
-- Atenção: a migração faz COMMIT, então este teste não usa transação externa (o banco do CI é descartável).
GRANT ALL ON ALL TABLES IN SCHEMA public TO anon;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon;

\i drizzle/migrations/0048_revogar_privilegios_anon.sql
\i drizzle/migrations/0048_revogar_privilegios_anon.sql

DO $t$
DECLARE r record; extra text := '';
BEGIN
  FOR r IN
    SELECT c.relname, c.relkind
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p', 'v', 'm', 'S')
  LOOP
    IF r.relkind = 'S' THEN
      IF has_sequence_privilege('anon', format('public.%I', r.relname), 'USAGE, SELECT, UPDATE') THEN
        extra := extra || r.relname || ' ';
      END IF;
    ELSIF r.relname = 'planos' THEN
      IF NOT has_table_privilege('anon', 'public.planos', 'SELECT') THEN
        RAISE EXCEPTION 'TESTE_FALHOU: anon perdeu SELECT em planos.';
      END IF;
      IF has_table_privilege('anon', 'public.planos', 'INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER') THEN
        RAISE EXCEPTION 'TESTE_FALHOU: anon tem escrita em planos.';
      END IF;
    ELSIF has_table_privilege('anon', format('public.%I', r.relname), 'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER') THEN
      extra := extra || r.relname || ' ';
    END IF;
  END LOOP;
  IF extra <> '' THEN RAISE EXCEPTION 'TESTE_FALHOU: anon ainda tem privilégio em: %', extra; END IF;
END
$t$;

-- Tabela nova criada depois também nasce sem privilégio para anon.
CREATE TABLE public.zz_teste_anon_privilegio (id int);
DO $t2$
BEGIN
  IF has_table_privilege('anon', 'public.zz_teste_anon_privilegio', 'SELECT, INSERT, UPDATE, DELETE') THEN
    RAISE EXCEPTION 'TESTE_FALHOU: tabela nova nasceu com privilégio para anon.';
  END IF;
END
$t2$;
DROP TABLE public.zz_teste_anon_privilegio;
