-- Produtos ocultos: o dono pode esconder um produto da lista "Produtos e receitas"
-- sem inativá-lo nem excluí-lo. Só muda a tela de produtos do sistema; não altera
-- pedidos, catálogo, estoque nem custos. Idempotente.
BEGIN;

ALTER TABLE public.produtos ADD COLUMN IF NOT EXISTS oculto boolean NOT NULL DEFAULT false;
COMMENT ON COLUMN public.produtos.oculto IS
  'Esconde o produto da lista Produtos e receitas (botão "Mostrar ocultos" exibe de novo).';

COMMIT;
