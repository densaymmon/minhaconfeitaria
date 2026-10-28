-- Salvar um produto sem mudar a receita não pode mais ser bloqueado pela trava de produção.
--
-- Problema: salvar_produto apagava todas as linhas de receita_itens e as inseria de novo a cada
-- salvamento, mesmo quando a receita não tinha sido editada. O gatilho
-- bloquear_receita_com_producao_ativa roda em cada INSERT/UPDATE/DELETE e não compara valores,
-- então qualquer produto com pedido em aberto e produção registrada falhava ao salvar (inclusive
-- ao mudar só nome, preço, fotos ou catálogo).
--
-- Correção: salvar_produto compara a receita enviada com a gravada (ingrediente, quantidade
-- utilizada e unidade; `quantidade` é derivada pelo gatilho validar_consumo_receita) e só
-- reescreve receita_itens quando algo realmente mudou. Mudanças reais continuam bloqueadas pela
-- regra de estoque, que não foi alterada.
--
-- Também corrige o texto do erro: estornar a produção NÃO libera a edição (os eventos de
-- produção permanecem, e o teste recipe-edit-smoke.sql garante esse bloqueio); só finalizar ou
-- cancelar o pedido libera.

CREATE OR REPLACE FUNCTION public.salvar_produto(payload jsonb, itens jsonb, registro_id uuid DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER SET search_path = public
AS $function$
DECLARE r public.produtos; rid uuid; item jsonb; receita_mudou boolean;
BEGIN
 IF public._tenant() IS NULL THEN RAISE EXCEPTION 'Acesso não autorizado'; END IF;
 IF jsonb_typeof(itens) IS DISTINCT FROM 'array' OR jsonb_array_length(itens)>100 THEN RAISE EXCEPTION 'Receita inválida'; END IF;
 r:=jsonb_populate_record(NULL::public.produtos,payload);
 IF registro_id IS NULL THEN
 INSERT INTO public.produtos(nome,categoria,rendimento,custo_gas,custo_energia,custo_mao_obra,preco_venda,margem_desejada,modo_preparo,ativo) VALUES(r.nome,r.categoria,r.rendimento,r.custo_gas,r.custo_energia,r.custo_mao_obra,r.preco_venda,r.margem_desejada,r.modo_preparo,r.ativo) RETURNING id INTO rid;
 ELSE
 UPDATE public.produtos SET nome=r.nome,categoria=r.categoria,rendimento=r.rendimento,custo_gas=r.custo_gas,custo_energia=r.custo_energia,custo_mao_obra=r.custo_mao_obra,preco_venda=r.preco_venda,margem_desejada=r.margem_desejada,modo_preparo=r.modo_preparo,ativo=r.ativo WHERE id=registro_id RETURNING id INTO rid;
 IF rid IS NULL THEN RAISE EXCEPTION 'Produto não encontrado'; END IF;

 -- Compara como multiconjunto (EXCEPT ALL nos dois sentidos); 12 e 12.0 são iguais. Mesma regra do
 -- gatilho validar_consumo_receita: quantidade utilizada = coalesce(quantidade_utilizada, quantidade).
 -- Se algo vier fora do padrão (unidade nula, item inválido), conta como mudança e segue o caminho
 -- antigo, que valida e grava normalmente.
 WITH enviada AS (
   SELECT (v->>'insumo_id')::uuid AS insumo_id,
          coalesce((v->>'quantidade_utilizada')::numeric,(v->>'quantidade')::numeric) AS qtd,
          v->>'unidade_receita' AS unidade
   FROM jsonb_array_elements(itens) AS v
 ), gravada AS (
   SELECT ri.insumo_id, coalesce(ri.quantidade_utilizada, ri.quantidade) AS qtd, ri.unidade_receita AS unidade
   FROM public.receita_itens ri WHERE ri.produto_id = rid
 )
 SELECT EXISTS (
   (SELECT * FROM enviada EXCEPT ALL SELECT * FROM gravada)
   UNION ALL
   (SELECT * FROM gravada EXCEPT ALL SELECT * FROM enviada)
 ) INTO receita_mudou;
 IF NOT receita_mudou THEN RETURN rid; END IF;

 DELETE FROM public.receita_itens WHERE produto_id=rid;
 END IF;
 FOR item IN SELECT value FROM jsonb_array_elements(itens) LOOP
 INSERT INTO public.receita_itens(produto_id,insumo_id,quantidade,quantidade_utilizada,unidade_receita) VALUES(rid,(item->>'insumo_id')::uuid,coalesce((item->>'quantidade')::numeric,(item->>'quantidade_utilizada')::numeric),(item->>'quantidade_utilizada')::numeric,item->>'unidade_receita');
 END LOOP;
 RETURN rid;
END $function$;

CREATE OR REPLACE FUNCTION public.bloquear_receita_com_producao_ativa()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER
SET search_path = pg_catalog, public
AS $function$
DECLARE produto_lock uuid;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    FOR produto_lock IN
      SELECT p.id FROM public.produtos p
      WHERE (p.id = OLD.produto_id AND p.user_id = OLD.user_id)
         OR (p.id = NEW.produto_id AND p.user_id = NEW.user_id)
      ORDER BY p.id FOR UPDATE
    LOOP NULL; END LOOP;
  ELSIF TG_OP = 'DELETE' THEN
    PERFORM 1 FROM public.produtos p WHERE p.id = OLD.produto_id AND p.user_id = OLD.user_id FOR UPDATE;
  ELSE
    PERFORM 1 FROM public.produtos p WHERE p.id = NEW.produto_id AND p.user_id = NEW.user_id FOR UPDATE;
  END IF;

  IF TG_OP <> 'INSERT' AND OLD.produto_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.pedido_itens pi
    JOIN public.pedidos p ON p.id = pi.pedido_id AND p.user_id = pi.user_id
    WHERE pi.user_id = OLD.user_id AND pi.produto_id = OLD.produto_id
      AND (coalesce(pi.quantidade_produzida, 0) > 0 OR EXISTS (SELECT 1 FROM public.producao_eventos pe WHERE pe.pedido_item_id = pi.id))
      AND lower(trim(coalesce(p.status, ''))) NOT IN ('entregue','finalizado','cancelado','perdido')
  ) THEN
    RAISE EXCEPTION 'Não é possível alterar os ingredientes da receita enquanto houver pedido em aberto com produção iniciada para este produto. Mesmo estornada, a produção mantém a receita bloqueada. Finalize ou cancele o pedido antes de editar.';
  END IF;

  IF TG_OP <> 'DELETE' AND NEW.produto_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.pedido_itens pi
    JOIN public.pedidos p ON p.id = pi.pedido_id AND p.user_id = pi.user_id
    WHERE pi.user_id = NEW.user_id AND pi.produto_id = NEW.produto_id
      AND (coalesce(pi.quantidade_produzida, 0) > 0 OR EXISTS (SELECT 1 FROM public.producao_eventos pe WHERE pe.pedido_item_id = pi.id))
      AND lower(trim(coalesce(p.status, ''))) NOT IN ('entregue','finalizado','cancelado','perdido')
  ) THEN
    RAISE EXCEPTION 'Não é possível alterar os ingredientes da receita enquanto houver pedido em aberto com produção iniciada para este produto. Mesmo estornada, a produção mantém a receita bloqueada. Finalize ou cancele o pedido antes de editar.';
  END IF;

  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.bloquear_rendimento_com_producao_ativa()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER
SET search_path = pg_catalog, public
AS $function$
BEGIN
  IF NEW.rendimento IS DISTINCT FROM OLD.rendimento AND EXISTS (
    SELECT 1 FROM public.pedido_itens pi
    JOIN public.pedidos p ON p.id = pi.pedido_id AND p.user_id = pi.user_id
    WHERE pi.user_id = NEW.user_id AND pi.produto_id = OLD.id
      AND (coalesce(pi.quantidade_produzida, 0) > 0 OR EXISTS (SELECT 1 FROM public.producao_eventos pe WHERE pe.pedido_item_id = pi.id))
      AND lower(trim(coalesce(p.status, ''))) NOT IN ('entregue','finalizado','cancelado','perdido')
  ) THEN
    RAISE EXCEPTION 'Não é possível alterar o rendimento enquanto houver pedido em aberto com produção iniciada para este produto. Mesmo estornada, a produção mantém a receita bloqueada. Finalize ou cancele o pedido antes de editar.';
  END IF;
  RETURN NEW;
END;
$function$;

COMMENT ON FUNCTION public.salvar_produto(jsonb, jsonb, uuid) IS
  'Saves a product and its recipe atomically; recipe rows are rewritten only when the submitted recipe differs from the stored one.';
NOTIFY pgrst, 'reload schema';
