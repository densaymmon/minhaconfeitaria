-- Draft migration 0004: append-only inventory ledger foundation.
-- This migration intentionally does not add purchase/production triggers yet.
-- Those integrations must be implemented atomically and tested before activation.

CREATE TABLE public.estoque_movimentos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid(),
  insumo_id uuid NOT NULL REFERENCES public.insumos(id) ON DELETE RESTRICT,
  quantidade_delta_base numeric(18,6) NOT NULL,
  unidade_base text NOT NULL CHECK (unidade_base IN ('g', 'ml', 'un')),
  tipo_movimento text NOT NULL CHECK (
    tipo_movimento IN (
      'entrada_compra',
      'saida_producao',
      'estorno',
      'inventario_inicial',
      'ajuste_manual'
    )
  ),
  origem_tipo text NOT NULL CHECK (
    origem_tipo IN ('compra_item', 'producao', 'inventario', 'ajuste')
  ),
  origem_id uuid,
  evento_id uuid NOT NULL,
  reverte_movimento_id uuid REFERENCES public.estoque_movimentos(id) ON DELETE RESTRICT,
  observacao text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT estoque_movimento_delta_valido CHECK (
    quantidade_delta_base <> 0
    AND quantidade_delta_base::text NOT IN ('NaN', 'Infinity', '-Infinity')
  ),
  CONSTRAINT estoque_movimento_observacao_valida CHECK (
    coalesce(length(observacao), 0) <= 1000
  ),
  CONSTRAINT estoque_evento_insumo_unico UNIQUE (user_id, evento_id, insumo_id)
);

CREATE INDEX estoque_movimentos_saldo_idx
  ON public.estoque_movimentos (user_id, insumo_id, created_at);

CREATE INDEX estoque_movimentos_origem_idx
  ON public.estoque_movimentos (user_id, origem_tipo, origem_id);

ALTER TABLE public.estoque_movimentos ENABLE ROW LEVEL SECURITY;

CREATE POLICY estoque_movimentos_dono_select
  ON public.estoque_movimentos
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

-- The authenticated client must not directly forge or rewrite the ledger.
-- Future SECURITY DEFINER RPCs will validate ownership and append movements.
REVOKE ALL ON TABLE public.estoque_movimentos FROM anon, authenticated;
GRANT SELECT ON TABLE public.estoque_movimentos TO authenticated;
GRANT ALL ON TABLE public.estoque_movimentos TO service_role;

CREATE OR REPLACE FUNCTION public.saldo_estoque()
RETURNS TABLE (
  insumo_id uuid,
  nome text,
  unidade_base text,
  saldo numeric
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $function$
  SELECT
    i.id,
    i.nome,
    CASE
      WHEN i.unidade IN ('kg', 'g') THEN 'g'
      WHEN i.unidade IN ('L', 'ml') THEN 'ml'
      WHEN i.unidade IN ('un', 'unidade', 'dúzia') THEN 'un'
      ELSE NULL
    END AS unidade_base,
    coalesce(sum(m.quantidade_delta_base), 0)::numeric AS saldo
  FROM public.insumos i
  LEFT JOIN public.estoque_movimentos m
    ON m.insumo_id = i.id
   AND m.user_id = i.user_id
  WHERE i.user_id = auth.uid()
  GROUP BY i.id, i.nome, i.unidade
  ORDER BY i.nome;
$function$;

REVOKE ALL ON FUNCTION public.saldo_estoque() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.saldo_estoque() TO authenticated, service_role;

COMMENT ON TABLE public.estoque_movimentos IS
  'Append-only stock ledger. Quantities are expressed in the compatible base unit: g, ml, or un. Corrections must be compensating movements, never UPDATE/DELETE.';
COMMENT ON FUNCTION public.saldo_estoque() IS
  'Returns current per-ingredient balance from the append-only stock ledger; negative balances are permitted and must be surfaced as alerts by the UI.';
