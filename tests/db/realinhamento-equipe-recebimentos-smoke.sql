\set ON_ERROR_STOP on
-- 0056: funções que estavam em versão antiga no banco publicado.
--  * Gerente da equipe usa corrigir_valor_pago_pedido_com_producao e excluir_pedidos_recorrentes
--    nos dados da confeitaria (antes: "não encontrado", por usarem auth.uid()).
--  * Produção continua sem acesso à função de dinheiro.
--  * registrar_recebimento_pedido considera o histórico de pagamentos ao validar o saldo.
BEGIN;

UPDATE public.plataforma_config SET cadastro_aberto = true, aprovacao_manual = false;
INSERT INTO auth.users(id) VALUES
  ('a7a7a7a7-a7a7-4a7a-8a7a-a7a7a7a7a7a7'),
  ('b7b7b7b7-b7b7-4b7b-8b7b-b7b7b7b7b7b7'),
  ('c7c7c7c7-c7c7-4c7c-8c7c-c7c7c7c7c7c7');
-- Gerente e produção da confeitaria A (sem confeitaria própria).
DELETE FROM public.assinaturas WHERE user_id IN ('b7b7b7b7-b7b7-4b7b-8b7b-b7b7b7b7b7b7', 'c7c7c7c7-c7c7-4c7c-8c7c-c7c7c7c7c7c7');
DELETE FROM public.configuracoes WHERE user_id IN ('b7b7b7b7-b7b7-4b7b-8b7b-b7b7b7b7b7b7', 'c7c7c7c7-c7c7-4c7c-8c7c-c7c7c7c7c7c7');
DELETE FROM public.confeitarias WHERE user_id IN ('b7b7b7b7-b7b7-4b7b-8b7b-b7b7b7b7b7b7', 'c7c7c7c7-c7c7-4c7c-8c7c-c7c7c7c7c7c7');
INSERT INTO public.equipe_membros (dono_id, membro_id, email, papel) VALUES
  ('a7a7a7a7-a7a7-4a7a-8a7a-a7a7a7a7a7a7', 'b7b7b7b7-b7b7-4b7b-8b7b-b7b7b7b7b7b7', 'gerente@a7.test', 'gerente'),
  ('a7a7a7a7-a7a7-4a7a-8a7a-a7a7a7a7a7a7', 'c7c7c7c7-c7c7-4c7c-8c7c-c7c7c7c7c7c7', 'producao@a7.test', 'producao');

CREATE TEMP TABLE ids (nome text PRIMARY KEY, id uuid);
GRANT ALL ON ids TO authenticated;

-- Dona: cliente, recorrência e um pedido de 100 com 80 já recebidos no histórico.
SELECT set_config('request.jwt.claim.sub', 'a7a7a7a7-a7a7-4a7a-8a7a-a7a7a7a7a7a7', true);
SET LOCAL ROLE authenticated;
DO $t$
DECLARE
  produto uuid;
  cliente uuid;
  pedido uuid;
BEGIN
  INSERT INTO public.clientes(nome, telefone) VALUES ('Cliente A7', '19999997777') RETURNING id INTO cliente;
  INSERT INTO public.produtos(nome, rendimento, preco_venda) VALUES ('Bolo A7', 1, 100) RETURNING id INTO produto;
  INSERT INTO public.pedidos_recorrentes(cliente_id, frequencia, data_inicio)
  VALUES (cliente, 'semanal', current_date);
  pedido := public.salvar_pedido(jsonb_build_object(
    'cliente_id', cliente, 'data_entrega', current_date, 'status', 'recebido', 'forma_pagamento', 'pix',
    'valor_entrada', 0, 'saldo_quitado', false, 'desconto', 0, 'taxa_entrega', 0),
    jsonb_build_array(jsonb_build_object('produto_id', produto, 'descricao', 'Bolo A7', 'quantidade', 1, 'preco_unitario', 100, 'custo_unitario', 30)));
  PERFORM public.registrar_recebimento_pedido(pedido, 80, current_date, 'pix', NULL);
  INSERT INTO ids VALUES ('cliente', cliente), ('pedido', pedido);
END $t$;
RESET ROLE;

-- Cenário legado: valor_entrada desatualizado (menor que o histórico de pagamentos).
UPDATE public.pedidos SET valor_entrada = 0 WHERE id = (SELECT id FROM ids WHERE nome = 'pedido');

-- Gerente: usa as funções nos dados da confeitaria.
SELECT set_config('request.jwt.claim.sub', 'b7b7b7b7-b7b7-4b7b-8b7b-b7b7b7b7b7b7', true);
SET LOCAL ROLE authenticated;
DO $t$
BEGIN
  -- Saldo real é 20 (100 - 80 do histórico), mesmo com valor_entrada desatualizado em 0.
  BEGIN
    PERFORM public.registrar_recebimento_pedido((SELECT id FROM ids WHERE nome = 'pedido'), 30, current_date, 'pix', NULL);
    RAISE EXCEPTION 'TESTE_FALHOU: recebimento acima do saldo foi aceito.';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM NOT LIKE 'O recebimento excede o saldo do pedido%' THEN RAISE; END IF;
  END;
  PERFORM public.registrar_recebimento_pedido((SELECT id FROM ids WHERE nome = 'pedido'), 20, current_date, 'pix', NULL);
  IF NOT (SELECT saldo_quitado FROM public.pedidos WHERE id = (SELECT id FROM ids WHERE nome = 'pedido')) THEN
    RAISE EXCEPTION 'TESTE_FALHOU: pedido deveria estar quitado.';
  END IF;

  -- Encontra o pedido da confeitaria (a mensagem é a regra seguinte, não "não encontrado").
  BEGIN
    PERFORM public.corrigir_valor_pago_pedido_com_producao((SELECT id FROM ids WHERE nome = 'pedido'), 10);
    RAISE EXCEPTION 'TESTE_FALHOU: corrigir valor pago deveria exigir produção registrada.';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM NOT LIKE 'Esta função é destinada a pedidos com produção registrada%' THEN
      RAISE EXCEPTION 'TESTE_FALHOU: gerente não encontrou o pedido da confeitaria: %', SQLERRM;
    END IF;
  END;

  IF public.excluir_pedidos_recorrentes(NULL, (SELECT id FROM ids WHERE nome = 'cliente')) <> 1 THEN
    RAISE EXCEPTION 'TESTE_FALHOU: gerente não excluiu a recorrência da confeitaria.';
  END IF;
END $t$;
RESET ROLE;

-- Produção: continua sem acesso à função de dinheiro.
SELECT set_config('request.jwt.claim.sub', 'c7c7c7c7-c7c7-4c7c-8c7c-c7c7c7c7c7c7', true);
SET LOCAL ROLE authenticated;
DO $t$
BEGIN
  BEGIN
    PERFORM public.corrigir_valor_pago_pedido_com_producao((SELECT id FROM ids WHERE nome = 'pedido'), 10);
    RAISE EXCEPTION 'TESTE_FALHOU: produção usou função financeira.';
  EXCEPTION WHEN raise_exception OR insufficient_privilege THEN
    IF SQLERRM LIKE 'TESTE_FALHOU%' THEN RAISE; END IF;
  END;
END $t$;
RESET ROLE;

ROLLBACK;
