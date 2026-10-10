CREATE TABLE public.owner_claim (slot boolean PRIMARY KEY DEFAULT true CHECK(slot), user_id uuid NOT NULL UNIQUE);
GRANT ALL ON public.owner_claim TO service_role;
ALTER TABLE public.owner_claim ENABLE ROW LEVEL SECURITY;
INSERT INTO public.owner_claim(slot,user_id) SELECT true,id FROM auth.users ORDER BY created_at LIMIT 1;
CREATE OR REPLACE FUNCTION public.limitar_proprietario_unico() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ BEGIN INSERT INTO public.owner_claim(slot,user_id) VALUES(true,NEW.id); RETURN NEW; EXCEPTION WHEN unique_violation THEN RAISE EXCEPTION 'O sistema já possui um proprietário.'; END; $$;
CREATE OR REPLACE FUNCTION public.release_owner_claim() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ BEGIN DELETE FROM public.owner_claim WHERE user_id=OLD.id; RETURN OLD; END; $$;
CREATE TRIGGER release_owner_claim AFTER DELETE ON auth.users FOR EACH ROW EXECUTE FUNCTION public.release_owner_claim();
ALTER TABLE public.clientes ADD CONSTRAINT cliente_nome_valido CHECK(length(trim(nome)) BETWEEN 1 AND 120), ADD CONSTRAINT cliente_campos_validos CHECK(coalesce(length(telefone),0)<=30 AND coalesce(length(endereco),0)<=300 AND coalesce(length(observacoes),0)<=1000);
ALTER TABLE public.insumos ADD CONSTRAINT insumo_valido CHECK(length(trim(nome)) BETWEEN 1 AND 120 AND preco_unidade>=0 AND unidade IN ('kg','g','L','ml','un','dúzia','pacote') AND tipo IN ('ingrediente','embalagem'));
ALTER TABLE public.produtos ADD CONSTRAINT produto_valido CHECK(length(trim(nome)) BETWEEN 1 AND 200 AND rendimento>0 AND preco_venda>=0 AND custo_gas>=0 AND custo_energia>=0 AND custo_mao_obra>=0 AND margem_desejada>=0 AND coalesce(length(modo_preparo),0)<=5000);
ALTER TABLE public.pedidos ADD CONSTRAINT pedido_valido CHECK(valor_entrada>=0 AND desconto>=0 AND taxa_entrega>=0 AND coalesce(length(observacoes),0)<=2000 AND (hora_entrega IS NULL OR hora_entrega ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$') AND forma_pagamento IN ('pix','dinheiro','debito','credito','outros'));
ALTER TABLE public.pedido_itens ADD CONSTRAINT item_valido CHECK(quantidade>0 AND preco_unitario>=0 AND custo_unitario>=0 AND quantidade_produzida BETWEEN 0 AND quantidade AND length(trim(descricao)) BETWEEN 1 AND 300);
ALTER TABLE public.receita_itens ADD CONSTRAINT receita_valida CHECK(quantidade>0);
ALTER TABLE public.despesas ADD CONSTRAINT despesa_valida CHECK(valor>0 AND length(trim(descricao)) BETWEEN 1 AND 200);
ALTER TABLE public.configuracoes ADD CONSTRAINT taxas_validas CHECK(taxa_pix BETWEEN 0 AND 100 AND taxa_dinheiro BETWEEN 0 AND 100 AND taxa_debito BETWEEN 0 AND 100 AND taxa_credito BETWEEN 0 AND 100 AND taxa_outros BETWEEN 0 AND 100 AND imposto_pct BETWEEN 0 AND 100);
ALTER POLICY dono_insert ON public.pedidos WITH CHECK(auth.uid()=user_id AND (cliente_id IS NULL OR EXISTS(SELECT 1 FROM public.clientes c WHERE c.id=cliente_id AND c.user_id=auth.uid())));
ALTER POLICY dono_update ON public.pedidos WITH CHECK(auth.uid()=user_id AND (cliente_id IS NULL OR EXISTS(SELECT 1 FROM public.clientes c WHERE c.id=cliente_id AND c.user_id=auth.uid())));
ALTER POLICY dono_insert ON public.pedido_itens WITH CHECK(auth.uid()=user_id AND EXISTS(SELECT 1 FROM public.pedidos p WHERE p.id=pedido_id AND p.user_id=auth.uid()) AND (produto_id IS NULL OR EXISTS(SELECT 1 FROM public.produtos p WHERE p.id=produto_id AND p.user_id=auth.uid())));
ALTER POLICY dono_update ON public.pedido_itens WITH CHECK(auth.uid()=user_id AND EXISTS(SELECT 1 FROM public.pedidos p WHERE p.id=pedido_id AND p.user_id=auth.uid()) AND (produto_id IS NULL OR EXISTS(SELECT 1 FROM public.produtos p WHERE p.id=produto_id AND p.user_id=auth.uid())));
ALTER POLICY dono_insert ON public.receita_itens WITH CHECK(auth.uid()=user_id AND EXISTS(SELECT 1 FROM public.produtos p WHERE p.id=produto_id AND p.user_id=auth.uid()) AND EXISTS(SELECT 1 FROM public.insumos i WHERE i.id=insumo_id AND i.user_id=auth.uid()));
ALTER POLICY dono_update ON public.receita_itens WITH CHECK(auth.uid()=user_id AND EXISTS(SELECT 1 FROM public.produtos p WHERE p.id=produto_id AND p.user_id=auth.uid()) AND EXISTS(SELECT 1 FROM public.insumos i WHERE i.id=insumo_id AND i.user_id=auth.uid()));
CREATE OR REPLACE FUNCTION public.salvar_pedido(payload jsonb, itens jsonb, registro_id uuid DEFAULT NULL) RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE r public.pedidos; rid uuid; item jsonb;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Acesso não autorizado'; END IF;
 IF jsonb_typeof(itens)<>'array' OR jsonb_array_length(itens) NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'Adicione de 1 a 100 itens'; END IF;
 r:=jsonb_populate_record(NULL::public.pedidos,payload);
 IF registro_id IS NULL THEN
 INSERT INTO public.pedidos(cliente_id,data_entrega,hora_entrega,status,forma_pagamento,valor_entrada,saldo_quitado,desconto,taxa_entrega,observacoes) VALUES(r.cliente_id,r.data_entrega,r.hora_entrega,r.status,r.forma_pagamento,r.valor_entrada,r.saldo_quitado,r.desconto,r.taxa_entrega,r.observacoes) RETURNING id INTO rid;
 ELSE
 UPDATE public.pedidos SET cliente_id=r.cliente_id,data_entrega=r.data_entrega,hora_entrega=r.hora_entrega,status=r.status,forma_pagamento=r.forma_pagamento,valor_entrada=r.valor_entrada,saldo_quitado=r.saldo_quitado,desconto=r.desconto,taxa_entrega=r.taxa_entrega,observacoes=r.observacoes WHERE id=registro_id RETURNING id INTO rid;
 IF rid IS NULL THEN RAISE EXCEPTION 'Pedido não encontrado'; END IF;
 DELETE FROM public.pedido_itens WHERE pedido_id=rid;
 END IF;
 FOR item IN SELECT value FROM jsonb_array_elements(itens) LOOP
 INSERT INTO public.pedido_itens(pedido_id,produto_id,descricao,quantidade,preco_unitario,custo_unitario,quantidade_produzida) VALUES(rid,(item->>'produto_id')::uuid,item->>'descricao',(item->>'quantidade')::numeric,(item->>'preco_unitario')::numeric,(item->>'custo_unitario')::numeric,(item->>'quantidade_produzida')::numeric);
 END LOOP;
 RETURN rid;
END; $$;
REVOKE ALL ON FUNCTION public.salvar_pedido(jsonb,jsonb,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.salvar_pedido(jsonb,jsonb,uuid) TO authenticated,service_role;
CREATE OR REPLACE FUNCTION public.salvar_produto(payload jsonb, itens jsonb, registro_id uuid DEFAULT NULL) RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE r public.produtos; rid uuid; item jsonb;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Acesso não autorizado'; END IF;
 IF jsonb_typeof(itens)<>'array' OR jsonb_array_length(itens)>100 THEN RAISE EXCEPTION 'Receita inválida'; END IF;
 r:=jsonb_populate_record(NULL::public.produtos,payload);
 IF registro_id IS NULL THEN
 INSERT INTO public.produtos(nome,categoria,rendimento,custo_gas,custo_energia,custo_mao_obra,preco_venda,margem_desejada,modo_preparo,ativo) VALUES(r.nome,r.categoria,r.rendimento,r.custo_gas,r.custo_energia,r.custo_mao_obra,r.preco_venda,r.margem_desejada,r.modo_preparo,r.ativo) RETURNING id INTO rid;
 ELSE
 UPDATE public.produtos SET nome=r.nome,categoria=r.categoria,rendimento=r.rendimento,custo_gas=r.custo_gas,custo_energia=r.custo_energia,custo_mao_obra=r.custo_mao_obra,preco_venda=r.preco_venda,margem_desejada=r.margem_desejada,modo_preparo=r.modo_preparo,ativo=r.ativo WHERE id=registro_id RETURNING id INTO rid;
 IF rid IS NULL THEN RAISE EXCEPTION 'Produto não encontrado'; END IF;
 DELETE FROM public.receita_itens WHERE produto_id=rid;
 END IF;
 FOR item IN SELECT value FROM jsonb_array_elements(itens) LOOP
 INSERT INTO public.receita_itens(produto_id,insumo_id,quantidade) VALUES(rid,(item->>'insumo_id')::uuid,(item->>'quantidade')::numeric);
 END LOOP;
 RETURN rid;
END; $$;
REVOKE ALL ON FUNCTION public.salvar_produto(jsonb,jsonb,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.salvar_produto(jsonb,jsonb,uuid) TO authenticated,service_role;
GRANT USAGE, SELECT ON SEQUENCE public.pedidos_numero_seq TO authenticated;
