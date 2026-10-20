-- Cria ocorrências por uma RPC controlada para respeitar as permissões restritas da tabela.
-- O cliente não recebe permissão direta para inserir status ou pedido_id.
CREATE OR REPLACE FUNCTION public.preparar_ocorrencia_recorrente(
  p_recorrencia_id uuid,
  p_data_entrega date,
  p_hora_entrega text,
  p_itens jsonb,
  p_observacoes text
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  recorrencia public.pedidos_recorrentes;
  nova_ocorrencia uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Acesso não autorizado.';
  END IF;

  SELECT * INTO recorrencia
  FROM public.pedidos_recorrentes
  WHERE id = p_recorrencia_id AND user_id = auth.uid()
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Recorrência não encontrada para esta conta.';
  END IF;
  IF NOT recorrencia.ativa THEN
    RAISE EXCEPTION 'Esta recorrência está pausada.';
  END IF;
  IF p_data_entrega < recorrencia.data_inicio
     OR (recorrencia.data_fim IS NOT NULL AND p_data_entrega > recorrencia.data_fim) THEN
    RAISE EXCEPTION 'A data da entrega está fora do período da recorrência.';
  END IF;
  IF p_itens IS NULL OR jsonb_typeof(p_itens) <> 'array' THEN
    RAISE EXCEPTION 'Os itens da ocorrência devem ser uma lista.';
  END IF;

  INSERT INTO public.pedidos_recorrentes_ocorrencias
    (user_id, recorrencia_id, data_entrega, hora_entrega, itens, observacoes)
  VALUES
    (auth.uid(), p_recorrencia_id, p_data_entrega, p_hora_entrega, p_itens,
     COALESCE(p_observacoes, recorrencia.observacoes))
  RETURNING id INTO nova_ocorrencia;

  RETURN nova_ocorrencia;
END;
$$;

REVOKE ALL ON FUNCTION public.preparar_ocorrencia_recorrente(uuid,date,text,jsonb,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.preparar_ocorrencia_recorrente(uuid,date,text,jsonb,text) TO authenticated, service_role;
NOTIFY pgrst, 'reload schema';
