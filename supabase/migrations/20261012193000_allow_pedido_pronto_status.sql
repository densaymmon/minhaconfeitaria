-- Inclui o status "pronto" preservando a expressão e os status já válidos.
-- "Pronto" significa produção concluída e aguardando entrega ao cliente.
DO $$
DECLARE
  definicao_check text;
  expressao_check text;
BEGIN
  SELECT pg_get_constraintdef(c.oid)
    INTO definicao_check
  FROM pg_constraint c
  JOIN pg_class t ON t.oid = c.conrelid
  JOIN pg_namespace n ON n.oid = t.relnamespace
  WHERE n.nspname = 'public'
    AND t.relname = 'pedidos'
    AND c.conname = 'pedidos_status_check'
    AND c.contype = 'c';

  IF definicao_check IS NULL THEN
    RAISE EXCEPTION 'Constraint public.pedidos.pedidos_status_check não encontrada; nenhuma alteração foi aplicada.';
  END IF;

  expressao_check := regexp_replace(definicao_check, '^CHECK\s*', '', 'i');

  ALTER TABLE public.pedidos DROP CONSTRAINT pedidos_status_check;

  EXECUTE format(
    'ALTER TABLE public.pedidos ADD CONSTRAINT pedidos_status_check CHECK ((%s) OR status IN (%L, %L, %L))',
    expressao_check,
    'finalizado',
    'entregue',
    'pronto'
  );
END
$$;
