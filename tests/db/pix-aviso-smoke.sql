\set ON_ERROR_STOP on
-- Tipo da chave Pix, cidade da confeitaria e aviso de pedido pronto.
BEGIN;
UPDATE public.plataforma_config SET cadastro_aberto = true, aprovacao_manual = false;
INSERT INTO auth.users(id) VALUES ('a1111111-1111-4111-8111-111111111111');

DO $t$
DECLARE
  ua uuid := 'a1111111-1111-4111-8111-111111111111';
  v_produto uuid;
  v_pedido jsonb;
  v jsonb;
BEGIN
  UPDATE public.confeitarias SET nome = 'Doces', slug = 'doces-teste', catalogo_ativo = true, cidade = 'Hortolândia' WHERE user_id = ua;
  INSERT INTO public.configuracoes(user_id, pix_chave, pix_tipo) VALUES (ua, '52998224725', 'cpf');
  BEGIN
    UPDATE public.configuracoes SET pix_tipo = 'boleto' WHERE user_id = ua;
    RAISE EXCEPTION 'TESTE_FALHOU: tipo de chave inválido aceito.';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  INSERT INTO public.produtos(user_id, nome, rendimento, preco_venda, no_catalogo, antecedencia_dias)
  VALUES (ua, 'Bolo', 1, 30, true, 0) RETURNING id INTO v_produto;

  v_pedido := public.criar_pedido_catalogo('doces-teste', gen_random_uuid(),
    jsonb_build_object('nome', 'Ana', 'telefone', '19988887777'),
    jsonb_build_object('tipo', 'retirada', 'data', to_char(public._hoje_confeitaria(), 'YYYY-MM-DD')),
    jsonb_build_array(jsonb_build_object('produto_id', v_produto, 'quantidade', 1)));
  v := public.acompanhar_pedido_catalogo((v_pedido->>'codigo')::uuid);
  IF v->'confeitaria'->>'pix_tipo' <> 'cpf' OR v->'confeitaria'->>'cidade' <> 'Hortolândia'
     OR v->'confeitaria'->>'pix_chave' <> '52998224725' OR (v->>'total')::numeric <> 30 THEN
    RAISE EXCEPTION 'TESTE_FALHOU: acompanhamento sem tipo da chave ou cidade: %', v;
  END IF;

  UPDATE public.pedidos SET status = 'pronto', aviso_pronto_enviado_em = now() WHERE codigo_publico = (v_pedido->>'codigo')::uuid;
  IF (SELECT aviso_pronto_enviado_em FROM public.pedidos WHERE codigo_publico = (v_pedido->>'codigo')::uuid) IS NULL THEN
    RAISE EXCEPTION 'TESTE_FALHOU: aviso de pronto não registrado.';
  END IF;
END $t$;
ROLLBACK;
