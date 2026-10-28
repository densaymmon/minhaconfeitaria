-- Pix copia e cola e aviso de pedido pronto.
--   * configuracoes.pix_tipo: tipo da chave Pix quando a detecção automática não basta (ex.: 11 dígitos).
--   * confeitarias.cidade: cidade do recebedor, exigida no código Pix (BR Code).
--   * pedidos.aviso_pronto_enviado_em: quando a confeitaria avisou o cliente que o pedido ficou pronto.
--   * acompanhar_pedido_catalogo passa a devolver o tipo da chave e a cidade, para a página do pedido
--     montar o Pix copia e cola com o valor.
-- Não altera dados existentes. Idempotente.

BEGIN;

ALTER TABLE public.configuracoes ADD COLUMN IF NOT EXISTS pix_tipo text;
ALTER TABLE public.configuracoes DROP CONSTRAINT IF EXISTS configuracao_pix_tipo_valido;
ALTER TABLE public.configuracoes ADD CONSTRAINT configuracao_pix_tipo_valido
  CHECK (pix_tipo IS NULL OR pix_tipo IN ('cpf', 'cnpj', 'telefone', 'email', 'aleatoria'));

ALTER TABLE public.confeitarias ADD COLUMN IF NOT EXISTS cidade text;
ALTER TABLE public.confeitarias DROP CONSTRAINT IF EXISTS confeitaria_cidade_valida;
ALTER TABLE public.confeitarias ADD CONSTRAINT confeitaria_cidade_valida
  CHECK (cidade IS NULL OR char_length(cidade) <= 60);

ALTER TABLE public.pedidos ADD COLUMN IF NOT EXISTS aviso_pronto_enviado_em timestamptz;

CREATE OR REPLACE FUNCTION public.acompanhar_pedido_catalogo(p_codigo uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  p public.pedidos%ROWTYPE;
  c public.confeitarias%ROWTYPE;
  v_subtotal numeric(12,2);
  v_total numeric(12,2);
  v_pago numeric(12,2);
  v_pix text;
  v_pix_tipo text;
  v_cliente text;
BEGIN
  SELECT * INTO p FROM public.pedidos WHERE codigo_publico = p_codigo AND origem = 'catalogo';
  IF NOT FOUND THEN RETURN NULL; END IF;
  SELECT * INTO c FROM public.confeitarias WHERE user_id = p.user_id;
  SELECT pix_chave, pix_tipo INTO v_pix, v_pix_tipo FROM public.configuracoes WHERE user_id = p.user_id;
  SELECT split_part(nome, ' ', 1) INTO v_cliente FROM public.clientes WHERE id = p.cliente_id AND user_id = p.user_id;

  SELECT coalesce(sum(quantidade * preco_unitario), 0) INTO v_subtotal
  FROM public.pedido_itens WHERE pedido_id = p.id AND user_id = p.user_id;
  v_total := greatest(0, v_subtotal + coalesce(p.taxa_entrega, 0) - coalesce(p.desconto, 0));
  SELECT least(v_total, greatest(
    coalesce(p.valor_entrada, 0),
    coalesce((SELECT sum(valor) FROM public.pedido_pagamentos WHERE pedido_id = p.id AND user_id = p.user_id), 0),
    CASE WHEN p.saldo_quitado THEN v_total ELSE 0 END
  )) INTO v_pago;

  RETURN jsonb_build_object(
    'numero', p.numero,
    'status', p.status,
    'cliente', v_cliente,
    'data_entrega', p.data_entrega,
    'hora_entrega', p.hora_entrega,
    'tipo_entrega', p.tipo_entrega,
    'endereco_entrega', p.endereco_entrega,
    'subtotal', v_subtotal,
    'taxa_entrega', p.taxa_entrega,
    'desconto', p.desconto,
    'total', v_total,
    'pago', v_pago,
    'pagamento_informado', p.pagamento_informado_em IS NOT NULL,
    'criado_em', p.created_at,
    'itens', coalesce((
      SELECT jsonb_agg(jsonb_build_object('descricao', descricao, 'quantidade', quantidade, 'preco', preco_unitario) ORDER BY descricao)
      FROM public.pedido_itens WHERE pedido_id = p.id AND user_id = p.user_id
    ), '[]'::jsonb),
    'confeitaria', jsonb_build_object(
      'nome', c.nome,
      'whatsapp', c.whatsapp,
      'slug', c.slug,
      'endereco_retirada', c.endereco_retirada,
      'pix_chave', nullif(btrim(coalesce(v_pix, '')), ''),
      'pix_tipo', v_pix_tipo,
      'cidade', c.cidade
    )
  );
END;
$function$;

NOTIFY pgrst, 'reload schema';

COMMIT;
