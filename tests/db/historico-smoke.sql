\set ON_ERROR_STOP on
-- Histórico de quem fez o quê, meta do mês, validade e alergênicos.
BEGIN;

UPDATE public.plataforma_config SET cadastro_aberto = true, aprovacao_manual = false;
INSERT INTO auth.users(id) VALUES
  ('a1111111-1111-4111-8111-111111111111'), ('b2222222-2222-4222-8222-222222222222'),
  ('c3333333-3333-4333-8333-333333333333'), ('e5555555-5555-4555-8555-555555555555');
-- C é gerente e E é produção na confeitaria A (B tem a própria).
DELETE FROM public.confeitarias WHERE user_id IN ('c3333333-3333-4333-8333-333333333333', 'e5555555-5555-4555-8555-555555555555');
INSERT INTO public.equipe_membros (dono_id, membro_id, email, nome, papel) VALUES
  ('a1111111-1111-4111-8111-111111111111', 'c3333333-3333-4333-8333-333333333333', 'gil@x.test', 'Gil', 'gerente'),
  ('a1111111-1111-4111-8111-111111111111', 'e5555555-5555-4555-8555-555555555555', 'eva@x.test', NULL, 'producao');
CREATE TEMP TABLE ctx (chave text PRIMARY KEY, valor text);
GRANT ALL ON ctx TO anon, authenticated;

SELECT set_config('request.jwt.claim.sub', 'a1111111-1111-4111-8111-111111111111', true);
SET LOCAL ROLE authenticated;
DO $t$
DECLARE
  v_pedido uuid; v_produto uuid;
BEGIN
  UPDATE public.confeitarias SET meta_vendas_mes = 5000, nome = 'Doces da A';
  BEGIN UPDATE public.confeitarias SET meta_vendas_mes = -1; RAISE EXCEPTION 'TESTE_FALHOU: meta negativa.';
  EXCEPTION WHEN check_violation THEN NULL; END;
  INSERT INTO public.produtos(nome, rendimento, preco_venda, validade_dias) VALUES ('Bolo', 1, 50, 3) RETURNING id INTO v_produto;
  BEGIN UPDATE public.produtos SET validade_dias = 0 WHERE id = v_produto; RAISE EXCEPTION 'TESTE_FALHOU: validade zero.';
  EXCEPTION WHEN check_violation THEN NULL; END;
  INSERT INTO public.insumos(nome, unidade, preco_unidade, alergenos) VALUES ('Farinha', 'g', 0.01, 'glúten');
  UPDATE public.produtos SET preco_venda = 55 WHERE id = v_produto;
  UPDATE public.produtos SET nome = 'Bolo caseiro' WHERE id = v_produto; -- sem mudar preço: não entra
  INSERT INTO public.pedidos(data_entrega, status) VALUES (current_date + 2, 'recebido') RETURNING id INTO v_pedido;
  UPDATE public.pedidos SET status = 'confirmado', desconto = 5 WHERE id = v_pedido;
  UPDATE public.pedidos SET visualizado_em = now() WHERE id = v_pedido; -- controle interno: não entra
  INSERT INTO ctx VALUES ('pedido', v_pedido);
  IF (SELECT count(*) FROM public.historico) <> 3 THEN
    RAISE EXCEPTION 'TESTE_FALHOU: histórico da dona: %', (SELECT jsonb_agg(to_jsonb(h)) FROM public.historico h);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.historico WHERE acao = 'alterou o pedido' AND autor = 'Dona(o)' AND detalhe = 'status: recebido → confirmado; desconto: R$ 0,00 → R$ 5,00') THEN
    RAISE EXCEPTION 'TESTE_FALHOU: detalhe da alteração: %', (SELECT jsonb_agg(detalhe) FROM public.historico);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.historico WHERE entidade = 'produto' AND detalhe = 'Bolo: R$ 50,00 → R$ 55,00') THEN RAISE EXCEPTION 'TESTE_FALHOU: preço.'; END IF;
  BEGIN INSERT INTO public.historico (user_id, autor, entidade, acao) VALUES ('a1111111-1111-4111-8111-111111111111', 'x', 'pedido', 'falso');
    RAISE EXCEPTION 'TESTE_FALHOU: inseriu no histórico.';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN DELETE FROM public.historico; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  IF (SELECT count(*) FROM public.historico) <> 3 THEN RAISE EXCEPTION 'TESTE_FALHOU: apagou o histórico.'; END IF;
END $t$;
RESET ROLE;

-- Pagamento registrado (como faria a função do sistema) com o nome de quem registrou.
SELECT set_config('request.jwt.claim.sub', 'c3333333-3333-4333-8333-333333333333', true);
INSERT INTO public.pedido_pagamentos (pedido_id, user_id, valor, data_pagamento, forma_pagamento)
SELECT valor::uuid, 'a1111111-1111-4111-8111-111111111111', 20, current_date, 'pix' FROM ctx WHERE chave = 'pedido';
SET LOCAL ROLE authenticated;
DO $t$ BEGIN
  UPDATE public.pedidos SET data_entrega = data_entrega + 1 WHERE id = (SELECT valor::uuid FROM ctx WHERE chave = 'pedido');
  IF (SELECT count(*) FROM public.historico WHERE autor = 'Gil') <> 2 THEN
    RAISE EXCEPTION 'TESTE_FALHOU: autor da equipe: %', (SELECT jsonb_agg(to_jsonb(h)) FROM public.historico h);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.historico WHERE entidade = 'pagamento' AND detalhe = 'R$ 20,00 · pix' AND pedido_numero IS NOT NULL) THEN
    RAISE EXCEPTION 'TESTE_FALHOU: pagamento no histórico.';
  END IF;
END $t$;
RESET ROLE;

-- Produção não vê o histórico; B não vê o da A.
SELECT set_config('request.jwt.claim.sub', 'e5555555-5555-4555-8555-555555555555', true);
SET LOCAL ROLE authenticated;
DO $t$ BEGIN
  UPDATE public.pedidos SET status = 'em_producao' WHERE id = (SELECT valor::uuid FROM ctx WHERE chave = 'pedido');
  IF (SELECT count(*) FROM public.historico) <> 0 THEN RAISE EXCEPTION 'TESTE_FALHOU: produção viu o histórico.'; END IF;
END $t$;
RESET ROLE;
DO $t$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.historico WHERE autor = 'eva@x.test' AND detalhe = 'status: confirmado → em_producao') THEN
    RAISE EXCEPTION 'TESTE_FALHOU: alteração da produção sem autor.';
  END IF;
END $t$;
SELECT set_config('request.jwt.claim.sub', 'b2222222-2222-4222-8222-222222222222', true);
SET LOCAL ROLE authenticated;
DO $t$ BEGIN
  IF (SELECT count(*) FROM public.historico) <> 0 THEN RAISE EXCEPTION 'TESTE_FALHOU: B viu o histórico da A.'; END IF;
  IF public._slug_reservado('agenda') IS NOT TRUE OR public._slug_reservado('fluxo-caixa') IS NOT TRUE THEN RAISE EXCEPTION 'TESTE_FALHOU: endereços reservados.'; END IF;
END $t$;
RESET ROLE;

-- Exclusão também fica registrada (sem quebrar a exclusão).
SELECT set_config('request.jwt.claim.sub', 'a1111111-1111-4111-8111-111111111111', true);
DELETE FROM public.pedido_pagamentos WHERE pedido_id = (SELECT valor::uuid FROM ctx WHERE chave = 'pedido');
SET LOCAL ROLE authenticated;
DO $t$ BEGIN
  DELETE FROM public.pedidos WHERE id = (SELECT valor::uuid FROM ctx WHERE chave = 'pedido');
  IF NOT EXISTS (SELECT 1 FROM public.historico WHERE acao = 'excluiu o pedido') OR NOT EXISTS (SELECT 1 FROM public.historico WHERE acao = 'removeu um pagamento') THEN
    RAISE EXCEPTION 'TESTE_FALHOU: exclusões no histórico.';
  END IF;
END $t$;
RESET ROLE;

ROLLBACK;
