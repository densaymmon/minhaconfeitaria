-- Draft migration 0011: only the production RPC may set produced quantities.
-- salvar_pedido() rebuilds pedido_itens. It must not accept a client-supplied
-- quantidade_produzida value, because that would create production without
-- corresponding append-only stock movements.

CREATE OR REPLACE FUNCTION public.salvar_pedido(
  payload jsonb,
  itens jsonb,
  registro_id uuid DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  r public.pedidos;
  rid uuid;
  item jsonb;
  uid uuid := auth.uid();
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Acesso não autorizado.'; END IF;
  IF jsonb_typeof(payload) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'Dados do pedido inválidos.';
  END IF;
  IF jsonb_typeof(itens) IS DISTINCT FROM 'array'
     OR jsonb_array_length(itens) NOT BETWEEN 1 AND 100 THEN
    RAISE EXCEPTION 'Adicione de 1 a 100 itens.';
  END IF;

  r := jsonb_populate_record(NULL::public.pedidos, payload);

  IF registro_id IS NULL THEN
    INSERT INTO public.pedidos(
      cliente_id, data_entrega, hora_entrega, status, forma_pagamento,
      valor_entrada, saldo_quitado, desconto, taxa_entrega, observacoes
    ) VALUES (
      r.cliente_id, r.data_entrega, r.hora_entrega, r.status, r.forma_pagamento,
      r.valor_entrada, r.saldo_quitado, r.desconto, r.taxa_entrega, r.observacoes
    )
    RETURNING id INTO rid;
  ELSE
    UPDATE public.pedidos
    SET cliente_id = r.cliente_id,
        data_entrega = r.data_entrega,
        hora_entrega = r.hora_entrega,
        status = r.status,
        forma_pagamento = r.forma_pagamento,
        valor_entrada = r.valor_entrada,
        saldo_quitado = r.saldo_quitado,
        desconto = r.desconto,
        taxa_entrega = r.taxa_entrega,
        observacoes = r.observacoes
    WHERE id = registro_id AND user_id = uid
    RETURNING id INTO rid;

    IF rid IS NULL THEN RAISE EXCEPTION 'Pedido não encontrado.'; END IF;

    -- The production guard in migration 0010 rejects replacement while any
    -- quantity remains produced. After an explicit stock reversal to zero,
    -- replacing the item rows is safe and leaves prior ledger snapshots intact.
    DELETE FROM public.pedido_itens
    WHERE pedido_id = rid AND user_id = uid;
  END IF;

  FOR item IN SELECT value FROM jsonb_array_elements(itens)
  LOOP
    INSERT INTO public.pedido_itens(
      user_id, pedido_id, produto_id, descricao, quantidade,
      preco_unitario, custo_unitario, quantidade_produzida
    ) VALUES (
      uid,
      rid,
      (item->>'produto_id')::uuid,
      item->>'descricao',
      (item->>'quantidade')::numeric,
      (item->>'preco_unitario')::numeric,
      (item->>'custo_unitario')::numeric,
      0
    );
  END LOOP;

  RETURN rid;
END;
$function$;

REVOKE ALL ON FUNCTION public.salvar_pedido(jsonb,jsonb,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.salvar_pedido(jsonb,jsonb,uuid) TO authenticated, service_role;

COMMENT ON FUNCTION public.salvar_pedido(jsonb,jsonb,uuid) IS
  'Saves order data while rebuilding item rows only when safe. Produced quantities are always reset to zero on new rows and can only be changed by ajustar_producao, which records matching stock movements.';
