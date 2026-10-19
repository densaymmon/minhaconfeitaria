-- Corrige ambientes em que a migração inicial da chave Pix ainda não foi aplicada
-- ou em que o PostgREST manteve o cache do schema desatualizado.
-- Idempotente: preserva o valor existente e não altera os demais dados.
alter table public.configuracoes
  add column if not exists pix_chave text not null default '';

notify pgrst, 'reload schema';
