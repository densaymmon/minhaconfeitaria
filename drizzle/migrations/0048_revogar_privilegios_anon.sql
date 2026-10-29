-- Etapa F (auditoria): defesa em profundidade — o visitante anônimo (papel "anon") não deve
-- ter privilégio de tabela nenhum, exceto a leitura dos preços dos planos.
--
-- Situação: no Supabase o papel anon recebe, por padrão, todos os privilégios de tabela do schema
-- public. Hoje isso é inofensivo porque toda tabela tem RLS ligada e nenhuma política vale para
-- anon (exceto planos_leitura), então o anônimo enxerga 0 linhas (tests/db/anonimo-sem-acesso-smoke.sql).
-- Mas uma única tabela futura criada sem RLS ficaria aberta para a internet. Retirar o privilégio
-- elimina essa classe de erro: sem o privilégio, a tabela fica fechada mesmo sem RLS.
--
-- O catálogo público NÃO depende destes privilégios: ele usa funções SECURITY DEFINER
-- (catalogo_publico etc.), cujo EXECUTE não é alterado aqui. O único acesso direto de anon a tabela
-- que o app usa é SELECT em planos (tela de planos antes do login) — mantido.
--
-- Aditiva e reversível: só retira privilégios, não altera tabelas, dados, políticas nem funções.
-- Rollback: GRANT ALL ON TABLE <tabela> TO anon; (ou o conjunto original arwdDxtm) e
-- GRANT USAGE, SELECT, UPDATE ON SEQUENCE public.pedidos_numero_seq TO anon;
-- Idempotente: pode ser reaplicada sem efeito colateral.
--
-- Os privilégios padrão (ALTER DEFAULT PRIVILEGES) são ajustados para o papel que executa a
-- migração; os do papel supabase_admin, se existirem, precisam ser ajustados por esse papel.

BEGIN;

REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon;
GRANT SELECT ON TABLE public.planos TO anon;

ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon;

COMMIT;
