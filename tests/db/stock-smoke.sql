\set ON_ERROR_STOP on
BEGIN;

INSERT INTO auth.users(id) VALUES ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
SELECT set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', true);

DO $test$
DECLARE
  uid uuid := 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  iid uuid;
  pid uuid;
  pid2 uuid;
  receita_id uuid;
  pedido uuid;
  item_id uuid;
  compra uuid;
  saldo numeric;
  produzida numeric;
  custo_corrigido numeric;
  itens_corrigidos integer;
  conta_id uuid;
  conta_cancelada_id uuid;
  status_conta text;
  data_pagamento_conta date;
  compra_exclusao uuid;
  compra_com_conta_ativa uuid;
  conta_exclusao_id uuid;
  conta_ativa_id uuid;
BEGIN
  INSERT INTO public.contas_pagar(
    user_id, descricao, fornecedor, data_emissao, data_vencimento, valor, valor_pago
  ) VALUES (uid, 'Conta teste', 'Fornecedor teste', current_date, current_date, 100, 0)
  RETURNING id INTO conta_id;
  SELECT status INTO status_conta FROM public.contas_pagar WHERE id = conta_id;
  IF status_conta <> 'pendente' THEN RAISE EXCEPTION 'Conta nova deveria iniciar pendente: %', status_conta; END IF;

  UPDATE public.contas_pagar SET valor_pago = 40 WHERE id = conta_id;
  SELECT status, data_pagamento INTO status_conta, data_pagamento_conta
  FROM public.contas_pagar WHERE id = conta_id;
  IF status_conta <> 'parcial' OR data_pagamento_conta IS NULL THEN
    RAISE EXCEPTION 'Pagamento parcial não atualizou status/data: %, %', status_conta, data_pagamento_conta;
  END IF;

  UPDATE public.contas_pagar SET valor_pago = 100 WHERE id = conta_id;
  SELECT status INTO status_conta FROM public.contas_pagar WHERE id = conta_id;
  IF status_conta <> 'pago' THEN RAISE EXCEPTION 'Conta totalmente paga não mudou para paga: %', status_conta; END IF;

  INSERT INTO public.contas_pagar(
    user_id, descricao, data_emissao, data_vencimento, valor, valor_pago
  ) VALUES (uid, 'Conta cancelada teste', current_date, current_date, 50, 0)
  RETURNING id INTO conta_cancelada_id;
  UPDATE public.contas_pagar SET status = 'cancelado' WHERE id = conta_cancelada_id;
  SELECT status INTO status_conta FROM public.contas_pagar WHERE id = conta_cancelada_id;
  IF status_conta <> 'cancelado' THEN RAISE EXCEPTION 'Conta sem pagamento não foi cancelada: %', status_conta; END IF;

  INSERT INTO public.insumos(
    user_id, nome, unidade, preco_unidade, preco_embalagem,
    quantidade_embalagem, unidade_embalagem
  ) VALUES (uid, 'Insumo teste farinha', 'g', 0.01, 10, 1000, 'g')
  RETURNING id INTO iid;

  compra := public.salvar_compra(
    '{"data_compra":"2026-10-14"}'::jsonb,
    jsonb_build_array(jsonb_build_object(
      'insumo_id', iid, 'quantidade', 100, 'unidade', 'g', 'preco_unitario', 0.01
    )),
    NULL,
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
  );

  SELECT s.saldo INTO saldo FROM public.saldo_estoque() s WHERE s.insumo_id = iid;
  IF saldo <> 100 THEN RAISE EXCEPTION 'Compra não refletida no estoque: %', saldo; END IF;

  -- Replaying the same purchase event must return the original purchase and not
  -- append another entry movement.
  IF public.salvar_compra(
    '{"data_compra":"2026-10-14"}'::jsonb,
    jsonb_build_array(jsonb_build_object(
      'insumo_id', iid, 'quantidade', 100, 'unidade', 'g', 'preco_unitario', 0.01
    )),
    NULL,
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
  ) <> compra THEN
    RAISE EXCEPTION 'Retry idempotente da compra não retornou a compra original.';
  END IF;
  SELECT s.saldo INTO saldo FROM public.saldo_estoque() s WHERE s.insumo_id = iid;
  IF saldo <> 100 THEN RAISE EXCEPTION 'Retry da compra duplicou o estoque: %', saldo; END IF;

  -- Editing a purchase must reverse the previous entry and append the new one;
  -- 0.15 kg must normalize to 150 g for this ingredient.
  compra := public.salvar_compra(
    '{"data_compra":"2026-10-14"}'::jsonb,
    jsonb_build_array(jsonb_build_object(
      'insumo_id', iid, 'quantidade', 0.15, 'unidade', 'kg', 'preco_unitario', 10
    )),
    compra,
    '14141414-1414-4414-8414-141414141414'
  );
  SELECT s.saldo INTO saldo FROM public.saldo_estoque() s WHERE s.insumo_id = iid;
  IF saldo <> 150 THEN RAISE EXCEPTION 'Edição/conversão da compra incorreta: %', saldo; END IF;

  PERFORM public.cancelar_compra(compra, 'cccccccc-cccc-4ccc-8ccc-cccccccccccc');
  PERFORM public.cancelar_compra(compra, 'cccccccc-cccc-4ccc-8ccc-cccccccccccc');
  SELECT s.saldo INTO saldo FROM public.saldo_estoque() s WHERE s.insumo_id = iid;
  IF saldo <> 0 THEN RAISE EXCEPTION 'Cancelamento não estornou a compra: %', saldo; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.compras WHERE id = compra AND cancelada_em IS NOT NULL)
     OR NOT EXISTS (SELECT 1 FROM public.compra_itens WHERE compra_id = compra) THEN
    RAISE EXCEPTION 'O cancelamento apagou o histórico da compra.';
  END IF;

  -- Uma conta cancelada deve ser desvinculada atomicamente pela RPC de exclusão,
  -- sem UPDATE direto do papel autenticado na tabela financeira.
  compra_exclusao := public.salvar_compra(
    '{"data_compra":"2026-10-15"}'::jsonb,
    jsonb_build_array(jsonb_build_object(
      'insumo_id', iid, 'quantidade', 25, 'unidade', 'g', 'preco_unitario', 0.01
    )),
    NULL,
    '17171717-1717-4171-8171-171717171717'
  );
  INSERT INTO public.contas_pagar(
    user_id, compra_id, descricao, data_emissao, data_vencimento, valor, valor_pago
  ) VALUES (uid, compra_exclusao, 'Parcela cancelada para teste de exclusão',
            current_date, current_date, 10, 0)
  RETURNING id INTO conta_exclusao_id;
  UPDATE public.contas_pagar SET status = 'cancelado' WHERE id = conta_exclusao_id;

  PERFORM public.excluir_compra(
    compra_exclusao, '18181818-1818-4181-8181-181818181818'
  );
  IF EXISTS (SELECT 1 FROM public.compras WHERE id = compra_exclusao) THEN
    RAISE EXCEPTION 'A RPC não excluiu a compra vinculada apenas a uma conta cancelada.';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.contas_pagar
    WHERE id = conta_exclusao_id AND status = 'cancelado' AND compra_id IS NULL
  ) THEN
    RAISE EXCEPTION 'A conta cancelada não foi preservada e desvinculada corretamente.';
  END IF;

  -- Contas ativas devem continuar impedindo a exclusão e preservar ambos os registros.
  compra_com_conta_ativa := public.salvar_compra(
    '{"data_compra":"2026-10-15"}'::jsonb,
    jsonb_build_array(jsonb_build_object(
      'insumo_id', iid, 'quantidade', 10, 'unidade', 'g', 'preco_unitario', 0.01
    )),
    NULL,
    '19191919-1919-4191-8191-191919191919'
  );
  INSERT INTO public.contas_pagar(
    user_id, compra_id, descricao, data_emissao, data_vencimento, valor, valor_pago
  ) VALUES (uid, compra_com_conta_ativa, 'Parcela ativa para teste de bloqueio',
            current_date, current_date, 10, 0)
  RETURNING id INTO conta_ativa_id;
  BEGIN
    PERFORM public.excluir_compra(
      compra_com_conta_ativa, '20202020-2020-4202-8202-202020202020'
    );
    RAISE EXCEPTION 'A exclusão deveria ser bloqueada por conta não cancelada.';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM = 'A exclusão deveria ser bloqueada por conta não cancelada.' THEN
      RAISE;
    END IF;
    IF position('não cancelada' IN SQLERRM) = 0 THEN RAISE; END IF;
  END;
  IF NOT EXISTS (SELECT 1 FROM public.compras WHERE id = compra_com_conta_ativa)
     OR NOT EXISTS (
       SELECT 1 FROM public.contas_pagar
       WHERE id = conta_ativa_id AND compra_id = compra_com_conta_ativa AND status = 'pendente'
     ) THEN
    RAISE EXCEPTION 'A tentativa bloqueada alterou a compra ou a conta ativa.';
  END IF;

  PERFORM public.registrar_inventario_fisico(
    jsonb_build_array(jsonb_build_object(
      'insumo_id', iid, 'quantidade_fisica', 250, 'unidade_base', 'g'
    )),
    'dddddddd-dddd-4ddd-8ddd-dddddddddddd'
  );
  SELECT s.saldo INTO saldo FROM public.saldo_estoque() s WHERE s.insumo_id = iid;
  IF saldo <> 250 THEN RAISE EXCEPTION 'Inventário físico não reconciliou saldo: %', saldo; END IF;
  PERFORM public.registrar_inventario_fisico(
    jsonb_build_array(jsonb_build_object(
      'insumo_id', iid, 'quantidade_fisica', 250, 'unidade_base', 'g'
    )),
    'dddddddd-dddd-4ddd-8ddd-dddddddddddd'
  );
  SELECT s.saldo INTO saldo FROM public.saldo_estoque() s WHERE s.insumo_id = iid;
  IF saldo <> 250 THEN RAISE EXCEPTION 'Retry do inventário duplicou o saldo: %', saldo; END IF;

  INSERT INTO public.produtos(user_id, nome, rendimento)
  VALUES (uid, 'Produto teste', 1)
  RETURNING id INTO pid;

  INSERT INTO public.receita_itens(
    user_id, produto_id, insumo_id, quantidade, quantidade_utilizada, unidade_receita
  ) VALUES (uid, pid, iid, 10, 10, 'g')
  RETURNING id INTO receita_id;

  INSERT INTO public.pedidos(user_id, data_entrega, status)
  VALUES (uid, current_date, 'em_producao')
  RETURNING id INTO pedido;

  INSERT INTO public.pedido_itens(
    user_id, pedido_id, produto_id, descricao, quantidade, preco_unitario, custo_unitario
  ) VALUES (uid, pedido, pid, 'Produto teste', 2, 10, 999)
  RETURNING id INTO item_id;

  itens_corrigidos := public.recalcular_custos_historicos();
  SELECT custo_unitario INTO custo_corrigido
  FROM public.pedido_itens WHERE id = item_id;
  IF itens_corrigidos <> 1 OR round(custo_corrigido, 4) <> 0.1 THEN
    RAISE EXCEPTION 'Correção do custo histórico incorreta: itens %, custo %', itens_corrigidos, custo_corrigido;
  END IF;

  -- A baixa deve acompanhar cada quantidade realmente produzida, usando
  -- apenas a diferença em relação ao valor já registrado.
  PERFORM public.ajustar_producao(
    'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee1', item_id, 0.5
  );
  SELECT s.saldo INTO saldo FROM public.saldo_estoque() s WHERE s.insumo_id = iid;
  IF saldo <> 245 THEN RAISE EXCEPTION 'Baixa progressiva de 0,5 unidade incorreta: %', saldo; END IF;

  PERFORM public.ajustar_producao(
    'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee2', item_id, 1
  );
  SELECT s.saldo INTO saldo FROM public.saldo_estoque() s WHERE s.insumo_id = iid;
  IF saldo <> 240 THEN RAISE EXCEPTION 'Baixa incremental até 1 unidade incorreta: %', saldo; END IF;

  PERFORM public.ajustar_producao(
    'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee3', item_id, 2
  );
  SELECT s.saldo INTO saldo FROM public.saldo_estoque() s WHERE s.insumo_id = iid;
  IF saldo <> 230 THEN RAISE EXCEPTION 'Baixa incremental até 2 unidades incorreta: %', saldo; END IF;

  -- Replaying the same production event must not append a second stock movement.
  PERFORM public.ajustar_producao(
    'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee3', item_id, 2
  );
  SELECT s.saldo INTO saldo FROM public.saldo_estoque() s WHERE s.insumo_id = iid;
  IF saldo <> 230 THEN RAISE EXCEPTION 'Retry da produção duplicou a baixa: %', saldo; END IF;

  PERFORM public.ajustar_producao(
    'ffffffff-ffff-4fff-8fff-ffffffffffff', item_id, 1
  );
  SELECT s.saldo INTO saldo FROM public.saldo_estoque() s WHERE s.insumo_id = iid;
  IF saldo <> 240 THEN RAISE EXCEPTION 'Estorno de redução da produção incorreto: %', saldo; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.producao_eventos
    WHERE pedido_item_id = item_id AND receita_snapshot IS NOT NULL
      AND pedido_id = pedido AND produto_id = pid
  ) THEN
    RAISE EXCEPTION 'Snapshot de produção não foi preservado.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.estoque_movimentos
    WHERE insumo_id = iid AND origem_tipo = 'producao'
      AND pedido_id = pedido AND produto_id = pid
  ) THEN
    RAISE EXCEPTION 'Movimento de estoque não preservou contexto do pedido.';
  END IF;

  BEGIN
    UPDATE public.pedido_itens SET descricao = 'Tentativa de edição' WHERE id = item_id;
    RAISE EXCEPTION 'A proteção deveria bloquear edição de item com produção.';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM = 'A proteção deveria bloquear edição de item com produção.' THEN
      RAISE;
    END IF;
    IF position('produção registrada' IN SQLERRM) = 0 THEN
      RAISE;
    END IF;
  END;

  INSERT INTO public.produtos(user_id, nome, rendimento)
  VALUES (uid, 'Segundo produto teste', 1)
  RETURNING id INTO pid2;

  BEGIN
    UPDATE public.receita_itens SET produto_id = pid2 WHERE id = receita_id;
    RAISE EXCEPTION 'A proteção deveria bloquear a transferência de receita de produto com produção ativa.';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM = 'A proteção deveria bloquear a transferência de receita de produto com produção ativa.' THEN
      RAISE;
    END IF;
    IF position('alterar os ingredientes da receita' IN SQLERRM) = 0 THEN
      RAISE;
    END IF;
  END;

  BEGIN
    UPDATE public.receita_itens SET quantidade_utilizada = 12 WHERE id = receita_id;
    RAISE EXCEPTION 'A proteção deveria bloquear alteração de receita durante produção.';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM = 'A proteção deveria bloquear alteração de receita durante produção.' THEN
      RAISE;
    END IF;
    IF position('alterar os ingredientes da receita' IN SQLERRM) = 0 THEN
      RAISE;
    END IF;
  END;

  -- The normal correction workflow may reduce production to zero, which appends
  -- a full stock reversal and then permits the order item to be edited.
  PERFORM public.ajustar_producao(
    '13131313-1313-4313-8313-131313131313', item_id, 0
  );
  SELECT s.saldo INTO saldo FROM public.saldo_estoque() s WHERE s.insumo_id = iid;
  IF saldo <> 250 THEN RAISE EXCEPTION 'Estorno total da produção incorreto: %', saldo; END IF;

  -- An open order still freezes recipe composition even after production is reversed.
  BEGIN
    UPDATE public.receita_itens SET quantidade_utilizada = 11 WHERE id = receita_id;
    RAISE EXCEPTION 'A edição deveria ser bloqueada enquanto o pedido permanece aberto.';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM = 'A edição deveria ser bloqueada enquanto o pedido permanece aberto.' THEN RAISE; END IF;
    IF position('pedido em aberto' IN SQLERRM) = 0 THEN RAISE; END IF;
  END;

  -- Closing the order unlocks recipe maintenance without changing stock history.
  UPDATE public.pedidos SET status = 'entregue' WHERE id = pedido;
  UPDATE public.receita_itens SET quantidade_utilizada = 12 WHERE id = receita_id;
  IF NOT EXISTS (
    SELECT 1
    FROM public.producao_eventos pe
    CROSS JOIN LATERAL jsonb_array_elements(pe.receita_snapshot) ri
    WHERE pe.pedido_id = pedido
      AND (ri->>'quantidade_utilizada')::numeric = 10
  ) THEN
    RAISE EXCEPTION 'A edição da receita alterou o snapshot histórico.';
  END IF;

  -- Order save may replace rows after production reaches zero, but it must ignore
  -- any client-supplied produced quantity and create the replacement at zero.
  PERFORM public.salvar_pedido(
    jsonb_build_object(
      'cliente_id', NULL,
      'data_entrega', current_date,
      'hora_entrega', NULL,
      'status', 'em_producao',
      'forma_pagamento', 'pix',
      'valor_entrada', 0,
      'saldo_quitado', false,
      'desconto', 0,
      'taxa_entrega', 0,
      'observacoes', NULL
    ),
    jsonb_build_array(jsonb_build_object(
      'produto_id', pid,
      'descricao', 'Produto teste revisado',
      'quantidade', 2,
      'preco_unitario', 10,
      'custo_unitario', 1,
      'quantidade_produzida', 2
    )),
    pedido
  );
  SELECT pi.id, pi.quantidade_produzida
    INTO item_id, produzida
  FROM public.pedido_itens pi
  WHERE pi.pedido_id = pedido;
  IF produzida <> 0 THEN
    RAISE EXCEPTION 'Salvar pedido aceitou quantidade produzida enviada pelo cliente: %', produzida;
  END IF;

  -- Order receipt history must update the running paid balance atomically and
  -- reject an amount that exceeds the remaining order balance.
  PERFORM public.registrar_recebimento_pedido(
    pedido, 5, current_date, 'pix', 'Sinal de teste'
  );
  PERFORM public.registrar_recebimento_pedido(
    pedido, 5, current_date, 'dinheiro', 'Segunda parcela de teste'
  );
  SELECT valor_entrada INTO saldo FROM public.pedidos WHERE id = pedido;
  IF saldo <> 10 THEN RAISE EXCEPTION 'Saldo recebido do pedido incorreto após duas parcelas: %', saldo; END IF;
  SELECT COALESCE(SUM(valor), 0) INTO saldo FROM public.pedido_pagamentos WHERE pedido_id = pedido;
  IF saldo <> 10 THEN RAISE EXCEPTION 'Histórico de recebimentos incorreto: %', saldo; END IF;
  BEGIN
    PERFORM public.registrar_recebimento_pedido(
      pedido, 10.01, current_date, 'pix', 'Tentativa de exceder o saldo'
    );
    RAISE EXCEPTION 'O sistema deveria bloquear recebimento acima do saldo.';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM NOT LIKE 'O recebimento excede o saldo do pedido%' THEN
      RAISE;
    END IF;
  END;

  PERFORM public.registrar_inventario_fisico(
    jsonb_build_array(jsonb_build_object(
      'insumo_id', iid, 'quantidade_fisica', 200, 'unidade_base', 'g'
    )),
    '12121212-1212-4212-8212-121212121212'
  );
  SELECT s.saldo INTO saldo FROM public.saldo_estoque() s WHERE s.insumo_id = iid;
  IF saldo <> 200 THEN RAISE EXCEPTION 'Segundo ajuste físico incorreto: %', saldo; END IF;
END
$test$;

ROLLBACK;
