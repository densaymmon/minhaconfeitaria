-- Preserve purchase, recipe, and stock movement history by allowing ingredients to be inactivated.
ALTER TABLE public.insumos
  ADD COLUMN IF NOT EXISTS ativo boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.insumos.ativo IS
  'Indicates whether the ingredient can be selected for new recipes and purchases. Historical records remain available when false.';
