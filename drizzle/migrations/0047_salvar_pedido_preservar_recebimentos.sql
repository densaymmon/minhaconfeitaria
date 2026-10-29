-- Etapa C (auditoria): salvar_pedido não pode sobrescrever o valor pago de um pedido
-- que já tem recebimentos registrados.
--
-- Problema: ao editar um pedido, salvar_pedido gravava valor_entrada e saldo_quitado vindos
-- do navegador. Se outro aparelho tivesse registrado um recebimento depois que a tela foi
-- carregada, o aparelho desatualizado voltava o valor pago para o valor antigo, enquanto
-- pedido_pagamentos (a fonte da verdade) mantinha o recebimento: histórico e pedido divergiam.
--
-- Correção: quando o pedido já possui linhas em pedido_pagamentos, valor_entrada e
-- saldo_quitado só mudam pelas RPCs registrar_recebimento_pedido / editar_recebimento_pedido
-- (que mantêm os dois em sincronia). Pedidos sem recebimentos registrados (inclusive os
-- legados marcados como quitados) continuam usando os valores enviados, como antes.
--
-- Aditiva: só substitui o corpo da função; não altera tabelas nem dados. Reversível ao
-- reaplicar a definição da migração 0011. Continua SECURITY INVOKER e filtrando pelo tenant.

BEGIN;

CREATE OR REPLACE FUNCTION public.salvar_pedido(payload jsonb, itens jsonb, registro_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  r public.pedidos;
  rid uuid;
  item jsonb;
  uid uuid := public._tenant();
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
    UPDATE public.pedidos p
    SET cliente_id = r.cliente_id,
        data_entrega = r.data_entrega,
        hora_entrega = r.hora_entrega,
        status = r.status,
        forma_pagamento = r.forma_pagamento,
        -- Com recebimentos registrados, o valor pago pertence a pedido_pagamentos.
        valor_entrada = CASE WHEN EXISTS (
            SELECT 1 FROM public.pedido_pagamentos pg
            WHERE pg.pedido_id = p.id AND pg.user_id = uid
          ) THEN p.valor_entrada ELSE r.valor_entrada END,
        saldo_quitado = CASE WHEN EXISTS (
            SELECT 1 FROM public.pedido_pagamentos pg
            WHERE pg.pedido_id = p.id AND pg.user_id = uid
          ) THEN p.saldo_quitado ELSE r.saldo_quitado END,
        desconto = r.desconto,
        taxa_entrega = r.taxa_entrega,
        observacoes = r.observacoes
    WHERE p.id = registro_id AND p.user_id = uid
    RETURNING p.id INTO rid;

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

COMMIT;
