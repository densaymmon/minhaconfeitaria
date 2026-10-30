-- 0049: estoque de produtos prontos (sobras de produção que ainda não foram vendidas).
--
-- Regra do negócio
--   * "Registrar produção": soma as unidades no estoque pronto e baixa os insumos da receita
--     (receita × quantidade ÷ rendimento), numa única transação e com evento idempotente.
--   * Pedido do catálogo: usa o estoque pronto automaticamente (só itens sem variação).
--   * Pedido manual: a tela envia `usar_estoque: true` por item quando a pessoa escolhe usar o
--     que está pronto; o restante continua pendente para produzir.
--   * Unidades tiradas do estoque pronto contam como produzidas no item do pedido
--     (`quantidade_produzida`) e ficam registradas em `pedido_itens.quantidade_do_estoque`.
--     Os insumos NÃO são baixados de novo: já saíram quando a produção foi registrada.
--   * Reduzir a produção de um item devolve primeiro o que foi produzido para o pedido (estorna
--     insumos, como antes) e só depois devolve ao estoque pronto o que veio dele.
--   * Cancelar um pedido em aberto devolve ao estoque pronto o que ele tinha retirado.
--
-- Integridade (mesmo padrão do estoque de insumos): histórico só de acréscimo
-- (`produtos_prontos_movimentos`), saldo nunca negativo (`produtos_prontos`, com trava de linha),
-- escrita só por funções SECURITY DEFINER filtradas por `_tenant()`, RLS por confeitaria e a
-- política `acesso_liberado`. Aditiva: tabelas/coluna novas e funções substituídas por versões
-- compatíveis; não altera dados existentes. Não recalcula custos de pedidos antigos.

BEGIN;

-- 1. Itens do pedido: quanto veio do estoque pronto ------------------------------------------
ALTER TABLE public.pedido_itens
  ADD COLUMN IF NOT EXISTS quantidade_do_estoque numeric(12,3) NOT NULL DEFAULT 0;

ALTER TABLE public.pedido_itens DROP CONSTRAINT IF EXISTS item_estoque_valido;
ALTER TABLE public.pedido_itens
  ADD CONSTRAINT item_estoque_valido CHECK (quantidade_do_estoque >= 0 AND quantidade_do_estoque <= quantidade_produzida);

-- 2. Movimentos de insumo da produção para estoque ------------------------------------------
ALTER TABLE public.estoque_movimentos DROP CONSTRAINT IF EXISTS estoque_movimentos_origem_tipo_check;
ALTER TABLE public.estoque_movimentos
  ADD CONSTRAINT estoque_movimentos_origem_tipo_check
  CHECK (origem_tipo IN ('compra_item', 'producao', 'inventario', 'ajuste', 'producao_estoque'));

-- 3. Saldo e histórico de produtos prontos --------------------------------------------------
CREATE TABLE IF NOT EXISTS public.produtos_prontos (
  user_id uuid NOT NULL DEFAULT public._tenant(),
  produto_id uuid NOT NULL REFERENCES public.produtos(id) ON DELETE CASCADE,
  quantidade numeric(12,3) NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, produto_id),
  CONSTRAINT produto_pronto_quantidade_valida CHECK (quantidade >= 0)
);

CREATE TABLE IF NOT EXISTS public.produtos_prontos_movimentos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT public._tenant(),
  -- Sem chave estrangeira de propósito: o histórico sobrevive à exclusão do produto/pedido.
  produto_id uuid NOT NULL,
  produto_nome text NOT NULL,
  quantidade_delta numeric(12,3) NOT NULL,
  tipo text NOT NULL,
  pedido_id uuid,
  pedido_numero bigint,
  pedido_item_id uuid,
  evento_id uuid NOT NULL,
  reverte_evento_id uuid,
  observacao text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT produto_pronto_mov_delta CHECK (quantidade_delta <> 0),
  CONSTRAINT produto_pronto_mov_tipo CHECK (tipo IN ('producao', 'uso_pedido', 'devolucao_pedido', 'descarte', 'estorno_producao')),
  CONSTRAINT produto_pronto_mov_obs CHECK (coalesce(length(observacao), 0) <= 300),
  CONSTRAINT produto_pronto_mov_evento_unico UNIQUE (user_id, evento_id)
);

-- Uma produção só pode ser desfeita uma vez.
CREATE UNIQUE INDEX IF NOT EXISTS produtos_prontos_mov_reverte_idx
  ON public.produtos_prontos_movimentos (user_id, reverte_evento_id) WHERE reverte_evento_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS produtos_prontos_mov_lista_idx
  ON public.produtos_prontos_movimentos (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS produtos_prontos_mov_produto_idx
  ON public.produtos_prontos_movimentos (user_id, produto_id, created_at);

DO $rls$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['produtos_prontos', 'produtos_prontos_movimentos'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_dono_select', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING ((SELECT public._tenant()) = user_id)', t || '_dono_select', t);
    EXECUTE format('DROP POLICY IF EXISTS acesso_liberado ON public.%I', t);
    EXECUTE format('CREATE POLICY acesso_liberado ON public.%I AS RESTRICTIVE FOR ALL TO authenticated '
      'USING ((SELECT public._acesso_liberado())) WITH CHECK ((SELECT public._acesso_liberado()))', t);
    -- O navegador só lê; quem grava são as funções abaixo.
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM PUBLIC, anon, authenticated', t);
    EXECUTE format('GRANT SELECT ON TABLE public.%I TO authenticated', t);
    EXECUTE format('GRANT ALL ON TABLE public.%I TO service_role', t);
  END LOOP;
END
$rls$;

COMMENT ON TABLE public.produtos_prontos IS
  'Saldo atual de unidades prontas (produzidas e ainda não vendidas) por produto. Só muda pelas funções de estoque pronto.';
COMMENT ON TABLE public.produtos_prontos_movimentos IS
  'Histórico append-only do estoque de produtos prontos: produção, uso em pedido, devolução, descarte e estorno.';

-- 4. Movimentação interna (única porta de escrita do saldo) ---------------------------------
CREATE OR REPLACE FUNCTION public._mover_estoque_pronto(
  p_user uuid,
  p_produto uuid,
  p_delta numeric,
  p_tipo text,
  p_evento uuid,
  p_pedido uuid DEFAULT NULL,
  p_pedido_numero bigint DEFAULT NULL,
  p_item uuid DEFAULT NULL,
  p_reverte uuid DEFAULT NULL,
  p_obs text DEFAULT NULL
) RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_nome text;
  v_atual numeric;
BEGIN
  IF p_user IS NULL OR p_produto IS NULL OR p_evento IS NULL THEN
    RAISE EXCEPTION 'ESTOQUE: dados da movimentação incompletos.';
  END IF;
  IF p_delta IS NULL OR p_delta::text IN ('NaN', 'Infinity', '-Infinity') OR p_delta = 0 OR round(p_delta, 3) <> p_delta THEN
    RAISE EXCEPTION 'ESTOQUE: quantidade inválida.';
  END IF;

  SELECT pr.nome INTO v_nome FROM public.produtos pr WHERE pr.id = p_produto AND pr.user_id = p_user;
  IF NOT FOUND THEN RAISE EXCEPTION 'ESTOQUE: produto não encontrado.'; END IF;

  INSERT INTO public.produtos_prontos (user_id, produto_id, quantidade)
  VALUES (p_user, p_produto, 0)
  ON CONFLICT (user_id, produto_id) DO NOTHING;

  -- A trava da linha serializa produções, pedidos e cancelamentos do mesmo produto.
  SELECT pp.quantidade INTO v_atual
  FROM public.produtos_prontos pp
  WHERE pp.user_id = p_user AND pp.produto_id = p_produto
  FOR UPDATE;

  IF v_atual + p_delta < 0 THEN
    RAISE EXCEPTION 'ESTOQUE: % tem apenas % unidade(s) pronta(s) em estoque.', v_nome, trim_scale(v_atual);
  END IF;

  UPDATE public.produtos_prontos
  SET quantidade = v_atual + p_delta, updated_at = now()
  WHERE user_id = p_user AND produto_id = p_produto;

  INSERT INTO public.produtos_prontos_movimentos (
    user_id, produto_id, produto_nome, quantidade_delta, tipo,
    pedido_id, pedido_numero, pedido_item_id, evento_id, reverte_evento_id, observacao
  ) VALUES (
    p_user, p_produto, v_nome, p_delta, p_tipo,
    p_pedido, p_pedido_numero, p_item, p_evento, p_reverte, p_obs
  );

  RETURN v_atual + p_delta;
END;
$function$;
REVOKE ALL ON FUNCTION public._mover_estoque_pronto(uuid, uuid, numeric, text, uuid, uuid, bigint, uuid, uuid, text) FROM PUBLIC, anon, authenticated;

-- 5. Registrar produção para o estoque pronto -----------------------------------------------
CREATE OR REPLACE FUNCTION public.registrar_producao_estoque(
  p_evento_id uuid,
  p_produto_id uuid,
  p_quantidade numeric,
  p_observacao text DEFAULT NULL
) RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  uid uuid := public._tenant();
  produto public.produtos%ROWTYPE;
  existente public.produtos_prontos_movimentos%ROWTYPE;
  rendimento numeric;
  receita record;
  v_obs text := nullif(left(btrim(coalesce(p_observacao, '')), 300), '');
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Acesso não autorizado.'; END IF;
  IF NOT public._acesso_liberado() THEN RAISE EXCEPTION 'Acesso não liberado.'; END IF;
  IF NOT public._plano_tem(uid, 'estoque') THEN
    RAISE EXCEPTION 'PLANO: o controle de estoque não está incluído no seu plano.';
  END IF;
  IF p_evento_id IS NULL OR p_produto_id IS NULL THEN
    RAISE EXCEPTION 'ESTOQUE: identificador do evento e do produto são obrigatórios.';
  END IF;
  IF p_quantidade IS NULL OR p_quantidade::text IN ('NaN', 'Infinity', '-Infinity')
     OR p_quantidade <= 0 OR p_quantidade > 9999 OR round(p_quantidade, 3) <> p_quantidade THEN
    RAISE EXCEPTION 'ESTOQUE: informe uma quantidade maior que zero (até 9.999, com no máximo 3 casas decimais).';
  END IF;

  -- Repetir o mesmo evento (clique duplo, rede instável) não repete baixa nem entrada.
  SELECT * INTO existente FROM public.produtos_prontos_movimentos m
  WHERE m.user_id = uid AND m.evento_id = p_evento_id;
  IF FOUND THEN
    IF existente.tipo <> 'producao' OR existente.produto_id <> p_produto_id OR existente.quantidade_delta <> p_quantidade THEN
      RAISE EXCEPTION 'Este identificador de evento já foi usado para outra operação.';
    END IF;
    RETURN coalesce((SELECT pp.quantidade FROM public.produtos_prontos pp WHERE pp.user_id = uid AND pp.produto_id = p_produto_id), 0);
  END IF;

  SELECT pr.* INTO produto FROM public.produtos pr
  WHERE pr.id = p_produto_id AND pr.user_id = uid
  FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'ESTOQUE: produto não encontrado.'; END IF;

  rendimento := CASE WHEN coalesce(produto.rendimento, 0) > 0 THEN produto.rendimento ELSE 1 END;

  -- Mesma conta de ajustar_producao: receita na unidade base × unidades ÷ rendimento,
  -- com linhas repetidas do mesmo insumo somadas antes de gravar.
  FOR receita IN
    SELECT
      ri.insumo_id,
      i.nome AS insumo_nome,
      public.medida_base(coalesce(ri.unidade_receita, i.unidade_embalagem, i.unidade)) AS unidade_base,
      sum(
        coalesce(ri.quantidade_utilizada, ri.quantidade)
        * public.medida_fator(coalesce(ri.unidade_receita, i.unidade_embalagem, i.unidade))
      ) * p_quantidade / rendimento AS consumo
    FROM public.receita_itens ri
    JOIN public.insumos i ON i.id = ri.insumo_id AND i.user_id = uid
    WHERE ri.produto_id = p_produto_id AND ri.user_id = uid
    GROUP BY ri.insumo_id, i.nome,
      public.medida_base(coalesce(ri.unidade_receita, i.unidade_embalagem, i.unidade))
  LOOP
    IF receita.unidade_base IS NULL OR receita.unidade_base NOT IN ('g', 'ml', 'un') THEN
      RAISE EXCEPTION 'Unidade incompatível ou não configurada para o insumo "%".', receita.insumo_nome;
    END IF;
    IF receita.consumo IS NULL OR receita.consumo::text IN ('NaN', 'Infinity', '-Infinity') THEN
      RAISE EXCEPTION 'Não foi possível calcular o consumo do insumo "%".', receita.insumo_nome;
    END IF;
    IF receita.consumo <> 0 THEN
      INSERT INTO public.estoque_movimentos (
        user_id, insumo_id, quantidade_delta_base, unidade_base,
        tipo_movimento, origem_tipo, origem_id, evento_id, observacao,
        produto_id, descricao_snapshot
      ) VALUES (
        uid, receita.insumo_id, -receita.consumo, receita.unidade_base,
        'saida_producao', 'producao_estoque', p_produto_id, p_evento_id,
        'Consumo por produção para o estoque de produtos prontos',
        p_produto_id, produto.nome
      );
    END IF;
  END LOOP;

  RETURN public._mover_estoque_pronto(uid, p_produto_id, p_quantidade, 'producao', p_evento_id,
    NULL, NULL, NULL, NULL, v_obs);
END;
$function$;
REVOKE ALL ON FUNCTION public.registrar_producao_estoque(uuid, uuid, numeric, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.registrar_producao_estoque(uuid, uuid, numeric, text) TO authenticated, service_role;

-- 6. Descartar (perda): sai do estoque pronto e os insumos NÃO voltam ----------------------
CREATE OR REPLACE FUNCTION public.descartar_estoque_pronto(
  p_evento_id uuid,
  p_produto_id uuid,
  p_quantidade numeric,
  p_observacao text DEFAULT NULL
) RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  uid uuid := public._tenant();
  existente public.produtos_prontos_movimentos%ROWTYPE;
  v_obs text := nullif(left(btrim(coalesce(p_observacao, '')), 300), '');
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Acesso não autorizado.'; END IF;
  IF NOT public._acesso_liberado() THEN RAISE EXCEPTION 'Acesso não liberado.'; END IF;
  IF p_evento_id IS NULL OR p_produto_id IS NULL THEN
    RAISE EXCEPTION 'ESTOQUE: identificador do evento e do produto são obrigatórios.';
  END IF;
  IF p_quantidade IS NULL OR p_quantidade::text IN ('NaN', 'Infinity', '-Infinity')
     OR p_quantidade <= 0 OR p_quantidade > 9999 OR round(p_quantidade, 3) <> p_quantidade THEN
    RAISE EXCEPTION 'ESTOQUE: informe uma quantidade maior que zero (até 9.999, com no máximo 3 casas decimais).';
  END IF;

  SELECT * INTO existente FROM public.produtos_prontos_movimentos m
  WHERE m.user_id = uid AND m.evento_id = p_evento_id;
  IF FOUND THEN
    IF existente.tipo <> 'descarte' OR existente.produto_id <> p_produto_id OR existente.quantidade_delta <> -p_quantidade THEN
      RAISE EXCEPTION 'Este identificador de evento já foi usado para outra operação.';
    END IF;
    RETURN coalesce((SELECT pp.quantidade FROM public.produtos_prontos pp WHERE pp.user_id = uid AND pp.produto_id = p_produto_id), 0);
  END IF;

  RETURN public._mover_estoque_pronto(uid, p_produto_id, -p_quantidade, 'descarte', p_evento_id,
    NULL, NULL, NULL, NULL, v_obs);
END;
$function$;
REVOKE ALL ON FUNCTION public.descartar_estoque_pronto(uuid, uuid, numeric, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.descartar_estoque_pronto(uuid, uuid, numeric, text) TO authenticated, service_role;

-- 7. Desfazer uma produção registrada por engano ---------------------------------------------
-- Só é possível enquanto todas as unidades daquela produção ainda estão no estoque.
-- Os insumos voltam por movimentos compensatórios; o histórico original não é alterado.
CREATE OR REPLACE FUNCTION public.desfazer_producao_estoque(
  p_evento_id uuid,
  p_producao_evento_id uuid
) RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  uid uuid := public._tenant();
  producao public.produtos_prontos_movimentos%ROWTYPE;
  existente public.produtos_prontos_movimentos%ROWTYPE;
  v_saldo numeric;
  mov record;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Acesso não autorizado.'; END IF;
  IF NOT public._acesso_liberado() THEN RAISE EXCEPTION 'Acesso não liberado.'; END IF;
  IF p_evento_id IS NULL OR p_producao_evento_id IS NULL THEN
    RAISE EXCEPTION 'ESTOQUE: identificador do evento e da produção são obrigatórios.';
  END IF;

  SELECT * INTO existente FROM public.produtos_prontos_movimentos m
  WHERE m.user_id = uid AND m.evento_id = p_evento_id;
  IF FOUND THEN
    IF existente.tipo <> 'estorno_producao' OR existente.reverte_evento_id IS DISTINCT FROM p_producao_evento_id THEN
      RAISE EXCEPTION 'Este identificador de evento já foi usado para outra operação.';
    END IF;
    RETURN coalesce((SELECT pp.quantidade FROM public.produtos_prontos pp WHERE pp.user_id = uid AND pp.produto_id = existente.produto_id), 0);
  END IF;

  SELECT * INTO producao FROM public.produtos_prontos_movimentos m
  WHERE m.user_id = uid AND m.evento_id = p_producao_evento_id AND m.tipo = 'producao';
  IF NOT FOUND THEN RAISE EXCEPTION 'ESTOQUE: produção não encontrada.'; END IF;

  IF EXISTS (
    SELECT 1 FROM public.produtos_prontos_movimentos m
    WHERE m.user_id = uid AND m.reverte_evento_id = p_producao_evento_id
  ) THEN
    RAISE EXCEPTION 'ESTOQUE: esta produção já foi desfeita.';
  END IF;

  SELECT pp.quantidade INTO v_saldo FROM public.produtos_prontos pp
  WHERE pp.user_id = uid AND pp.produto_id = producao.produto_id
  FOR UPDATE;
  IF coalesce(v_saldo, 0) < producao.quantidade_delta THEN
    RAISE EXCEPTION 'ESTOQUE: parte desta produção já foi usada em pedidos ou descartada. Só dá para desfazer quando todas as unidades ainda estão no estoque pronto.';
  END IF;

  PERFORM public._mover_estoque_pronto(uid, producao.produto_id, -producao.quantidade_delta, 'estorno_producao',
    p_evento_id, NULL, NULL, NULL, p_producao_evento_id, 'Produção desfeita');

  FOR mov IN
    SELECT m.id, m.insumo_id, m.quantidade_delta_base, m.unidade_base
    FROM public.estoque_movimentos m
    WHERE m.user_id = uid AND m.evento_id = p_producao_evento_id
      AND m.origem_tipo = 'producao_estoque' AND m.tipo_movimento = 'saida_producao'
  LOOP
    INSERT INTO public.estoque_movimentos (
      user_id, insumo_id, quantidade_delta_base, unidade_base,
      tipo_movimento, origem_tipo, origem_id, evento_id, reverte_movimento_id, observacao,
      produto_id, descricao_snapshot
    ) VALUES (
      uid, mov.insumo_id, -mov.quantidade_delta_base, mov.unidade_base,
      'estorno', 'producao_estoque', producao.produto_id, p_evento_id, mov.id,
      'Estorno por produção para estoque pronto desfeita',
      producao.produto_id, producao.produto_nome
    );
  END LOOP;

  RETURN v_saldo - producao.quantidade_delta;
END;
$function$;
REVOKE ALL ON FUNCTION public.desfazer_producao_estoque(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.desfazer_producao_estoque(uuid, uuid) TO authenticated, service_role;

-- 8. Usar o estoque pronto num item de pedido ------------------------------------------------
-- Retira do estoque pronto o que couber no que ainda falta produzir do item. Não baixa insumos.
CREATE OR REPLACE FUNCTION public._alocar_estoque_pronto_item(p_user uuid, p_item_id uuid)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  item public.pedido_itens%ROWTYPE;
  ped public.pedidos%ROWTYPE;
  v_pendente numeric;
  v_disponivel numeric;
  v_usar numeric;
BEGIN
  SELECT pi.* INTO item FROM public.pedido_itens pi
  WHERE pi.id = p_item_id AND pi.user_id = p_user
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Item do pedido não encontrado ou sem permissão.'; END IF;

  SELECT * INTO ped FROM public.pedidos p WHERE p.id = item.pedido_id AND p.user_id = p_user;
  IF NOT FOUND OR ped.status NOT IN ('recebido', 'confirmado', 'em_producao') THEN RETURN 0; END IF;
  IF item.produto_id IS NULL THEN RETURN 0; END IF;

  v_pendente := item.quantidade - item.quantidade_produzida;
  IF v_pendente <= 0 THEN RETURN 0; END IF;

  SELECT pp.quantidade INTO v_disponivel FROM public.produtos_prontos pp
  WHERE pp.user_id = p_user AND pp.produto_id = item.produto_id
  FOR UPDATE;
  IF coalesce(v_disponivel, 0) <= 0 THEN RETURN 0; END IF;

  v_usar := least(v_pendente, v_disponivel);

  PERFORM public._mover_estoque_pronto(p_user, item.produto_id, -v_usar, 'uso_pedido', gen_random_uuid(),
    ped.id, ped.numero, item.id, NULL, NULL);

  UPDATE public.pedido_itens
  SET quantidade_produzida = quantidade_produzida + v_usar,
      quantidade_do_estoque = quantidade_do_estoque + v_usar
  WHERE id = item.id AND user_id = p_user;

  RETURN v_usar;
END;
$function$;
REVOKE ALL ON FUNCTION public._alocar_estoque_pronto_item(uuid, uuid) FROM PUBLIC, anon, authenticated;

-- Chamada pelo sistema (pedido manual): só itens da própria confeitaria.
CREATE OR REPLACE FUNCTION public.usar_estoque_pronto_item(p_item_id uuid)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  uid uuid := public._tenant();
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Acesso não autorizado.'; END IF;
  IF NOT public._acesso_liberado() THEN RAISE EXCEPTION 'Acesso não liberado.'; END IF;
  IF p_item_id IS NULL THEN RAISE EXCEPTION 'Item do pedido não informado.'; END IF;
  RETURN public._alocar_estoque_pronto_item(uid, p_item_id);
END;
$function$;
REVOKE ALL ON FUNCTION public.usar_estoque_pronto_item(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.usar_estoque_pronto_item(uuid) TO authenticated, service_role;

-- Catálogo: uso automático. Só itens iguais ao produto (sem variação escolhida), porque o
-- estoque pronto é por produto. Falha aqui nunca derruba o pedido do cliente.
CREATE OR REPLACE FUNCTION public._usar_estoque_pronto_catalogo(p_pedido uuid, p_user uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_item record;
BEGIN
  FOR v_item IN
    SELECT pi.id
    FROM public.pedido_itens pi
    JOIN public.produtos pr ON pr.id = pi.produto_id AND pr.user_id = pi.user_id
    WHERE pi.pedido_id = p_pedido AND pi.user_id = p_user AND pi.descricao = pr.nome
    ORDER BY pi.id
  LOOP
    BEGIN
      PERFORM public._alocar_estoque_pronto_item(p_user, v_item.id);
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'estoque pronto: item % não alocado: %', v_item.id, SQLERRM;
    END;
  END LOOP;
END;
$function$;
REVOKE ALL ON FUNCTION public._usar_estoque_pronto_catalogo(uuid, uuid) FROM PUBLIC, anon, authenticated;

-- 9. salvar_pedido: itens com "usar_estoque": true retiram do estoque pronto -----------------
-- Mesma função da migração 0047 (SECURITY INVOKER, tenant, recebimentos preservados); a única
-- mudança é a chamada a usar_estoque_pronto_item depois de gravar cada item marcado.
CREATE OR REPLACE FUNCTION public.salvar_pedido(payload jsonb, itens jsonb, registro_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  r public.pedidos;
  rid uuid;
  item jsonb;
  v_item_id uuid;
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
    )
    RETURNING id INTO v_item_id;

    -- Escolha da pessoa: usar o que já está pronto (o restante segue pendente para produzir).
    IF item->>'usar_estoque' = 'true' THEN
      PERFORM public.usar_estoque_pronto_item(v_item_id);
    END IF;
  END LOOP;

  RETURN rid;
END;
$function$;

-- 10. ajustar_producao: reduzir a produção devolve primeiro o que foi produzido para o pedido
-- (estorna insumos, como antes) e só depois o que veio do estoque pronto (volta ao estoque
-- pronto, sem mexer nos insumos). Aumentar a produção continua baixando insumos.
CREATE OR REPLACE FUNCTION public.ajustar_producao(evento_id uuid, pedido_item_id uuid, quantidade_resultado numeric)
 RETURNS numeric
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  uid uuid := public._tenant();
  item public.pedido_itens%ROWTYPE;
  produto public.produtos%ROWTYPE;
  evento_existente public.producao_eventos%ROWTYPE;
  delta numeric;
  delta_insumos numeric;
  propria numeric;
  devolvido numeric := 0;
  v_numero bigint;
  rendimento numeric;
  receita record;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'Acesso não autorizado.';
  END IF;
  IF evento_id IS NULL OR pedido_item_id IS NULL THEN
    RAISE EXCEPTION 'Identificador do evento e do item são obrigatórios.';
  END IF;
  IF quantidade_resultado IS NULL
     OR quantidade_resultado < 0
     OR quantidade_resultado::text IN ('NaN', 'Infinity', '-Infinity') THEN
    RAISE EXCEPTION 'A quantidade produzida informada é inválida.';
  END IF;

  -- Bloqueia o item para serializar cliques concorrentes e calcular só a diferença.
  SELECT pi.* INTO item
  FROM public.pedido_itens pi
  JOIN public.pedidos p ON p.id = pi.pedido_id
  WHERE pi.id = pedido_item_id
    AND pi.user_id = uid
    AND p.user_id = uid
  FOR UPDATE OF pi;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Item do pedido não encontrado ou sem permissão.';
  END IF;
  IF quantidade_resultado > item.quantidade THEN
    RAISE EXCEPTION 'A quantidade produzida não pode exceder a quantidade do pedido (%).', item.quantidade;
  END IF;

  -- Repetir o mesmo evento não deve repetir baixa/estorno de estoque.
  SELECT * INTO evento_existente
  FROM public.producao_eventos pe
  WHERE pe.user_id = uid AND pe.evento_id = ajustar_producao.evento_id;

  IF FOUND THEN
    IF evento_existente.pedido_item_id <> pedido_item_id
       OR evento_existente.quantidade_resultado <> quantidade_resultado THEN
      RAISE EXCEPTION 'Este identificador de evento já foi usado para outra operação.';
    END IF;
    RETURN evento_existente.quantidade_resultante;
  END IF;

  delta := quantidade_resultado - coalesce(item.quantidade_produzida, 0);

  -- Quanto do delta mexe nos insumos e quanto volta ao estoque pronto.
  delta_insumos := delta;
  IF delta < 0 THEN
    propria := greatest(0, coalesce(item.quantidade_produzida, 0) - coalesce(item.quantidade_do_estoque, 0));
    delta_insumos := -least(-delta, propria);
    devolvido := (-delta) + delta_insumos;
  END IF;

  IF delta_insumos <> 0 AND item.produto_id IS NOT NULL THEN
    SELECT pr.* INTO produto
    FROM public.produtos pr
    WHERE pr.id = item.produto_id AND pr.user_id = uid
    FOR SHARE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Produto vinculado ao item não encontrado.';
    END IF;

    rendimento := CASE WHEN coalesce(produto.rendimento, 0) > 0
                       THEN produto.rendimento ELSE 1 END;

    -- Consolida linhas repetidas da receita por insumo. Consumo negativo
    -- (redução da produção) gera um movimento positivo de estorno.
    FOR receita IN
      SELECT
        ri.insumo_id,
        i.nome AS insumo_nome,
        public.medida_base(coalesce(ri.unidade_receita, i.unidade_embalagem, i.unidade)) AS unidade_base,
        sum(
          coalesce(ri.quantidade_utilizada, ri.quantidade)
          * public.medida_fator(coalesce(ri.unidade_receita, i.unidade_embalagem, i.unidade))
        ) * delta_insumos / rendimento AS quantidade_delta
      FROM public.receita_itens ri
      JOIN public.insumos i ON i.id = ri.insumo_id AND i.user_id = uid
      WHERE ri.produto_id = item.produto_id AND ri.user_id = uid
      GROUP BY ri.insumo_id, i.nome,
        public.medida_base(coalesce(ri.unidade_receita, i.unidade_embalagem, i.unidade))
    LOOP
      IF receita.unidade_base IS NULL OR receita.unidade_base NOT IN ('g', 'ml', 'un') THEN
        RAISE EXCEPTION 'Unidade incompatível ou não configurada para o insumo "%".', receita.insumo_nome;
      END IF;
      IF receita.quantidade_delta IS NULL
         OR receita.quantidade_delta::text IN ('NaN', 'Infinity', '-Infinity') THEN
        RAISE EXCEPTION 'Não foi possível calcular o consumo do insumo "%".', receita.insumo_nome;
      END IF;
      IF receita.quantidade_delta <> 0 THEN
        INSERT INTO public.estoque_movimentos (
          user_id, insumo_id, quantidade_delta_base, unidade_base,
          tipo_movimento, origem_tipo, origem_id, evento_id, observacao
        ) VALUES (
          uid,
          receita.insumo_id,
          -receita.quantidade_delta,
          receita.unidade_base,
          CASE WHEN delta_insumos > 0 THEN 'saida_producao' ELSE 'estorno' END,
          'producao',
          pedido_item_id,
          evento_id,
          CASE WHEN delta_insumos > 0
            THEN 'Consumo automático por aumento da produção'
            ELSE 'Estorno automático por redução da produção'
          END
        );
      END IF;
    END LOOP;
  END IF;

  -- Unidades que vieram do estoque pronto voltam para ele (os insumos já tinham sido baixados
  -- quando aquela produção foi registrada).
  IF devolvido > 0 AND item.produto_id IS NOT NULL THEN
    SELECT p.numero INTO v_numero FROM public.pedidos p WHERE p.id = item.pedido_id AND p.user_id = uid;
    PERFORM public._mover_estoque_pronto(uid, item.produto_id, devolvido, 'devolucao_pedido', gen_random_uuid(),
      item.pedido_id, v_numero, item.id, NULL, 'Produção reduzida no pedido');
  END IF;

  UPDATE public.pedido_itens
  SET quantidade_produzida = quantidade_resultado,
      quantidade_do_estoque = greatest(0, coalesce(quantidade_do_estoque, 0) - devolvido)
  WHERE id = pedido_item_id AND user_id = uid;

  INSERT INTO public.producao_eventos (
    user_id, evento_id, pedido_item_id,
    quantidade_resultado, quantidade_resultante
  ) VALUES (
    uid, evento_id, pedido_item_id,
    quantidade_resultado, quantidade_resultado
  );

  RETURN quantidade_resultado;
END;
$function$;

-- 11. Cancelar o pedido devolve ao estoque pronto o que ele retirou ---------------------------
-- BEFORE UPDATE: a linha do pedido ainda tem o status antigo, então a trava de pedido encerrado
-- (que consulta o status) deixa o item ser ajustado. Pedido já entregue não devolve nada: as
-- unidades saíram da confeitaria.
CREATE OR REPLACE FUNCTION public._devolver_estoque_pronto_cancelamento()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_item record;
BEGIN
  IF OLD.status IN ('entregue', 'finalizado', 'perdido') THEN RETURN NEW; END IF;

  FOR v_item IN
    SELECT pi.id, pi.produto_id, pi.quantidade_do_estoque
    FROM public.pedido_itens pi
    WHERE pi.pedido_id = OLD.id AND pi.user_id = OLD.user_id
      AND pi.quantidade_do_estoque > 0 AND pi.produto_id IS NOT NULL
    ORDER BY pi.id
    FOR UPDATE
  LOOP
    PERFORM public._mover_estoque_pronto(OLD.user_id, v_item.produto_id, v_item.quantidade_do_estoque,
      'devolucao_pedido', gen_random_uuid(), OLD.id, OLD.numero, v_item.id, NULL, 'Pedido cancelado');
    UPDATE public.pedido_itens
    SET quantidade_produzida = quantidade_produzida - v_item.quantidade_do_estoque,
        quantidade_do_estoque = 0
    WHERE id = v_item.id AND user_id = OLD.user_id;
  END LOOP;
  RETURN NEW;
END;
$function$;
REVOKE ALL ON FUNCTION public._devolver_estoque_pronto_cancelamento() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_devolver_estoque_pronto ON public.pedidos;
CREATE TRIGGER trg_devolver_estoque_pronto
  BEFORE UPDATE OF status ON public.pedidos
  FOR EACH ROW
  WHEN (NEW.status = 'cancelado' AND OLD.status IS DISTINCT FROM 'cancelado')
  EXECUTE FUNCTION public._devolver_estoque_pronto_cancelamento();

-- 12. Produto com unidades prontas não pode ser excluído (o estoque sumiria junto) -------------
CREATE OR REPLACE FUNCTION public._bloquear_exclusao_produto_com_estoque_pronto()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.produtos_prontos pp
    WHERE pp.user_id = OLD.user_id AND pp.produto_id = OLD.id AND pp.quantidade > 0
  ) THEN
    RAISE EXCEPTION 'ESTOQUE: "%" tem unidades prontas em estoque. Dê baixa (descarte) ou use essas unidades antes de excluir o produto.', OLD.nome;
  END IF;
  RETURN OLD;
END;
$function$;
REVOKE ALL ON FUNCTION public._bloquear_exclusao_produto_com_estoque_pronto() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_produto_bloquear_exclusao_estoque_pronto ON public.produtos;
CREATE TRIGGER trg_produto_bloquear_exclusao_estoque_pronto
  BEFORE DELETE ON public.produtos
  FOR EACH ROW EXECUTE FUNCTION public._bloquear_exclusao_produto_com_estoque_pronto();

-- 13. Catálogo: uso automático do estoque pronto depois de gravar os itens ---------------------
-- Troca pontual e verificada (mesmo método da migração 0044): falha com erro claro se o trecho
-- esperado não existir e não repete se já foi aplicada (marca /*0049*/).
CREATE OR REPLACE FUNCTION pg_temp.trocar_0049(p_funcao regprocedure, p_de text, p_para text)
RETURNS void
LANGUAGE plpgsql
AS $function$
DECLARE
  v text := pg_get_functiondef(p_funcao);
BEGIN
  IF position('/*0049*/' IN v) > 0 THEN RETURN; END IF;
  IF position(p_de IN v) = 0 THEN
    RAISE EXCEPTION 'Migração 0049: trecho esperado não encontrado em %: %', p_funcao, left(p_de, 120);
  END IF;
  EXECUTE replace(v, p_de, p_para);
END;
$function$;

SELECT pg_temp.trocar_0049('public.criar_pedido_catalogo(text, uuid, jsonb, jsonb, jsonb)',
$a$  RETURN jsonb_build_object('codigo', v_codigo, 'numero', v_numero);$a$,
$b$  -- Estoque pronto: o que já está pronto atende o pedido sem baixar insumos de novo. /*0049*/
  PERFORM public._usar_estoque_pronto_catalogo(v_pedido_id, c.user_id);

  RETURN jsonb_build_object('codigo', v_codigo, 'numero', v_numero);$b$);

NOTIFY pgrst, 'reload schema';

COMMIT;
