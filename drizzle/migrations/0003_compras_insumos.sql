CREATE TABLE public.compras (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid(),
  data_compra date NOT NULL,
  total numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.compra_itens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid(),
  compra_id uuid NOT NULL REFERENCES public.compras(id) ON DELETE CASCADE,
  insumo_id uuid NOT NULL REFERENCES public.insumos(id) ON DELETE RESTRICT,
  quantidade numeric NOT NULL,
  unidade text NOT NULL,
  preco_unitario numeric NOT NULL,
  total numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT compra_itens_unidade_check CHECK (unidade IN ('g','kg','L','un'))
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.compras TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.compra_itens TO authenticated;
GRANT ALL ON public.compras TO service_role;
GRANT ALL ON public.compra_itens TO service_role;

ALTER TABLE public.compras ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.compra_itens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "dono_select" ON public.compras FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "dono_insert" ON public.compras FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "dono_update" ON public.compras FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "dono_delete" ON public.compras FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "dono_select" ON public.compra_itens FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "dono_insert" ON public.compra_itens FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "dono_update" ON public.compra_itens FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "dono_delete" ON public.compra_itens FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.validar_compra_item() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE i public.insumos;
DECLARE c public.compras;
BEGIN
  NEW.user_id := coalesce(NEW.user_id, auth.uid());
  IF NEW.user_id IS NULL THEN RAISE EXCEPTION 'Faça login para registrar compras.'; END IF;
  SELECT * INTO c FROM public.compras WHERE id = NEW.compra_id AND user_id = NEW.user_id FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Compra inválida.'; END IF;
  SELECT * INTO i FROM public.insumos WHERE id = NEW.insumo_id AND user_id = NEW.user_id FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Insumo inválido.'; END IF;
  IF NEW.quantidade IS NULL OR NEW.quantidade <= 0 OR NEW.quantidade::text IN ('NaN','Infinity','-Infinity') THEN RAISE EXCEPTION 'Informe uma quantidade maior que zero.'; END IF;
  IF NEW.preco_unitario IS NULL OR NEW.preco_unitario < 0 OR NEW.preco_unitario::text IN ('NaN','Infinity','-Infinity') THEN RAISE EXCEPTION 'Informe um preço válido.'; END IF;
  IF public.medida_base(NEW.unidade) IS NULL OR public.medida_base(NEW.unidade) IS DISTINCT FROM public.medida_base(coalesce(i.unidade_embalagem, i.unidade)) THEN RAISE EXCEPTION 'Unidade incompatível com o insumo: use a mesma medida da embalagem.'; END IF;
  NEW.total := NEW.quantidade * NEW.preco_unitario;
  RETURN NEW;
END $$;

CREATE TRIGGER compra_item_validar BEFORE INSERT OR UPDATE ON public.compra_itens FOR EACH ROW EXECUTE FUNCTION public.validar_compra_item();

CREATE OR REPLACE FUNCTION public.recalc_compra_total() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE alvo uuid := coalesce(NEW.compra_id, OLD.compra_id);
BEGIN
  UPDATE public.compras SET total = coalesce((SELECT sum(total) FROM public.compra_itens WHERE compra_id = alvo), 0) WHERE id = alvo;
  RETURN coalesce(NEW, OLD);
END $$;

CREATE TRIGGER compra_total_recalc AFTER INSERT OR UPDATE OR DELETE ON public.compra_itens FOR EACH ROW EXECUTE FUNCTION public.recalc_compra_total();

CREATE INDEX ON public.compras (user_id, data_compra);
CREATE INDEX ON public.compra_itens (compra_id);
CREATE INDEX ON public.compra_itens (insumo_id);