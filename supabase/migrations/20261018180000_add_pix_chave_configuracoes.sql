-- Chave Pix opcional usada nos recibos enviados aos clientes.
-- A coluna recebe valor vazio por padrão para preservar configurações existentes.
alter table public.configuracoes
  add column if not exists pix_chave text not null default '';
