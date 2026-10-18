-- Permite ajustar apenas preços e encargos de pedidos com produção registrada.
-- Não substitui itens nem altera quantidades produzidas ou movimentos de estoque.
-- Permite atualizar o preço sem mexer na composição física do item produzido.
-- Alterações de produto, descrição, quantidade, custo, exclusão ou quantidade produzida
-- continuam bloqueadas quando já existe produção registrada.
CREATE OR REPLACE FUNCTION public.bloquear_edicao_item_com_producao()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'pg_catalog', 'public'
AS $function$
BEGIN
  IF COALESCE(OLD.quantidade_produzida, 0) > 0 THEN
    IF TG_OP = 'UPDATE'
       AND NEW.user_id IS NOT DISTINCT FROM OLD.user_id
       AND NEW.pedido_id IS NOT DISTINCT FROM OLD.pedido_id
       AND NEW.produto_id IS NOT DISTINCT FROM OLD.produto_id
       AND NEW.descricao IS NOT DISTINCT FROM OLD.descricao
       AND NEW.quantidade IS NOT DISTINCT FROM OLD.quantidade
       AND NEW.custo_unitario IS NOT DISTINCT FROM OLD.custo_unitario
       AND NEW.quantidade_produzida IS NOT DISTINCT FROM OLD.quantidade_produzida THEN
      RETURN NEW;
    END IF;
    RAISE EXCEPTION
      'Este item já tem produção registrada e não pode ser substituído ou excluído. Estorne a produção por um fluxo próprio antes de editar o pedido.';
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.editar_valores_pedido_com_producao(
  p_pedido_id uuid,
  p_itens jsonb,
  p_desconto numeric,
  p_taxa_entrega numeric
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  uid uuid := auth.uid();
  pedido public.pedidos%ROWTYPE;
  item_json jsonb;
  item_id uuid;
  novo_preco numeric;
  total_itens integer;
  enviados integer;
  novo_total numeric(12,2);
  total_pago numeric(12,2);
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'Acesso não autorizado.';
  END IF;
  IF p_pedido_id IS NULL OR jsonb_typeof(p_itens) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'Dados para edição dos valores inválidos.';
  END IF;
  IF p_desconto IS NULL OR p_taxa_entrega IS NULL
     OR p_desconto < 0 OR p_taxa_entrega < 0
     OR p_desconto::text IN ('NaN','Infinity','-Infinity')
     OR p_taxa_entrega::text IN ('NaN','Infinity','-Infinity') THEN
    RAISE EXCEPTION 'Desconto e taxa de entrega devem ser valores válidos e não negativos.';
  END IF;

  SELECT * INTO pedido
  FROM public.pedidos p
  WHERE p.id = p_pedido_id AND p.user_id = uid
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pedido não encontrado ou sem permissão.';
  END IF;
  IF pedido.status = 'cancelado' THEN
    RAISE EXCEPTION 'Não é possível editar valores de um pedido cancelado.';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.pedido_itens pi
    WHERE pi.pedido_id = pedido.id AND pi.user_id = uid
      AND COALESCE(pi.quantidade_produzida, 0) > 0
  ) THEN
    RAISE EXCEPTION 'Esta função é destinada a pedidos com produção registrada.';
  END IF;

  SELECT count(*) INTO total_itens
  FROM public.pedido_itens pi
  WHERE pi.pedido_id = pedido.id AND pi.user_id = uid;
  SELECT count(*) INTO enviados FROM jsonb_array_elements(p_itens);
  IF enviados <> total_itens OR enviados = 0 THEN
    RAISE EXCEPTION 'Não é permitido adicionar, remover ou substituir itens de um pedido com produção. Edite somente os valores.';
  END IF;

  FOR item_json IN SELECT value FROM jsonb_array_elements(p_itens)
  LOOP
    BEGIN
      item_id := (item_json->>'id')::uuid;
      novo_preco := (item_json->>'preco_unitario')::numeric;
    EXCEPTION WHEN OTHERS THEN
      RAISE EXCEPTION 'Item ou preço inválido para edição.';
    END;
    IF item_id IS NULL OR novo_preco IS NULL OR novo_preco < 0
       OR novo_preco::text IN ('NaN','Infinity','-Infinity') THEN
      RAISE EXCEPTION 'Informe um preço válido para cada item.';
    END IF;
    IF (SELECT count(*) FROM jsonb_array_elements(p_itens) x
        WHERE x.value->>'id' = item_id::text) <> 1 THEN
      RAISE EXCEPTION 'Há itens duplicados na solicitação.';
    END IF;
    UPDATE public.pedido_itens pi
    SET preco_unitario = round(novo_preco, 2)
    WHERE pi.id = item_id AND pi.pedido_id = pedido.id AND pi.user_id = uid;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'A lista de itens não corresponde ao pedido atual.';
    END IF;
  END LOOP;

  SELECT GREATEST(0, ROUND(
    COALESCE(SUM(pi.quantidade * pi.preco_unitario), 0)
    + p_taxa_entrega - p_desconto, 2
  )) INTO novo_total
  FROM public.pedido_itens pi
  WHERE pi.pedido_id = pedido.id AND pi.user_id = uid;

  SELECT GREATEST(
    COALESCE((SELECT SUM(pp.valor) FROM public.pedido_pagamentos pp
              WHERE pp.pedido_id = pedido.id AND pp.user_id = uid), 0),
    COALESCE(pedido.valor_entrada, 0)
  ) INTO total_pago;

  IF total_pago > novo_total + 0.009 THEN
    RAISE EXCEPTION 'O novo total (%) é menor que o valor já recebido (%). Ajuste os recebimentos pelo fluxo financeiro antes de reduzir o pedido.', novo_total, total_pago;
  END IF;

  UPDATE public.pedidos
  SET desconto = round(p_desconto, 2),
      taxa_entrega = round(p_taxa_entrega, 2),
      valor_entrada = LEAST(novo_total, total_pago),
      saldo_quitado = (total_pago >= novo_total - 0.009)
  WHERE id = pedido.id AND user_id = uid;

  RETURN jsonb_build_object('pedido_id', pedido.id, 'total', novo_total, 'valor_pago', total_pago,
                            'saldo_quitado', total_pago >= novo_total - 0.009);
END;
$function$;

REVOKE ALL ON FUNCTION public.editar_valores_pedido_com_producao(uuid, jsonb, numeric, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.editar_valores_pedido_com_producao(uuid, jsonb, numeric, numeric) TO authenticated, service_role;
COMMENT ON FUNCTION public.editar_valores_pedido_com_producao(uuid, jsonb, numeric, numeric) IS
  'Permite alterar somente preços, desconto e taxa de entrega de pedido com produção registrada, sem alterar itens físicos nem gerar movimentos de estoque.';
NOTIFY pgrst, 'reload schema';
