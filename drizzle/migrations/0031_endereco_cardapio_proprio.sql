ALTER TABLE public.confeitarias ADD COLUMN endereco_cardapio text;
ALTER TABLE public.confeitarias ADD CONSTRAINT confeitarias_endereco_cardapio_https CHECK (endereco_cardapio IS NULL OR (length(endereco_cardapio) <= 2048 AND endereco_cardapio ~ '^https://[A-Za-z0-9][A-Za-z0-9.-]*(:[0-9]+)?([/?#][^[:space:]]*)?$'));
GRANT INSERT (endereco_cardapio), UPDATE (endereco_cardapio) ON public.confeitarias TO authenticated;
COMMENT ON COLUMN public.confeitarias.endereco_cardapio IS 'Site próprio opcional para links de compartilhamento; NULL mantém o catálogo interno.';
UPDATE public.confeitarias SET endereco_cardapio = 'https://ocasaldobolo.netlify.app' WHERE slug = 'casaldobolo-catalogo';
CREATE FUNCTION public.endereco_cardapio_publico(p_slug text) RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT c.endereco_cardapio FROM public.confeitarias c
  WHERE c.slug = p_slug AND c.slug = 'casaldobolo-catalogo'
  LIMIT 1;
$$;
ALTER FUNCTION public.endereco_cardapio_publico(text) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.endereco_cardapio_publico(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.endereco_cardapio_publico(text) TO anon, authenticated, service_role;