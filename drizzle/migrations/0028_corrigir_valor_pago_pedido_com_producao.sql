-- Permite corrigir o valor pago de pedidos com produção sem mexer nos itens ou no estoque.
-- A função só trata o valor legado quando ainda não há recebimentos detalhados.
CREATE OR REPLACE FUNCTION public.corrigir_valor_pago_pedido_com_producao(
  p_pedido_id uuid,
  p_valor_pago numeric
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  uid uuid := auth.uid();
  pedido public.pedidos%ROWTYPE;
  total_pedido numeric(12,2);
  valor_pago numeric(12,2);
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'Acesso não autorizado.';
  END IF;
  IF p_pedido_id IS NULL OR p_valor_pago IS NULL
     OR p_valor_pago < 0
     OR p_valor_pago::text IN ('NaN', 'Infinity', '-Infinity') THEN
    RAISE EXCEPTION 'Informe um valor pago válido, igual ou maior que zero.';
  END IF;

  SELECT * INTO pedido
  FROM public.pedidos p
  WHERE p.id = p_pedido_id AND p.user_id = uid
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pedido não encontrado ou sem permissão.';
  END IF;
  IF pedido.status = 'cancelado' THEN
    RAISE EXCEPTION 'Não é possível corrigir o pagamento de um pedido cancelado.';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.pedido_itens pi
    WHERE pi.pedido_id = pedido.id AND pi.user_id = uid
      AND COALESCE(pi.quantidade_produzida, 0) > 0
  ) THEN
    RAISE EXCEPTION 'Esta função é destinada a pedidos com produção registrada.';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.pedido_pagamentos pp
    WHERE pp.pedido_id = pedido.id AND pp.user_id = uid
  ) THEN
    RAISE EXCEPTION 'Este pedido possui pagamentos no histórico. Edite o recebimento correspondente no histórico de pagamentos.';
  END IF;

  SELECT GREATEST(0, ROUND(
    COALESCE(SUM(pi.quantidade * pi.preco_unitario), 0)
    + COALESCE(pedido.taxa_entrega, 0)
    - COALESCE(pedido.desconto, 0), 2
  )) INTO total_pedido
  FROM public.pedido_itens pi
  WHERE pi.pedido_id = pedido.id AND pi.user_id = uid;

  valor_pago := ROUND(p_valor_pago, 2);
  IF valor_pago > total_pedido + 0.009 THEN
    RAISE EXCEPTION 'O valor pago não pode ser maior que o total do pedido (%).', total_pedido;
  END IF;

  UPDATE public.pedidos
  SET valor_entrada = valor_pago,
      saldo_quitado = (valor_pago >= total_pedido - 0.009)
  WHERE id = pedido.id AND user_id = uid;

  RETURN jsonb_build_object(
    'pedido_id', pedido.id,
    'total', total_pedido,
    'valor_pago', valor_pago,
    'saldo_quitado', valor_pago >= total_pedido - 0.009
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.corrigir_valor_pago_pedido_com_producao(uuid, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.corrigir_valor_pago_pedido_com_producao(uuid, numeric) TO authenticated, service_role;
COMMENT ON FUNCTION public.corrigir_valor_pago_pedido_com_producao(uuid, numeric) IS
  'Corrige o valor pago de pedido com produção somente quando não há recebimentos detalhados; não altera itens nem estoque.';
NOTIFY pgrst, 'reload schema';
