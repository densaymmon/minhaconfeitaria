-- Mantém todos os estados usados pelo aplicativo, incluindo "finalizado".
-- Idempotente: pode ser executada novamente sem alterar o esquema quando já estiver correta.
BEGIN;

DO $$
DECLARE
  definicao text;
BEGIN
  SELECT pg_get_constraintdef(c.oid)
    INTO definicao
  FROM pg_constraint c
  JOIN pg_class t ON t.oid = c.conrelid
  JOIN pg_namespace n ON n.oid = t.relnamespace
  WHERE n.nspname = 'public'
    AND t.relname = 'pedidos'
    AND c.conname = 'pedidos_status_check'
    AND c.contype = 'c';

  IF definicao IS NULL THEN
    RAISE EXCEPTION 'Constraint public.pedidos.pedidos_status_check não encontrada; nenhuma alteração aplicada.';
  END IF;

  IF position('finalizado' in definicao) = 0 THEN
    ALTER TABLE public.pedidos DROP CONSTRAINT pedidos_status_check;
    ALTER TABLE public.pedidos
      ADD CONSTRAINT pedidos_status_check
      CHECK (status IN ('recebido', 'confirmado', 'em_producao', 'pronto', 'finalizado', 'entregue', 'cancelado'));
  END IF;
END
$$;

COMMIT;
