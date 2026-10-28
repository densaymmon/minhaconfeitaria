\set ON_ERROR_STOP on
-- Variações de produto: validação do cadastro, escolha do cliente, preço e custo do servidor.
BEGIN;
UPDATE public.plataforma_config SET cadastro_aberto = true;
INSERT INTO auth.users(id) VALUES ('a1111111-1111-4111-8111-111111111111');

DO $t$
DECLARE
  ua uuid := 'a1111111-1111-4111-8111-111111111111';
  v_bolo uuid;
  v_simples uuid;
  v jsonb;
  v_pedido jsonb;
  v_hoje text := to_char(public._hoje_confeitaria(), 'YYYY-MM-DD');
BEGIN
  UPDATE public.confeitarias SET slug = 'loja-variacoes', catalogo_ativo = true WHERE user_id = ua;

  -- Cadastro inválido é recusado pelo banco.
  BEGIN
    INSERT INTO public.produtos(user_id, nome, rendimento, preco_venda, opcoes)
    VALUES (ua, 'Inválido', 1, 10, '[{"grupo": "Tamanho", "itens": []}]');
    RAISE EXCEPTION 'TESTE_FALHOU: grupo sem opções aceito.';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  BEGIN
    INSERT INTO public.produtos(user_id, nome, rendimento, preco_venda, opcoes)
    VALUES (ua, 'Inválido', 1, 10, '[{"grupo": "Tamanho", "itens": [{"nome": "P", "preco": 0}, {"nome": "p", "preco": 1}]}]');
    RAISE EXCEPTION 'TESTE_FALHOU: opções repetidas aceitas.';
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  INSERT INTO public.produtos(user_id, nome, rendimento, preco_venda, no_catalogo, antecedencia_dias, opcoes)
  VALUES (ua, 'Bolo', 1, 30, true, 0,
    '[{"grupo": "Tamanho", "itens": [{"nome": "P", "preco": -5, "custo": -2}, {"nome": "M", "preco": 0}, {"nome": "G", "preco": 20, "custo": 8}]},
      {"grupo": "Sabor", "itens": [{"nome": "Chocolate", "preco": 0}, {"nome": "Morango", "preco": 5, "custo": 3}]}]')
  RETURNING id INTO v_bolo;
  INSERT INTO public.produtos(user_id, nome, rendimento, preco_venda, no_catalogo, antecedencia_dias)
  VALUES (ua, 'Pão', 1, 12, true, 0) RETURNING id INTO v_simples;

  -- Catálogo mostra as opções sem custo.
  v := public.catalogo_publico('loja-variacoes');
  IF (SELECT jsonb_array_length(p->'opcoes') FROM jsonb_array_elements(v->'produtos') p WHERE p->>'nome' = 'Bolo') <> 2 THEN
    RAISE EXCEPTION 'TESTE_FALHOU: catálogo sem as opções do produto: %', v;
  END IF;
  IF v::text ~* 'custo' THEN RAISE EXCEPTION 'TESTE_FALHOU: catálogo expôs o custo das opções.'; END IF;

  -- Escolha válida: preço 30 + 20 + 5 = 55; custo extra 8 + 3 = 11; produto simples continua igual.
  v_pedido := public.criar_pedido_catalogo('loja-variacoes', gen_random_uuid(),
    '{"nome": "Ana", "telefone": "19988887777"}', jsonb_build_object('tipo', 'retirada', 'data', v_hoje),
    jsonb_build_array(
      jsonb_build_object('produto_id', v_bolo, 'quantidade', 1, 'opcoes', jsonb_build_object('Tamanho', 'G', 'Sabor', 'Morango'), 'preco', 1),
      jsonb_build_object('produto_id', v_bolo, 'quantidade', 1, 'opcoes', jsonb_build_object('Sabor', 'Morango', 'Tamanho', 'G')),
      jsonb_build_object('produto_id', v_bolo, 'quantidade', 1, 'opcoes', jsonb_build_object('Tamanho', 'P', 'Sabor', 'Chocolate')),
      jsonb_build_object('produto_id', v_simples, 'quantidade', 3)));
  IF (SELECT count(*) FROM public.pedido_itens i JOIN public.pedidos p ON p.id = i.pedido_id WHERE p.codigo_publico = (v_pedido->>'codigo')::uuid) <> 3 THEN
    RAISE EXCEPTION 'TESTE_FALHOU: linhas iguais não foram agrupadas.';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.pedido_itens i JOIN public.pedidos p ON p.id = i.pedido_id
    WHERE p.codigo_publico = (v_pedido->>'codigo')::uuid AND i.descricao = 'Bolo (Tamanho: G, Sabor: Morango)'
      AND i.quantidade = 2 AND i.preco_unitario = 55 AND i.custo_unitario = 11
  ) THEN
    RAISE EXCEPTION 'TESTE_FALHOU: preço, custo ou descrição da variação incorretos.';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.pedido_itens i JOIN public.pedidos p ON p.id = i.pedido_id
    WHERE p.codigo_publico = (v_pedido->>'codigo')::uuid AND i.descricao = 'Bolo (Tamanho: P, Sabor: Chocolate)'
      AND i.preco_unitario = 25 AND i.custo_unitario = 0
  ) THEN
    RAISE EXCEPTION 'TESTE_FALHOU: acréscimo negativo ou custo mínimo zero incorretos.';
  END IF;
  IF (public.acompanhar_pedido_catalogo((v_pedido->>'codigo')::uuid)->>'total')::numeric <> 55 * 2 + 25 + 36 THEN
    RAISE EXCEPTION 'TESTE_FALHOU: total do pedido com variações incorreto.';
  END IF;

  -- Escolhas inválidas são recusadas.
  FOR v IN SELECT * FROM (VALUES
    (jsonb_build_object('Tamanho', 'G')),
    (jsonb_build_object('Tamanho', 'GG', 'Sabor', 'Chocolate')),
    (jsonb_build_object('Tamanho', 'G', 'Sabor', 'Chocolate', 'Cobertura', 'Ganache')),
    ('{}'::jsonb),
    ('"G"'::jsonb)
  ) AS casos(v)
  LOOP
    BEGIN
      PERFORM public.criar_pedido_catalogo('loja-variacoes', gen_random_uuid(),
        '{"nome": "Bia", "telefone": "19977776666"}', jsonb_build_object('tipo', 'retirada', 'data', v_hoje),
        jsonb_build_array(jsonb_build_object('produto_id', v_bolo, 'quantidade', 1, 'opcoes', v)));
      RAISE EXCEPTION 'TESTE_FALHOU: escolha inválida aceita: %', v;
    EXCEPTION WHEN OTHERS THEN
      IF SQLERRM NOT LIKE 'CATALOGO:%' THEN RAISE; END IF;
    END;
  END LOOP;
  BEGIN
    PERFORM public.criar_pedido_catalogo('loja-variacoes', gen_random_uuid(),
      '{"nome": "Bia", "telefone": "19977776666"}', jsonb_build_object('tipo', 'retirada', 'data', v_hoje),
      jsonb_build_array(jsonb_build_object('produto_id', v_simples, 'quantidade', 1, 'opcoes', jsonb_build_object('Tamanho', 'G'))));
    RAISE EXCEPTION 'TESTE_FALHOU: opção aceita em produto sem variações.';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE 'CATALOGO:%' THEN RAISE; END IF;
  END;
END $t$;
ROLLBACK;
