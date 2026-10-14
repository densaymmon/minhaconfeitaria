-- Compatibilidade com a tela de compras: mantém a data de cancelamento sem apagar o registro.
alter table public.compras
  add column if not exists cancelada_em timestamptz;
