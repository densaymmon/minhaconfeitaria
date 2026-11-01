-- 0050: despesas fixas mensais que se lançam sozinhas (aluguel, internet, mensalidades).
--
-- A pessoa cadastra a despesa fixa uma vez (descrição, categoria, valor, data da primeira vez e,
-- se quiser, o último mês). Quando abre o Financeiro ou as Despesas, o app chama
-- gerar_despesas_recorrentes(hoje), que lança em `despesas` uma linha por mês já vencido, no mesmo
-- dia do mês da primeira data (dia 31 cai no último dia de meses menores). Cada lançamento é uma
-- despesa comum: dá para editar ou excluir sem afetar a regra, e um mês excluído não volta, porque
-- a regra guarda até que mês já foi lançado (gerado_ate).
--
-- Seguro para aplicar antes ou depois do código: o app esconde a função enquanto a tabela não existir.

CREATE TABLE IF NOT EXISTS public.despesas_recorrentes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT public._tenant(),
  descricao text NOT NULL,
  categoria text NOT NULL DEFAULT 'Outros',
  valor numeric(12,2) NOT NULL,
  -- Data da primeira ocorrência; o dia do mês das demais é o dia desta data.
  inicio date NOT NULL,
  -- Último mês em que ainda lança (qualquer dia dentro dele). NULL = sem data final.
  fim date,
  -- Primeiro dia do último mês já lançado. Só a função de geração altera.
  gerado_ate date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT despesa_recorrente_descricao CHECK (length(btrim(descricao)) BETWEEN 1 AND 200),
  CONSTRAINT despesa_recorrente_categoria CHECK (length(btrim(categoria)) BETWEEN 1 AND 60),
  CONSTRAINT despesa_recorrente_valor CHECK (valor > 0 AND valor <= 10000000),
  CONSTRAINT despesa_recorrente_inicio CHECK (inicio >= DATE '2000-01-01' AND inicio <= DATE '2100-12-31'),
  CONSTRAINT despesa_recorrente_fim CHECK (fim IS NULL OR fim >= inicio)
);

CREATE INDEX IF NOT EXISTS despesas_recorrentes_user_idx ON public.despesas_recorrentes (user_id);

ALTER TABLE public.despesas
  ADD COLUMN IF NOT EXISTS recorrente_id uuid REFERENCES public.despesas_recorrentes(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS despesas_recorrente_idx ON public.despesas (recorrente_id) WHERE recorrente_id IS NOT NULL;

ALTER TABLE public.despesas_recorrentes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS despesas_recorrentes_dono_select ON public.despesas_recorrentes;
CREATE POLICY despesas_recorrentes_dono_select ON public.despesas_recorrentes FOR SELECT TO authenticated
  USING ((SELECT public._tenant()) = user_id);
DROP POLICY IF EXISTS despesas_recorrentes_dono_insert ON public.despesas_recorrentes;
CREATE POLICY despesas_recorrentes_dono_insert ON public.despesas_recorrentes FOR INSERT TO authenticated
  WITH CHECK ((SELECT public._tenant()) = user_id);
DROP POLICY IF EXISTS despesas_recorrentes_dono_update ON public.despesas_recorrentes;
CREATE POLICY despesas_recorrentes_dono_update ON public.despesas_recorrentes FOR UPDATE TO authenticated
  USING ((SELECT public._tenant()) = user_id) WITH CHECK ((SELECT public._tenant()) = user_id);
DROP POLICY IF EXISTS despesas_recorrentes_dono_delete ON public.despesas_recorrentes;
CREATE POLICY despesas_recorrentes_dono_delete ON public.despesas_recorrentes FOR DELETE TO authenticated
  USING ((SELECT public._tenant()) = user_id);

DROP POLICY IF EXISTS acesso_liberado ON public.despesas_recorrentes;
CREATE POLICY acesso_liberado ON public.despesas_recorrentes AS RESTRICTIVE FOR ALL TO authenticated
  USING ((SELECT public._acesso_liberado())) WITH CHECK ((SELECT public._acesso_liberado()));
-- Financeiro: o papel "produção" não vê nem altera (mesma regra de despesas e contas a pagar).
DROP POLICY IF EXISTS papel_financeiro ON public.despesas_recorrentes;
CREATE POLICY papel_financeiro ON public.despesas_recorrentes AS RESTRICTIVE FOR ALL TO authenticated
  USING ((SELECT public._papel()) <> 'producao') WITH CHECK ((SELECT public._papel()) <> 'producao');

-- O navegador cadastra e ajusta a regra, mas não mexe em user_id nem em gerado_ate/inicio.
REVOKE ALL ON TABLE public.despesas_recorrentes FROM PUBLIC, anon, authenticated;
GRANT SELECT, DELETE ON TABLE public.despesas_recorrentes TO authenticated;
GRANT INSERT (descricao, categoria, valor, inicio, fim) ON TABLE public.despesas_recorrentes TO authenticated;
GRANT UPDATE (descricao, categoria, valor, fim) ON TABLE public.despesas_recorrentes TO authenticated;
GRANT ALL ON TABLE public.despesas_recorrentes TO service_role;

COMMENT ON TABLE public.despesas_recorrentes IS
  'Regras de despesas fixas mensais. gerar_despesas_recorrentes lança uma despesa por mês vencido; gerado_ate evita repetir e não reaparece o que a pessoa excluiu.';

CREATE OR REPLACE FUNCTION public._atualizar_updated_at_despesa_recorrente()
RETURNS trigger LANGUAGE plpgsql AS $function$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$function$;
REVOKE ALL ON FUNCTION public._atualizar_updated_at_despesa_recorrente() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_despesa_recorrente_updated_at ON public.despesas_recorrentes;
CREATE TRIGGER trg_despesa_recorrente_updated_at BEFORE UPDATE ON public.despesas_recorrentes
  FOR EACH ROW EXECUTE FUNCTION public._atualizar_updated_at_despesa_recorrente();

-- Lança as despesas fixas vencidas até p_hoje. Idempotente: pode ser chamada várias vezes (inclusive
-- ao mesmo tempo) sem duplicar, porque cada regra é travada e guarda o último mês lançado.
-- Devolve quantas despesas novas foram criadas.
CREATE OR REPLACE FUNCTION public.gerar_despesas_recorrentes(p_hoje date)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  uid uuid := public._tenant_financeiro();
  r record;
  mes date;
  ultimo date;
  dia integer;
  ocorrencia date;
  total integer := 0;
  voltas integer;
BEGIN
  -- A data vem do aparelho (fuso do Brasil); aceita só diferença pequena para o relógio do servidor.
  IF p_hoje IS NULL OR abs(p_hoje - current_date) > 2 THEN
    RAISE EXCEPTION 'DESPESA: data de referência inválida.';
  END IF;

  FOR r IN
    SELECT * FROM public.despesas_recorrentes WHERE user_id = uid ORDER BY created_at, id FOR UPDATE
  LOOP
    mes := CASE WHEN r.gerado_ate IS NULL
      THEN date_trunc('month', r.inicio)::date
      ELSE (r.gerado_ate + interval '1 month')::date END;
    ultimo := NULL;
    voltas := 0;
    WHILE mes <= date_trunc('month', p_hoje)::date
      AND (r.fim IS NULL OR mes <= date_trunc('month', r.fim)::date)
      AND voltas < 60
    LOOP
      dia := least(extract(day FROM r.inicio)::integer,
                   extract(day FROM (mes + interval '1 month' - interval '1 day'))::integer);
      ocorrencia := mes + (dia - 1);
      -- Ainda não venceu neste mês: lança quando o dia chegar.
      EXIT WHEN ocorrencia > p_hoje;
      INSERT INTO public.despesas (user_id, data, descricao, categoria, valor, recorrente_id)
      VALUES (uid, ocorrencia, r.descricao, r.categoria, r.valor, r.id);
      total := total + 1;
      ultimo := mes;
      voltas := voltas + 1;
      mes := (mes + interval '1 month')::date;
    END LOOP;
    IF ultimo IS NOT NULL THEN
      UPDATE public.despesas_recorrentes SET gerado_ate = ultimo WHERE id = r.id;
    END IF;
  END LOOP;
  RETURN total;
END;
$function$;
REVOKE ALL ON FUNCTION public.gerar_despesas_recorrentes(date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.gerar_despesas_recorrentes(date) TO authenticated, service_role;
