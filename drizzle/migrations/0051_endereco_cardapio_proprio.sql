-- Endereço próprio do cardápio (site externo da confeitaria).
-- Quando preenchido, os botões "Copiar"/"Compartilhar"/QR Code usam esse endereço
-- e o link antigo do catálogo (/<slug> e /c/<slug>) redireciona para ele.
-- Não altera catalogo_publico, criar_pedido_catalogo nem o acompanhamento de pedidos.
-- Aplicada em produção em 14/11/2026 (pelo Lovable; o valor da confeitaria foi gravado
-- direto no banco, não nesta migração). Idempotente.
BEGIN;

ALTER TABLE public.confeitarias ADD COLUMN IF NOT EXISTS endereco_cardapio text;

DO $m$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                 WHERE conname = 'confeitarias_endereco_cardapio_https'
                   AND conrelid = 'public.confeitarias'::regclass) THEN
    ALTER TABLE public.confeitarias ADD CONSTRAINT confeitarias_endereco_cardapio_https
      CHECK (endereco_cardapio IS NULL OR (length(endereco_cardapio) <= 2048
        AND endereco_cardapio ~ '^https://[A-Za-z0-9][A-Za-z0-9.-]*(:[0-9]+)?([/?#][^[:space:]]*)?$'));
  END IF;
END $m$;

GRANT INSERT (endereco_cardapio), UPDATE (endereco_cardapio) ON public.confeitarias TO authenticated;
COMMENT ON COLUMN public.confeitarias.endereco_cardapio IS
  'Site próprio opcional do cardápio; NULL mantém o catálogo interno.';

-- Leitura pública só do endereço (o visitante anônimo não lê tabelas).
-- Vale para qualquer confeitaria com catálogo ativo e endereço preenchido.
CREATE OR REPLACE FUNCTION public.endereco_cardapio_publico(p_slug text)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT c.endereco_cardapio FROM public.confeitarias c
  WHERE c.slug = p_slug AND c.catalogo_ativo AND c.endereco_cardapio IS NOT NULL
  LIMIT 1;
$$;
REVOKE ALL ON FUNCTION public.endereco_cardapio_publico(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.endereco_cardapio_publico(text) TO anon, authenticated, service_role;

COMMIT;
