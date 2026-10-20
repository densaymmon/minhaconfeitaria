-- Exclusão segura de recorrências sem apagar pedidos confirmados, pagamentos ou histórico.
ALTER TABLE public.pedidos_recorrentes
  ADD COLUMN IF NOT EXISTS excluida boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.excluir_pedidos_recorrentes(
  p_recorrencia_id uuid DEFAULT NULL,
  p_cliente_id uuid DEFAULT NULL
) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE
  v_cliente_id uuid;
  v_total integer := 0;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Acesso não autorizado.';
  END IF;
  IF (p_recorrencia_id IS NULL) = (p_cliente_id IS NULL) THEN
    RAISE EXCEPTION 'Informe uma recorrência ou um cliente, mas não ambos.';
  END IF;

  IF p_recorrencia_id IS NOT NULL THEN
    SELECT r.cliente_id INTO v_cliente_id
    FROM public.pedidos_recorrentes r
    WHERE r.id = p_recorrencia_id AND r.user_id = auth.uid() AND NOT r.excluida
    FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Recorrência não encontrada ou já excluída.'; END IF;
  ELSE
    IF NOT EXISTS (
      SELECT 1 FROM public.clientes c
      WHERE c.id = p_cliente_id AND c.user_id = auth.uid()
    ) THEN RAISE EXCEPTION 'Cliente não encontrado.'; END IF;
    v_cliente_id := p_cliente_id;
  END IF;

  -- Oculta a recorrência e interrompe novas entregas. Pedidos já confirmados
  -- e suas ocorrências vinculadas permanecem intactos para preservar o histórico.
  UPDATE public.pedidos_recorrentes
  SET excluida = true, ativa = false, updated_at = now()
  WHERE user_id = auth.uid()
    AND cliente_id = v_cliente_id
    AND NOT excluida
    AND (p_recorrencia_id IS NULL OR id = p_recorrencia_id);
  GET DIAGNOSTICS v_total = ROW_COUNT;

  UPDATE public.pedidos_recorrentes_ocorrencias o
  SET status = 'cancelada', updated_at = now()
  FROM public.pedidos_recorrentes r
  WHERE o.recorrencia_id = r.id
    AND r.user_id = auth.uid()
    AND r.cliente_id = v_cliente_id
    AND r.excluida
    AND o.user_id = auth.uid()
    AND o.status = 'pendente'
    AND o.pedido_id IS NULL
    AND (p_recorrencia_id IS NULL OR r.id = p_recorrencia_id);

  RETURN v_total;
END;
$$;

REVOKE ALL ON FUNCTION public.excluir_pedidos_recorrentes(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.excluir_pedidos_recorrentes(uuid, uuid) TO authenticated, service_role;
NOTIFY pgrst, 'reload schema';
