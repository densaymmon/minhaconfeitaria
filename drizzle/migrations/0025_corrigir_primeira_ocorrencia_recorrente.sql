-- Corrige a preparação da primeira ocorrência de pedidos recorrentes.
-- A RPC de confirmação usa a hora específica da ocorrência; coluna aditiva e segura.
ALTER TABLE public.pedidos_recorrentes_ocorrencias
  ADD COLUMN IF NOT EXISTS hora_entrega text;

-- O status é definido pelo DEFAULT ('pendente') no banco. Não conceder ao cliente
-- permissão para forjar status/pedido_id; os formulários devem omitir status no INSERT.
-- Permitir gravar o horário da ocorrência e preservá-lo ao preparar próximas entregas.
GRANT INSERT (recorrencia_id, data_entrega, itens, observacoes, hora_entrega)
  ON public.pedidos_recorrentes_ocorrencias TO authenticated;

NOTIFY pgrst, 'reload schema';
