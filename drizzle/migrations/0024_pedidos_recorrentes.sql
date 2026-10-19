-- Pedidos recorrentes: preparar cada ocorrência e só criar pedido normal após confirmação explícita.
-- Esta migração é aditiva: não modifica pedidos, produção, estoque ou pagamentos existentes.

CREATE TABLE IF NOT EXISTS public.pedidos_recorrentes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid(),
  cliente_id uuid NOT NULL REFERENCES public.clientes(id) ON DELETE RESTRICT,
  frequencia text NOT NULL CHECK (frequencia IN ('semanal','quinzenal','mensal')),
  data_inicio date NOT NULL,
  data_fim date,
  hora_entrega text,
  observacoes text,
  ativa boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (data_fim IS NULL OR data_fim >= data_inicio)
);

CREATE TABLE IF NOT EXISTS public.pedidos_recorrentes_ocorrencias (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid(),
  recorrencia_id uuid NOT NULL REFERENCES public.pedidos_recorrentes(id) ON DELETE RESTRICT,
  data_entrega date NOT NULL,
  status text NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente','confirmada','cancelada')),
  itens jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(itens) = 'array'),
  pedido_id uuid UNIQUE REFERENCES public.pedidos(id) ON DELETE RESTRICT,
  observacoes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((status = 'confirmada') = (pedido_id IS NOT NULL))
);

CREATE INDEX IF NOT EXISTS pedidos_recorrentes_user_ativa_idx
  ON public.pedidos_recorrentes (user_id, ativa, data_inicio);
CREATE INDEX IF NOT EXISTS pedidos_recorrentes_ocorrencias_user_data_idx
  ON public.pedidos_recorrentes_ocorrencias (user_id, data_entrega, status);
CREATE UNIQUE INDEX IF NOT EXISTS pedidos_recorrentes_ocorrencia_data_unique
  ON public.pedidos_recorrentes_ocorrencias (recorrencia_id, data_entrega);

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['pedidos_recorrentes','pedidos_recorrentes_ocorrencias'] LOOP
    EXECUTE format('GRANT SELECT, INSERT, UPDATE ON public.%I TO authenticated', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS "dono_select" ON public.%I', t);
    EXECUTE format('DROP POLICY IF EXISTS "dono_insert" ON public.%I', t);
    EXECUTE format('DROP POLICY IF EXISTS "dono_update" ON public.%I', t);
    EXECUTE format('CREATE POLICY "dono_select" ON public.%I FOR SELECT TO authenticated USING (auth.uid() = user_id)', t);
    EXECUTE format('CREATE POLICY "dono_insert" ON public.%I FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id)', t);
    EXECUTE format('CREATE POLICY "dono_update" ON public.%I FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id)', t);
  END LOOP;
END $$;

-- A tela pode editar os itens de uma ocorrência pendente, mas não pode forjar
-- status/pedido_id nem marcar uma ocorrência como confirmada diretamente.
REVOKE INSERT, UPDATE ON public.pedidos_recorrentes_ocorrencias FROM authenticated;
GRANT INSERT (recorrencia_id, data_entrega, itens, observacoes)
  ON public.pedidos_recorrentes_ocorrencias TO authenticated;
GRANT UPDATE (itens, observacoes)
  ON public.pedidos_recorrentes_ocorrencias TO authenticated;

CREATE OR REPLACE FUNCTION public.atualizar_pedido_recorrente_ocorrencia()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog, public AS $$
DECLARE dono_recorrencia uuid;
BEGIN
  IF TG_TABLE_NAME = 'pedidos_recorrentes' THEN
    NEW.updated_at := now();
    IF NOT EXISTS (
      SELECT 1 FROM public.clientes c
      WHERE c.id = NEW.cliente_id AND c.user_id = NEW.user_id
    ) THEN
      RAISE EXCEPTION 'Cliente não encontrado para esta conta.';
    END IF;
    RETURN NEW;
  END IF;

  NEW.updated_at := now();
  SELECT r.user_id INTO dono_recorrencia
  FROM public.pedidos_recorrentes r
  WHERE r.id = NEW.recorrencia_id;
  IF dono_recorrencia IS NULL OR dono_recorrencia <> NEW.user_id THEN
    RAISE EXCEPTION 'Recorrência não encontrada para esta conta.';
  END IF;
  IF TG_OP <> 'INSERT' AND OLD.pedido_id IS NOT NULL AND
     (NEW.pedido_id IS DISTINCT FROM OLD.pedido_id OR NEW.itens IS DISTINCT FROM OLD.itens OR NEW.data_entrega IS DISTINCT FROM OLD.data_entrega) THEN
    RAISE EXCEPTION 'Uma ocorrência já convertida em pedido não pode ser alterada por este fluxo.';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_pedidos_recorrentes_updated_at ON public.pedidos_recorrentes;
CREATE TRIGGER trg_pedidos_recorrentes_updated_at
BEFORE INSERT OR UPDATE ON public.pedidos_recorrentes
FOR EACH ROW EXECUTE FUNCTION public.atualizar_pedido_recorrente_ocorrencia();

DROP TRIGGER IF EXISTS trg_pedidos_recorrentes_ocorrencias_updated_at ON public.pedidos_recorrentes_ocorrencias;
CREATE TRIGGER trg_pedidos_recorrentes_ocorrencias_updated_at
BEFORE INSERT OR UPDATE ON public.pedidos_recorrentes_ocorrencias
FOR EACH ROW EXECUTE FUNCTION public.atualizar_pedido_recorrente_ocorrencia();

CREATE OR REPLACE FUNCTION public.confirmar_ocorrencia_recorrente(
  p_ocorrencia_id uuid,
  p_payload jsonb,
  p_itens jsonb
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE
  ocorrencia public.pedidos_recorrentes_ocorrencias;
  recorrencia public.pedidos_recorrentes;
  novo_pedido_id uuid;
  payload_final jsonb;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Acesso não autorizado.'; END IF;
  IF jsonb_typeof(p_payload) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'Dados do pedido inválidos.';
  END IF;
  IF jsonb_typeof(p_itens) IS DISTINCT FROM 'array'
     OR jsonb_array_length(p_itens) NOT BETWEEN 1 AND 100 THEN
    RAISE EXCEPTION 'Adicione de 1 a 100 itens antes de confirmar.';
  END IF;

  SELECT * INTO ocorrencia
  FROM public.pedidos_recorrentes_ocorrencias
  WHERE id = p_ocorrencia_id AND user_id = auth.uid()
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Ocorrência não encontrada.'; END IF;
  IF ocorrencia.pedido_id IS NOT NULL OR ocorrencia.status = 'confirmada' THEN
    RAISE EXCEPTION 'Esta ocorrência já foi convertida em pedido.';
  END IF;
  IF ocorrencia.status <> 'pendente' THEN
    RAISE EXCEPTION 'Somente ocorrências pendentes podem ser confirmadas.';
  END IF;

  SELECT * INTO recorrencia
  FROM public.pedidos_recorrentes
  WHERE id = ocorrencia.recorrencia_id AND user_id = auth.uid()
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Recorrência não encontrada.'; END IF;

  payload_final := p_payload || jsonb_build_object(
    'cliente_id', recorrencia.cliente_id,
    'data_entrega', ocorrencia.data_entrega,
    'hora_entrega', recorrencia.hora_entrega,
    'observacoes', concat_ws(E'\n', nullif(recorrencia.observacoes, ''), nullif(ocorrencia.observacoes, '')),
    'status', 'recebido'
  );

  -- A criação do pedido e a vinculação da ocorrência ocorrem na mesma transação.
  -- O bloqueio FOR UPDATE impede duas confirmações concorrentes da mesma ocorrência.
  novo_pedido_id := public.salvar_pedido(payload_final, p_itens, NULL);

  UPDATE public.pedidos_recorrentes_ocorrencias
  SET pedido_id = novo_pedido_id, status = 'confirmada', itens = p_itens
  WHERE id = ocorrencia.id AND user_id = auth.uid() AND pedido_id IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'Não foi possível vincular o pedido à ocorrência.'; END IF;

  RETURN novo_pedido_id;
END $$;

REVOKE ALL ON FUNCTION public.confirmar_ocorrencia_recorrente(uuid,jsonb,jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.confirmar_ocorrencia_recorrente(uuid,jsonb,jsonb) TO authenticated, service_role;
NOTIFY pgrst, 'reload schema';
