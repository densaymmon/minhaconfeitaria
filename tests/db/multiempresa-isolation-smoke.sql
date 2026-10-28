\set ON_ERROR_STOP on
-- Base multiempresa: cadastro controlado, confeitaria automática e isolamento
-- total entre duas confeitarias (tabelas com RLS e RPCs SECURITY DEFINER).
BEGIN;

-- Primeira conta de uma instalação nova é sempre aceita e ganha uma confeitaria.
INSERT INTO auth.users(id) VALUES ('a1111111-1111-4111-8111-111111111111');
DO $t$
BEGIN
  IF (SELECT count(*) FROM public.confeitarias WHERE user_id = 'a1111111-1111-4111-8111-111111111111') <> 1 THEN
    RAISE EXCEPTION 'A primeira conta não recebeu uma confeitaria.';
  END IF;
END $t$;

-- Com o cadastro fechado (padrão), uma segunda conta é recusada.
DO $t$
BEGIN
  BEGIN
    INSERT INTO auth.users(id) VALUES ('b2222222-2222-4222-8222-222222222222');
    RAISE EXCEPTION 'TESTE_FALHOU: cadastro fechado aceitou uma segunda conta.';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE 'CADASTRO_FECHADO%' THEN RAISE; END IF;
  END;
END $t$;

-- Com o cadastro aberto, a segunda confeitaria é criada.
UPDATE public.plataforma_config SET cadastro_aberto = true;
INSERT INTO auth.users(id) VALUES ('b2222222-2222-4222-8222-222222222222');

-- Dados da confeitaria A, criados pela própria dona.
SELECT set_config('request.jwt.claim.sub', 'a1111111-1111-4111-8111-111111111111', true);
SET LOCAL ROLE authenticated;
DO $t$
DECLARE
  v_cliente uuid;
  v_produto uuid;
  v_pedido uuid;
  v_insumo uuid;
BEGIN
  UPDATE public.confeitarias SET nome = 'Confeitaria A', slug = 'confeitaria-a';
  INSERT INTO public.clientes(nome, telefone) VALUES ('Cliente da A', '19999990000') RETURNING id INTO v_cliente;
  INSERT INTO public.produtos(nome, rendimento, preco_venda) VALUES ('Bolo da A', 1, 50) RETURNING id INTO v_produto;
  INSERT INTO public.pedidos(cliente_id, data_entrega, status) VALUES (v_cliente, current_date, 'recebido') RETURNING id INTO v_pedido;
  INSERT INTO public.pedido_itens(pedido_id, produto_id, descricao, quantidade, preco_unitario, custo_unitario)
  VALUES (v_pedido, v_produto, 'Bolo da A', 1, 50, 20);
  PERFORM set_config('teste.pedido_a', v_pedido::text, true);
  PERFORM set_config('teste.produto_a', v_produto::text, true);
  PERFORM set_config('teste.cliente_a', v_cliente::text, true);
  INSERT INTO public.insumos(nome, unidade, preco_unidade) VALUES ('Farinha da A', 'g', 0.01) RETURNING id INTO v_insumo;
  PERFORM set_config('teste.insumo_a', v_insumo::text, true);
END $t$;
RESET ROLE;

-- A confeitaria B não enxerga nem altera nada da A.
SELECT set_config('request.jwt.claim.sub', 'b2222222-2222-4222-8222-222222222222', true);
SET LOCAL ROLE authenticated;
DO $t$
DECLARE
  v_pedido_a uuid := current_setting('teste.pedido_a')::uuid;
  v_produto_a uuid := current_setting('teste.produto_a')::uuid;
  v_cliente_a uuid := current_setting('teste.cliente_a')::uuid;
  v_insumo_a uuid := current_setting('teste.insumo_a')::uuid;
  v_linhas integer;
BEGIN
  IF (SELECT count(*) FROM public.confeitarias) <> 1
     OR (SELECT nome FROM public.confeitarias) <> 'Minha confeitaria' THEN
    RAISE EXCEPTION 'B deveria ver apenas a própria confeitaria, com o nome padrão.';
  END IF;
  IF EXISTS (SELECT 1 FROM public.clientes) OR EXISTS (SELECT 1 FROM public.produtos)
     OR EXISTS (SELECT 1 FROM public.pedidos) OR EXISTS (SELECT 1 FROM public.pedido_itens) THEN
    RAISE EXCEPTION 'B conseguiu ler dados da confeitaria A.';
  END IF;

  UPDATE public.pedidos SET status = 'cancelado' WHERE id = v_pedido_a;
  GET DIAGNOSTICS v_linhas = ROW_COUNT;
  IF v_linhas <> 0 THEN RAISE EXCEPTION 'B alterou um pedido da A.'; END IF;

  UPDATE public.confeitarias SET nome = 'Invadida' WHERE slug = 'confeitaria-a';
  GET DIAGNOSTICS v_linhas = ROW_COUNT;
  IF v_linhas <> 0 THEN RAISE EXCEPTION 'B alterou a confeitaria da A.'; END IF;

  -- B não pode criar a confeitaria em nome de outra conta.
  BEGIN
    INSERT INTO public.confeitarias(user_id, nome) VALUES ('a1111111-1111-4111-8111-111111111111', 'Outra');
    RAISE EXCEPTION 'TESTE_FALHOU: B criou confeitaria para a A.';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE 'TESTE_FALHOU%' THEN RAISE; END IF;
  END;

  -- B não pode pendurar itens no pedido da A nem usar produto/cliente da A.
  BEGIN
    INSERT INTO public.pedido_itens(pedido_id, descricao, quantidade, preco_unitario)
    VALUES (v_pedido_a, 'Item invasor', 1, 1);
    RAISE EXCEPTION 'TESTE_FALHOU: B inseriu item no pedido da A.';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE 'TESTE_FALHOU%' THEN RAISE; END IF;
  END;
  BEGIN
    INSERT INTO public.pedidos(cliente_id, data_entrega) VALUES (v_cliente_a, current_date);
    RAISE EXCEPTION 'TESTE_FALHOU: B criou pedido para cliente da A.';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE 'TESTE_FALHOU%' THEN RAISE; END IF;
  END;

  -- RPCs SECURITY DEFINER também respeitam o dono.
  BEGIN
    PERFORM public.registrar_recebimento_pedido(v_pedido_a, 10, current_date, 'pix', 'invasão');
    RAISE EXCEPTION 'TESTE_FALHOU: B registrou recebimento no pedido da A.';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE 'TESTE_FALHOU%' THEN RAISE; END IF;
  END;
  BEGIN
    PERFORM public.excluir_insumo_se_sem_receita(v_insumo_a);
    RAISE EXCEPTION 'TESTE_FALHOU: B excluiu um insumo da A.';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE 'TESTE_FALHOU%' THEN RAISE; END IF;
  END;

  -- A tabela de controle da plataforma não é acessível a usuários.
  BEGIN
    UPDATE public.plataforma_config SET cadastro_aberto = false;
    RAISE EXCEPTION 'TESTE_FALHOU: usuário comum alterou o controle de cadastro.';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE 'TESTE_FALHOU%' THEN RAISE; END IF;
  END;
END $t$;
RESET ROLE;

-- Conferência final, sem RLS: os dados da A continuam intactos.
DO $t$
BEGIN
  IF (SELECT status FROM public.pedidos WHERE id = current_setting('teste.pedido_a')::uuid) <> 'recebido'
     OR (SELECT count(*) FROM public.pedido_itens WHERE pedido_id = current_setting('teste.pedido_a')::uuid) <> 1
     OR (SELECT count(*) FROM public.pedido_pagamentos WHERE pedido_id = current_setting('teste.pedido_a')::uuid) <> 0
     OR NOT EXISTS (SELECT 1 FROM public.insumos WHERE id = current_setting('teste.insumo_a')::uuid AND ativo)
     OR (SELECT nome FROM public.confeitarias WHERE slug = 'confeitaria-a') <> 'Confeitaria A' THEN
    RAISE EXCEPTION 'Os dados da confeitaria A foram alterados pela B.';
  END IF;
END $t$;

ROLLBACK;
