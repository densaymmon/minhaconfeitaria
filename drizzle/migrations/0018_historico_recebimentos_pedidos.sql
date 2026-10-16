-- Histórico de recebimentos por pedido, com validação transacional do saldo.
CREATE TABLE IF NOT EXISTS public.pedido_pagamentos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pedido_id uuid NOT NULL REFERENCES public.pedidos(id) ON DELETE CASCADE,
  user_id uuid NOT NULL DEFAULT auth.uid(),
  valor numeric(12,2) NOT NULL CHECK (valor > 0),
  data_pagamento date NOT NULL DEFAULT current_date,
  forma_pagamento text NOT NULL CHECK (forma_pagamento IN ('pix','dinheiro','debito','credito','transferencia','outros')),
  observacoes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pedido_pagamentos_id_pedido_user_unique UNIQUE (id, pedido_id, user_id)
);

CREATE INDEX IF NOT EXISTS pedido_pagamentos_user_data_idx
  ON public.pedido_pagamentos (user_id, data_pagamento);
CREATE INDEX IF NOT EXISTS pedido_pagamentos_pedido_idx
  ON public.pedido_pagamentos (pedido_id, user_id);

ALTER TABLE public.pedido_pagamentos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS pedido_pagamentos_dono_select ON public.pedido_pagamentos;
CREATE POLICY pedido_pagamentos_dono_select
  ON public.pedido_pagamentos FOR SELECT TO authenticated
  USING (auth.uid() = user_id);
REVOKE ALL ON TABLE public.pedido_pagamentos FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.pedido_pagamentos TO authenticated;
GRANT ALL ON TABLE public.pedido_pagamentos TO service_role;

CREATE OR REPLACE FUNCTION public.registrar_recebimento_pedido(
  p_pedido_id uuid,
  p_valor numeric,
  p_data_pagamento date,
  p_forma_pagamento text,
  p_observacoes text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  uid uuid := auth.uid();
  pedido public.pedidos%ROWTYPE;
  total_pedido numeric(12,2);
  valor_ja_pago numeric(12,2);
  novo_id uuid;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'Acesso não autorizado.';
  END IF;
  IF p_pedido_id IS NULL OR p_valor IS NULL OR p_valor <= 0
     OR p_valor::text IN ('NaN', 'Infinity', '-Infinity') THEN
    RAISE EXCEPTION 'Informe um valor de recebimento válido.';
  END IF;
  IF p_data_pagamento IS NULL OR p_data_pagamento > CURRENT_DATE THEN
    RAISE EXCEPTION 'A data do recebimento é inválida.';
  END IF;
  IF p_forma_pagamento NOT IN ('pix','dinheiro','debito','credito','transferencia','outros') THEN
    RAISE EXCEPTION 'Selecione uma forma de pagamento válida.';
  END IF;

  SELECT * INTO pedido
  FROM public.pedidos p
  WHERE p.id = p_pedido_id AND p.user_id = uid
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pedido não encontrado ou sem permissão.';
  END IF;
  IF pedido.status = 'cancelado' THEN
    RAISE EXCEPTION 'Não é possível registrar recebimento em pedido cancelado.';
  END IF;

  SELECT GREATEST(0, ROUND(
    COALESCE(SUM(pi.quantidade * pi.preco_unitario), 0)
    + COALESCE(pedido.taxa_entrega, 0)
    - COALESCE(pedido.desconto, 0), 2
  )) INTO total_pedido
  FROM public.pedido_itens pi
  WHERE pi.pedido_id = pedido.id AND pi.user_id = uid;

  -- Compatível com o campo de valor pago já usado no cadastro antigo.
  -- Novos registros atualizam esse campo e mantêm o detalhamento individual.
  valor_ja_pago := CASE WHEN pedido.saldo_quitado THEN total_pedido
                        ELSE GREATEST(0, COALESCE(pedido.valor_entrada, 0)) END;
  IF ROUND(p_valor, 2) > GREATEST(0, total_pedido - valor_ja_pago) THEN
    RAISE EXCEPTION 'O recebimento excede o saldo do pedido. Saldo disponível: %.', GREATEST(0, total_pedido - valor_ja_pago);
  END IF;

  INSERT INTO public.pedido_pagamentos (
    pedido_id, user_id, valor, data_pagamento, forma_pagamento, observacoes
  ) VALUES (
    pedido.id, uid, ROUND(p_valor, 2), p_data_pagamento,
    p_forma_pagamento, NULLIF(btrim(p_observacoes), '')
  ) RETURNING id INTO novo_id;

  UPDATE public.pedidos
  SET valor_entrada = LEAST(total_pedido, valor_ja_pago + ROUND(p_valor, 2)),
      saldo_quitado = (valor_ja_pago + ROUND(p_valor, 2) >= total_pedido)
  WHERE id = pedido.id AND user_id = uid;

  RETURN novo_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.registrar_recebimento_pedido(uuid, numeric, date, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.registrar_recebimento_pedido(uuid, numeric, date, text, text) TO authenticated, service_role;

COMMENT ON TABLE public.pedido_pagamentos IS
  'Histórico detalhado dos recebimentos registrados para pedidos; não presume datas para pagamentos legados.';
