-- Base multiempresa (Etapa 2 do docs/plano-evolucao.md).
--
-- Modelo: cada conta de proprietária é uma confeitaria (tenant = user_id).
-- O isolamento entre confeitarias já é garantido pelas políticas RLS por
-- user_id em todas as tabelas e pelas RPCs, que filtram por auth.uid().
-- Esta migração:
--   1. cria o cadastro da confeitaria (nome, slogan, WhatsApp, endereço do catálogo);
--   2. cria a confeitaria das contas existentes, preservando a marca atual;
--   3. troca o bloqueio de "proprietária única" por um controle de cadastro
--      (plataforma_config.cadastro_aberto), fechado por padrão;
--   4. cria a confeitaria automaticamente a cada novo cadastro.
-- Não altera pedidos, itens, pagamentos, compras, estoque nem configurações.
-- Idempotente: pode ser executada mais de uma vez.

BEGIN;

-- 1. Cadastro da confeitaria ------------------------------------------------
CREATE TABLE IF NOT EXISTS public.confeitarias (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  nome text NOT NULL DEFAULT 'Minha confeitaria'
    CHECK (char_length(btrim(nome)) BETWEEN 1 AND 80),
  slogan text CHECK (slogan IS NULL OR char_length(slogan) <= 120),
  whatsapp text CHECK (whatsapp IS NULL OR char_length(whatsapp) <= 30),
  -- Endereço público do catálogo (/c/<slug>), usado na próxima etapa.
  slug text UNIQUE
    CHECK (slug IS NULL OR (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' AND char_length(slug) BETWEEN 3 AND 60)),
  logo_url text CHECK (logo_url IS NULL OR char_length(logo_url) <= 500),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS trg_confeitarias_upd ON public.confeitarias;
CREATE TRIGGER trg_confeitarias_upd BEFORE UPDATE ON public.confeitarias
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.confeitarias ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.confeitarias FROM anon;
GRANT SELECT, INSERT, UPDATE ON public.confeitarias TO authenticated;
GRANT ALL ON public.confeitarias TO service_role;

DROP POLICY IF EXISTS confeitarias_dono_select ON public.confeitarias;
CREATE POLICY confeitarias_dono_select ON public.confeitarias
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS confeitarias_dono_insert ON public.confeitarias;
CREATE POLICY confeitarias_dono_insert ON public.confeitarias
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS confeitarias_dono_update ON public.confeitarias;
CREATE POLICY confeitarias_dono_update ON public.confeitarias
  FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- 2. Confeitaria das contas existentes, com a marca usada hoje nos recibos ----
INSERT INTO public.confeitarias (user_id, nome, slogan)
SELECT u.id, 'O Casal do Bolo', 'Amor em cada pedaço'
FROM auth.users u
ON CONFLICT (user_id) DO NOTHING;

-- 3. Controle de cadastro da plataforma -------------------------------------
-- Uma única linha. Sem políticas: só administradores (service_role/SQL) alteram.
CREATE TABLE IF NOT EXISTS public.plataforma_config (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  cadastro_aberto boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.plataforma_config (id) VALUES (true) ON CONFLICT (id) DO NOTHING;
ALTER TABLE public.plataforma_config ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.plataforma_config FROM anon, authenticated;
GRANT ALL ON public.plataforma_config TO service_role;

-- 4. Novo cadastro = nova confeitaria ----------------------------------------
CREATE OR REPLACE FUNCTION public.criar_confeitaria_novo_usuario()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_aberto boolean;
BEGIN
  -- Serializa cadastros simultâneos para a regra da primeira conta valer.
  PERFORM pg_advisory_xact_lock(hashtextextended('cadastro_confeitaria', 0));

  SELECT cadastro_aberto INTO v_aberto FROM public.plataforma_config WHERE id;

  -- A primeira conta de uma instalação nova sempre pode ser criada.
  IF NOT coalesce(v_aberto, false)
     AND EXISTS (SELECT 1 FROM public.confeitarias c WHERE c.user_id <> NEW.id) THEN
    RAISE EXCEPTION 'CADASTRO_FECHADO: o cadastro de novas confeitarias está fechado.';
  END IF;

  INSERT INTO public.confeitarias (user_id) VALUES (NEW.id)
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.criar_confeitaria_novo_usuario() FROM PUBLIC, anon, authenticated;

-- Remove o bloqueio de proprietária única. A tabela owner_claim é mantida
-- intacta apenas como histórico; nada mais a consulta.
DROP TRIGGER IF EXISTS trg_proprietario_unico ON auth.users;
DROP TRIGGER IF EXISTS release_owner_claim ON auth.users;

DROP TRIGGER IF EXISTS trg_criar_confeitaria ON auth.users;
CREATE TRIGGER trg_criar_confeitaria AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.criar_confeitaria_novo_usuario();

COMMIT;
