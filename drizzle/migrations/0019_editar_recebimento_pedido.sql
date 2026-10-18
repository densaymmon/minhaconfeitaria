-- Permite corrigir um recebimento já registrado, recalculando o total pago do pedido.
-- A alteração é transacional e restrita ao proprietário do pedido/pagamento.
CREATE OR REPLACE FUNCTION public.editar_recebimento_pedido(
  p_pagamento_id uuid,
  p_valor numeric,
  p_data_pagamento date,
  p_forma_pagamento text,
  p_observacoes text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  uid uuid := auth.uid();
  pagamento public.pedido_pagamentos%ROWTYPE;
  pedido public.pedidos%ROWTYPE;
  total_pedido numeric(12,2);
  pago_sem_pagamento numeric(12,2);
  novo_total_pago numeric(12,2);
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'Acesso não autorizado.';
  END IF;
  IF p_pagamento_id IS NULL OR p_valor IS NULL OR p_valor <= 0
     OR p_valor::text IN ('NaN', 'Infinity', '-Infinity') THEN
    RAISE EXCEPTION 'Informe um valor de pagamento válido.';
  END IF;
  IF p_data_pagamento IS NULL OR p_data_pagamento > CURRENT_DATE THEN
    RAISE EXCEPTION 'A data do pagamento é inválida.';
  END IF;
  IF p_forma_pagamento NOT IN ('pix','dinheiro','debito','credito','transferencia','outros') THEN
    RAISE EXCEPTION 'Selecione uma forma de pagamento válida.';
  END IF;

  SELECT * INTO pagamento
  FROM public.pedido_pagamentos pp
  WHERE pp.id = p_pagamento_id AND pp.user_id = uid
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pagamento não encontrado ou sem permissão.';
  END IF;

  SELECT * INTO pedido
  FROM public.pedidos p
  WHERE p.id = pagamento.pedido_id AND p.user_id = uid
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pedido não encontrado ou sem permissão.';
  END IF;
  IF pedido.status = 'cancelado' THEN
    RAISE EXCEPTION 'Não é possível editar pagamento de pedido cancelado.';
  END IF;

  SELECT GREATEST(0, ROUND(
    COALESCE(SUM(pi.quantidade * pi.preco_unitario), 0)
    + COALESCE(pedido.taxa_entrega, 0)
    - COALESCE(pedido.desconto, 0), 2
  )) INTO total_pedido
  FROM public.pedido_itens pi
  WHERE pi.pedido_id = pedido.id AND pi.user_id = uid;

  -- Preserva pagamentos legados que não possuem linha no histórico e substitui
  -- somente o valor da linha editada. Permite reduzir uma entrada parcial.
  pago_sem_pagamento := GREATEST(
    COALESCE((SELECT SUM(pp.valor) FROM public.pedido_pagamentos pp
              WHERE pp.pedido_id = pedido.id AND pp.user_id = uid AND pp.id <> pagamento.id), 0),
    GREATEST(0, COALESCE(pedido.valor_entrada, 0) - pagamento.valor)
  );
  novo_total_pago := ROUND(pago_sem_pagamento + p_valor, 2);
  IF novo_total_pago > total_pedido + 0.009 THEN
    RAISE EXCEPTION 'O valor editado excede o total do pedido. O máximo permitido para este pagamento é %.',
      GREATEST(0, ROUND(total_pedido - pago_sem_pagamento, 2));
  END IF;

  UPDATE public.pedido_pagamentos
  SET valor = ROUND(p_valor, 2),
      data_pagamento = p_data_pagamento,
      forma_pagamento = p_forma_pagamento,
      observacoes = NULLIF(btrim(p_observacoes), '')
  WHERE id = pagamento.id AND user_id = uid;

  UPDATE public.pedidos
  SET valor_entrada = LEAST(total_pedido, novo_total_pago),
      saldo_quitado = (novo_total_pago >= total_pedido - 0.009)
  WHERE id = pedido.id AND user_id = uid;

  RETURN pagamento.id;
END;
$function$;

REVOKE ALL ON FUNCTION public.editar_recebimento_pedido(uuid, numeric, date, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.editar_recebimento_pedido(uuid, numeric, date, text, text) TO authenticated, service_role;

COMMENT ON FUNCTION public.editar_recebimento_pedido(uuid, numeric, date, text, text) IS
  'Edita um recebimento existente e recalcula valor_entrada/saldo_quitado sem criar pagamento duplicado.';
