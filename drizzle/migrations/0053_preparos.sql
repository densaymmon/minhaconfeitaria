-- 0053: preparos (recheios, coberturas, caldas...) — receitas de base usadas em várias receitas.
--
-- Um preparo é um insumo com tipo = 'preparo': tem os próprios ingredientes (preparo_itens) e um
-- rendimento (ex.: rende 500 g). O preço do "pacote" do insumo (preco_embalagem) é o custo dos
-- ingredientes, calculado no banco, e quantidade_embalagem/unidade_embalagem guardam o rendimento.
-- Assim o preparo entra na receita do bolo (receita_itens) e nas variações como qualquer insumo
-- (ex.: 100 g da cobertura = 1/5 do custo), e todo o cálculo de custo existente — app, catálogo e
-- _custo_unitario_produto — continua igual.
--
-- O custo do preparo se atualiza sozinho quando ele é salvo (salvar_preparo) e quando o preço de um
-- dos seus ingredientes muda (trigger em insumos). Os custos gravados nos pedidos não mudam.
--
-- Estoque (primeira versão): preparos não têm estoque. Ao produzir, a baixa de insumos ignora as
-- linhas de preparo da receita (ajustar_producao e registrar_producao_estoque).
--
-- Um preparo não usa outro preparo (um nível só, sem ciclos). Seguro para aplicar antes do código.
BEGIN;

-- 1. Novo tipo de insumo -------------------------------------------------------------------------
ALTER TABLE public.insumos DROP CONSTRAINT IF EXISTS insumo_valido;
ALTER TABLE public.insumos ADD CONSTRAINT insumo_valido CHECK (
  length(btrim(nome)) BETWEEN 1 AND 120
  AND preco_unidade >= 0
  AND unidade IN ('kg', 'g', 'L', 'ml', 'un', 'dúzia', 'pacote')
  AND tipo IN ('ingrediente', 'embalagem', 'preparo')
);

-- 2. Ingredientes de cada preparo ------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.preparo_itens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT public._tenant(),
  preparo_id uuid NOT NULL REFERENCES public.insumos(id) ON DELETE CASCADE,
  insumo_id uuid NOT NULL REFERENCES public.insumos(id) ON DELETE RESTRICT,
  quantidade numeric NOT NULL,
  unidade text NOT NULL,
  ordem smallint NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT preparo_item_quantidade CHECK (quantidade > 0 AND quantidade <= 1000000),
  CONSTRAINT preparo_item_unidade CHECK (unidade IN ('kg', 'g', 'L', 'ml', 'un', 'dúzia', 'pacote')),
  CONSTRAINT preparo_item_nao_ele_mesmo CHECK (preparo_id <> insumo_id)
);
CREATE INDEX IF NOT EXISTS preparo_itens_preparo_idx ON public.preparo_itens (preparo_id);
CREATE INDEX IF NOT EXISTS preparo_itens_insumo_idx ON public.preparo_itens (insumo_id);
CREATE INDEX IF NOT EXISTS preparo_itens_user_idx ON public.preparo_itens (user_id);

ALTER TABLE public.preparo_itens ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS dono_select ON public.preparo_itens;
CREATE POLICY dono_select ON public.preparo_itens FOR SELECT TO authenticated
  USING ((SELECT public._tenant()) = user_id);
DROP POLICY IF EXISTS dono_insert ON public.preparo_itens;
CREATE POLICY dono_insert ON public.preparo_itens FOR INSERT TO authenticated
  WITH CHECK ((SELECT public._tenant()) = user_id);
DROP POLICY IF EXISTS dono_update ON public.preparo_itens;
CREATE POLICY dono_update ON public.preparo_itens FOR UPDATE TO authenticated
  USING ((SELECT public._tenant()) = user_id) WITH CHECK ((SELECT public._tenant()) = user_id);
DROP POLICY IF EXISTS dono_delete ON public.preparo_itens;
CREATE POLICY dono_delete ON public.preparo_itens FOR DELETE TO authenticated
  USING ((SELECT public._tenant()) = user_id);
DROP POLICY IF EXISTS acesso_liberado ON public.preparo_itens;
CREATE POLICY acesso_liberado ON public.preparo_itens AS RESTRICTIVE FOR ALL TO authenticated
  USING ((SELECT public._acesso_liberado())) WITH CHECK ((SELECT public._acesso_liberado()));

REVOKE ALL ON TABLE public.preparo_itens FROM PUBLIC, anon, authenticated;
-- Leitura direta; gravação só por salvar_preparo (SECURITY INVOKER, por isso as permissões de escrita).
GRANT SELECT, INSERT, DELETE ON TABLE public.preparo_itens TO authenticated;
GRANT ALL ON TABLE public.preparo_itens TO service_role;

-- 3. Validação de cada ingrediente do preparo -------------------------------------------------------
CREATE OR REPLACE FUNCTION public._validar_preparo_item()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_preparo public.insumos;
  v_ins public.insumos;
BEGIN
  SELECT * INTO v_preparo FROM public.insumos WHERE id = NEW.preparo_id AND user_id = NEW.user_id;
  IF NOT FOUND OR v_preparo.tipo <> 'preparo' THEN
    RAISE EXCEPTION 'Preparo não encontrado.';
  END IF;
  SELECT * INTO v_ins FROM public.insumos WHERE id = NEW.insumo_id AND user_id = NEW.user_id FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Ingrediente do preparo não encontrado.';
  END IF;
  IF v_ins.tipo = 'preparo' THEN
    RAISE EXCEPTION 'Um preparo não pode usar outro preparo como ingrediente ("%").', v_ins.nome;
  END IF;
  IF NEW.quantidade::text IN ('NaN', 'Infinity', '-Infinity') THEN
    RAISE EXCEPTION 'Quantidade inválida para "%".', v_ins.nome;
  END IF;
  IF public.medida_base(NEW.unidade) IS NULL
     OR public.medida_base(NEW.unidade) IS DISTINCT FROM public.medida_base(coalesce(v_ins.unidade_embalagem, v_ins.unidade)) THEN
    RAISE EXCEPTION 'Medida incompatível para "%": peso, volume e unidade não se convertem entre si.', v_ins.nome;
  END IF;
  RETURN NEW;
END;
$function$;
REVOKE ALL ON FUNCTION public._validar_preparo_item() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS preparo_itens_validar ON public.preparo_itens;
CREATE TRIGGER preparo_itens_validar BEFORE INSERT OR UPDATE ON public.preparo_itens
  FOR EACH ROW EXECUTE FUNCTION public._validar_preparo_item();

-- 4. Custo do preparo (mesma conversão de medidas de _custo_unitario_produto) ----------------------
CREATE OR REPLACE FUNCTION public._custo_preparo(p_preparo uuid)
RETURNS numeric
LANGUAGE sql
STABLE
SET search_path = pg_catalog, public
AS $function$
  SELECT round(coalesce(sum(
    (coalesce(i.preco_embalagem, i.preco_unidade, 0)
      / nullif(coalesce(i.quantidade_embalagem, 1) * public.medida_fator(coalesce(i.unidade_embalagem, i.unidade, 'un')), 0))
    * pi.quantidade * public.medida_fator(pi.unidade)
  ), 0), 4)
  FROM public.preparo_itens pi
  JOIN public.insumos i ON i.id = pi.insumo_id AND i.user_id = pi.user_id
  WHERE pi.preparo_id = p_preparo
$function$;
REVOKE ALL ON FUNCTION public._custo_preparo(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public._atualizar_custo_preparo(p_preparo uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_custo numeric := public._custo_preparo(p_preparo);
BEGIN
  -- validar_embalagem recalcula preco_unidade; sinalizar_custo_receitas marca os produtos que usam o preparo.
  UPDATE public.insumos SET preco_embalagem = v_custo
  WHERE id = p_preparo AND tipo = 'preparo' AND preco_embalagem IS DISTINCT FROM v_custo;
END;
$function$;
REVOKE ALL ON FUNCTION public._atualizar_custo_preparo(uuid) FROM PUBLIC, anon, authenticated;

-- 5. Preço de um ingrediente mudou → recalcula os preparos que o usam ------------------------------
CREATE OR REPLACE FUNCTION public._recalcular_preparos_do_insumo()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_preparo uuid;
BEGIN
  IF NEW.tipo = 'preparo' THEN RETURN NEW; END IF;
  IF OLD.preco_embalagem / nullif(OLD.quantidade_embalagem * public.medida_fator(OLD.unidade_embalagem), 0)
     IS NOT DISTINCT FROM NEW.preco_embalagem / nullif(NEW.quantidade_embalagem * public.medida_fator(NEW.unidade_embalagem), 0) THEN
    RETURN NEW;
  END IF;
  FOR v_preparo IN
    SELECT DISTINCT pi.preparo_id FROM public.preparo_itens pi
    WHERE pi.insumo_id = NEW.id AND pi.user_id = NEW.user_id
  LOOP
    PERFORM public._atualizar_custo_preparo(v_preparo);
  END LOOP;
  RETURN NEW;
END;
$function$;
REVOKE ALL ON FUNCTION public._recalcular_preparos_do_insumo() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS insumos_recalcular_preparos ON public.insumos;
CREATE TRIGGER insumos_recalcular_preparos AFTER UPDATE ON public.insumos
  FOR EACH ROW EXECUTE FUNCTION public._recalcular_preparos_do_insumo();

-- 6. Proteções: o tipo "preparo" não se troca, e ingrediente de preparo não some sem aviso ---------
CREATE OR REPLACE FUNCTION public._proteger_insumo_preparo()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $function$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF (OLD.tipo = 'preparo') IS DISTINCT FROM (NEW.tipo = 'preparo') THEN
      RAISE EXCEPTION 'Não é possível transformar um preparo em insumo comum (nem o contrário).';
    END IF;
    RETURN NEW;
  END IF;
  -- DELETE: mesma mensagem que o app já reconhece para insumos usados em receitas.
  IF EXISTS (SELECT 1 FROM public.preparo_itens pi WHERE pi.insumo_id = OLD.id AND pi.user_id = OLD.user_id) THEN
    RAISE EXCEPTION 'INSUMO_USADO_EM_RECEITA: remova o insumo dos preparos (recheios e coberturas) antes de excluí-lo.';
  END IF;
  RETURN OLD;
END;
$function$;
REVOKE ALL ON FUNCTION public._proteger_insumo_preparo() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS insumos_proteger_preparo ON public.insumos;
CREATE TRIGGER insumos_proteger_preparo BEFORE UPDATE OF tipo OR DELETE ON public.insumos
  FOR EACH ROW EXECUTE FUNCTION public._proteger_insumo_preparo();

-- 7. Salvar o preparo inteiro numa transação ---------------------------------------------------------
CREATE OR REPLACE FUNCTION public.salvar_preparo(
  p_nome text,
  p_rendimento numeric,
  p_unidade text,
  p_itens jsonb,
  p_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_id uuid;
  v_atual public.insumos;
  v_item jsonb;
  v_ordem integer := 0;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sessão inválida.'; END IF;
  IF char_length(btrim(coalesce(p_nome, ''))) NOT BETWEEN 1 AND 120 THEN
    RAISE EXCEPTION 'Informe o nome do preparo.';
  END IF;
  IF p_unidade IS NULL OR p_unidade NOT IN ('kg', 'g', 'L', 'ml', 'un') THEN
    RAISE EXCEPTION 'Medida do rendimento inválida.';
  END IF;
  IF p_rendimento IS NULL OR p_rendimento::text IN ('NaN', 'Infinity', '-Infinity') OR p_rendimento <= 0 OR p_rendimento > 1000000 THEN
    RAISE EXCEPTION 'Informe quanto a receita do preparo rende.';
  END IF;
  IF jsonb_typeof(p_itens) IS DISTINCT FROM 'array' OR jsonb_array_length(p_itens) NOT BETWEEN 1 AND 50 THEN
    RAISE EXCEPTION 'Adicione de 1 a 50 ingredientes ao preparo.';
  END IF;

  IF p_id IS NULL THEN
    INSERT INTO public.insumos (nome, tipo, unidade, unidade_embalagem, quantidade_embalagem, preco_embalagem, preco_unidade)
    VALUES (btrim(p_nome), 'preparo', p_unidade, p_unidade, p_rendimento, 0, 0)
    RETURNING id INTO v_id;
  ELSE
    SELECT * INTO v_atual FROM public.insumos WHERE id = p_id FOR UPDATE;
    IF NOT FOUND OR v_atual.tipo <> 'preparo' THEN
      RAISE EXCEPTION 'Preparo não encontrado.';
    END IF;
    IF public.medida_base(v_atual.unidade) IS DISTINCT FROM public.medida_base(p_unidade) THEN
      RAISE EXCEPTION 'O rendimento deve continuar na mesma medida (peso, volume ou unidade), porque o preparo já pode estar nas receitas.';
    END IF;
    UPDATE public.insumos
    SET nome = btrim(p_nome), unidade_embalagem = p_unidade, quantidade_embalagem = p_rendimento
    WHERE id = p_id;
    v_id := p_id;
    DELETE FROM public.preparo_itens WHERE preparo_id = v_id;
  END IF;

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_itens) LOOP
    v_ordem := v_ordem + 1;
    IF jsonb_typeof(v_item) IS DISTINCT FROM 'object'
       OR jsonb_typeof(v_item->'quantidade') IS DISTINCT FROM 'number'
       OR jsonb_typeof(v_item->'insumo_id') IS DISTINCT FROM 'string'
       OR jsonb_typeof(v_item->'unidade') IS DISTINCT FROM 'string' THEN
      RAISE EXCEPTION 'Ingrediente % do preparo está incompleto.', v_ordem;
    END IF;
    INSERT INTO public.preparo_itens (preparo_id, insumo_id, quantidade, unidade, ordem)
    VALUES (v_id, (v_item->>'insumo_id')::uuid, (v_item->>'quantidade')::numeric, v_item->>'unidade', v_ordem);
  END LOOP;

  PERFORM public._atualizar_custo_preparo(v_id);
  RETURN v_id;
END;
$function$;
REVOKE ALL ON FUNCTION public.salvar_preparo(text, numeric, text, jsonb, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.salvar_preparo(text, numeric, text, jsonb, uuid) TO authenticated, service_role;

-- 8. Produção: preparos não têm estoque (a baixa ignora as linhas de preparo da receita) ------------
CREATE OR REPLACE FUNCTION pg_temp.trocar_0053(p_funcao regprocedure, p_de text, p_para text)
RETURNS void
LANGUAGE plpgsql
AS $function$
DECLARE
  v text := pg_get_functiondef(p_funcao);
BEGIN
  IF position('/*0053*/' IN v) > 0 THEN RETURN; END IF;
  IF position(p_de IN v) = 0 THEN
    RAISE EXCEPTION 'Migração 0053: trecho esperado não encontrado em %: %', p_funcao, left(p_de, 120);
  END IF;
  EXECUTE replace(v, p_de, p_para);
END;
$function$;

SELECT pg_temp.trocar_0053('public.ajustar_producao(uuid, uuid, numeric)',
  'JOIN public.insumos i ON i.id = ri.insumo_id AND i.user_id = uid',
  'JOIN public.insumos i ON i.id = ri.insumo_id AND i.user_id = uid AND i.tipo <> ''preparo'' /*0053*/');
SELECT pg_temp.trocar_0053('public.registrar_producao_estoque(uuid, uuid, numeric, text)',
  'JOIN public.insumos i ON i.id = ri.insumo_id AND i.user_id = uid',
  'JOIN public.insumos i ON i.id = ri.insumo_id AND i.user_id = uid AND i.tipo <> ''preparo'' /*0053*/');

NOTIFY pgrst, 'reload schema';

COMMIT;
