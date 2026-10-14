-- Contas a pagar: obrigações, vencimentos e pagamentos registrados separadamente das despesas.
-- Não cria despesas automaticamente; evita contabilizar uma mesma conta duas vezes.
CREATE TABLE public.contas_pagar (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid(),
  compra_id uuid REFERENCES public.compras(id) ON DELETE SET NULL,
  descricao text NOT NULL CHECK (length(trim(descricao)) BETWEEN 1 AND 200),
  fornecedor text,
  data_emissao date NOT NULL DEFAULT current_date,
  data_vencimento date NOT NULL DEFAULT current_date,
  valor numeric(12,2) NOT NULL CHECK (valor >= 0),
  valor_pago numeric(12,2) NOT NULL DEFAULT 0 CHECK (valor_pago >= 0 AND valor_pago <= valor),
  data_pagamento date,
  forma_pagamento text,
  status text NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente','parcial','pago','cancelado')),
  observacoes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX contas_pagar_user_vencimento_idx
  ON public.contas_pagar(user_id, data_vencimento);
CREATE INDEX contas_pagar_user_status_idx
  ON public.contas_pagar(user_id, status);

ALTER TABLE public.contas_pagar ENABLE ROW LEVEL SECURITY;
CREATE POLICY contas_pagar_dono_select ON public.contas_pagar
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY contas_pagar_dono_insert ON public.contas_pagar
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY contas_pagar_dono_update ON public.contas_pagar
  FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY contas_pagar_dono_delete ON public.contas_pagar
  FOR DELETE TO authenticated USING (auth.uid() = user_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.contas_pagar TO authenticated;
GRANT ALL ON public.contas_pagar TO service_role;

CREATE OR REPLACE FUNCTION public.validar_conta_pagar()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $function$
BEGIN
  IF NEW.user_id IS NULL THEN
    NEW.user_id := auth.uid();
  END IF;
  IF NEW.user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Não é permitido registrar contas de outro usuário.';
  END IF;
  IF NEW.descricao IS NULL OR length(trim(NEW.descricao)) = 0 THEN
    RAISE EXCEPTION 'Informe a descrição da conta.';
  END IF;
  IF NEW.valor IS NULL OR NEW.valor < 0 OR NEW.valor::text IN ('NaN','Infinity','-Infinity')
     OR NEW.valor_pago IS NULL OR NEW.valor_pago < 0 OR NEW.valor_pago > NEW.valor
     OR NEW.valor_pago::text IN ('NaN','Infinity','-Infinity') THEN
    RAISE EXCEPTION 'Confira o valor da conta e o valor já pago.';
  END IF;

  IF NEW.status = 'cancelado' THEN
    IF NEW.valor_pago > 0 THEN
      RAISE EXCEPTION 'Uma conta com pagamento registrado não pode ser cancelada; ajuste o pagamento primeiro.';
    END IF;
    NEW.data_pagamento := NULL;
  ELSIF NEW.valor > 0 AND NEW.valor_pago >= NEW.valor THEN
    NEW.status := 'pago';
    NEW.data_pagamento := coalesce(NEW.data_pagamento, current_date);
  ELSIF NEW.valor_pago > 0 THEN
    NEW.status := 'parcial';
    NEW.data_pagamento := coalesce(NEW.data_pagamento, current_date);
  ELSE
    NEW.status := 'pendente';
    NEW.data_pagamento := NULL;
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END;
$function$;

CREATE TRIGGER contas_pagar_validar
BEFORE INSERT OR UPDATE ON public.contas_pagar
FOR EACH ROW EXECUTE FUNCTION public.validar_conta_pagar();

REVOKE ALL ON FUNCTION public.validar_conta_pagar() FROM PUBLIC, anon;
