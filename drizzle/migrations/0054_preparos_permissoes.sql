-- 0054: correção da 0053. salvar_preparo e o trigger de recálculo rodam com o acesso de quem está
-- logado (SECURITY INVOKER), então o papel authenticated precisa executar as duas funções de custo.
-- Elas também são SECURITY INVOKER: só leem e alteram linhas que o RLS do tenant já permite.
-- Sem isso, salvar um recheio/cobertura dava "permission denied for function _atualizar_custo_preparo".
-- Aplicada em produção em 18/11/2026. Idempotente.
BEGIN;
GRANT EXECUTE ON FUNCTION public._custo_preparo(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public._atualizar_custo_preparo(uuid) TO authenticated;
NOTIFY pgrst, 'reload schema';
COMMIT;
