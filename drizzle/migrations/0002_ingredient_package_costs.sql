ALTER TABLE public.insumos ADD COLUMN preco_embalagem numeric, ADD COLUMN quantidade_embalagem numeric DEFAULT 1, ADD COLUMN unidade_embalagem text;
UPDATE public.insumos SET preco_embalagem=preco_unidade, unidade_embalagem=unidade;
ALTER TABLE public.receita_itens ADD COLUMN quantidade_utilizada numeric, ADD COLUMN unidade_receita text;
UPDATE public.receita_itens r SET quantidade_utilizada=r.quantidade, unidade_receita=i.unidade FROM public.insumos i WHERE i.id=r.insumo_id;
ALTER TABLE public.produtos ADD COLUMN custo_alterado_em timestamptz;
CREATE OR REPLACE FUNCTION public.medida_base(u text) RETURNS text LANGUAGE sql IMMUTABLE SET search_path=public AS $$ SELECT CASE WHEN u IN ('kg','g') THEN 'g' WHEN u IN ('L','ml') THEN 'ml' WHEN u IN ('un','unidade','dúzia') THEN 'un' WHEN u='pacote' THEN 'pacote' ELSE NULL END $$;
CREATE OR REPLACE FUNCTION public.medida_fator(u text) RETURNS numeric LANGUAGE sql IMMUTABLE SET search_path=public AS $$ SELECT CASE WHEN u IN ('kg','L') THEN 1000 WHEN u='dúzia' THEN 12 WHEN u IN ('g','ml','un','unidade','pacote') THEN 1 ELSE NULL END $$;
CREATE OR REPLACE FUNCTION public.validar_embalagem() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
BEGIN
 IF TG_OP='INSERT' THEN
  NEW.preco_embalagem:=coalesce(NEW.preco_embalagem,NEW.preco_unidade);
  NEW.unidade_embalagem:=coalesce(NEW.unidade_embalagem,NEW.unidade);
 ELSE
  IF NEW.preco_unidade IS DISTINCT FROM OLD.preco_unidade AND NEW.preco_embalagem IS NOT DISTINCT FROM OLD.preco_embalagem THEN
   NEW.preco_embalagem:=NEW.preco_unidade*NEW.quantidade_embalagem*public.medida_fator(NEW.unidade_embalagem)/public.medida_fator(NEW.unidade);
  END IF;
 END IF;
 IF NEW.preco_embalagem IS NULL OR NEW.preco_embalagem<0 OR NEW.preco_embalagem::text IN ('NaN','Infinity','-Infinity') OR NEW.quantidade_embalagem IS NULL OR NEW.quantidade_embalagem<=0 OR NEW.quantidade_embalagem::text IN ('NaN','Infinity','-Infinity') OR public.medida_base(NEW.unidade_embalagem) IS NULL THEN RAISE EXCEPTION 'Informe preço válido e quantidade da embalagem maior que zero.'; END IF;
 IF public.medida_base(NEW.unidade) IS DISTINCT FROM public.medida_base(NEW.unidade_embalagem) THEN RAISE EXCEPTION 'Medidas incompatíveis: não é possível converter peso, volume e contagem entre si.'; END IF;
 NEW.preco_unidade:=NEW.preco_embalagem/(NEW.quantidade_embalagem*public.medida_fator(NEW.unidade_embalagem))*public.medida_fator(NEW.unidade);
 RETURN NEW;
END $$;
CREATE TRIGGER validar_embalagem BEFORE INSERT OR UPDATE ON public.insumos FOR EACH ROW EXECUTE FUNCTION public.validar_embalagem();
CREATE OR REPLACE FUNCTION public.validar_consumo_receita() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE i public.insumos;
BEGIN
 SELECT * INTO i FROM public.insumos WHERE id=NEW.insumo_id AND user_id=NEW.user_id FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Ingrediente não encontrado.'; END IF;
 NEW.quantidade_utilizada:=coalesce(NEW.quantidade_utilizada,NEW.quantidade);
 NEW.unidade_receita:=coalesce(NEW.unidade_receita,i.unidade);
 IF NEW.quantidade_utilizada<=0 OR NEW.quantidade_utilizada::text IN ('NaN','Infinity','-Infinity') THEN RAISE EXCEPTION 'Quantidade utilizada deve ser maior que zero.'; END IF;
 IF public.medida_base(NEW.unidade_receita) IS NULL OR public.medida_base(NEW.unidade_receita) IS DISTINCT FROM public.medida_base(i.unidade_embalagem) THEN RAISE EXCEPTION 'Unidades incompatíveis na receita.'; END IF;
 NEW.quantidade:=NEW.quantidade_utilizada*public.medida_fator(NEW.unidade_receita)/public.medida_fator(i.unidade);
 RETURN NEW;
END $$;
CREATE TRIGGER validar_consumo_receita BEFORE INSERT OR UPDATE ON public.receita_itens FOR EACH ROW EXECUTE FUNCTION public.validar_consumo_receita();
CREATE OR REPLACE FUNCTION public.sinalizar_custo_receitas() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
BEGIN
 IF OLD.preco_embalagem/(OLD.quantidade_embalagem*public.medida_fator(OLD.unidade_embalagem)) IS DISTINCT FROM NEW.preco_embalagem/(NEW.quantidade_embalagem*public.medida_fator(NEW.unidade_embalagem)) THEN
 UPDATE public.produtos SET custo_alterado_em=now() WHERE user_id=NEW.user_id AND id IN (SELECT produto_id FROM public.receita_itens WHERE insumo_id=NEW.id AND user_id=NEW.user_id);
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER sinalizar_custo_receitas AFTER UPDATE ON public.insumos FOR EACH ROW EXECUTE FUNCTION public.sinalizar_custo_receitas();
CREATE OR REPLACE FUNCTION public.salvar_produto(payload jsonb, itens jsonb, registro_id uuid DEFAULT NULL) RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE r public.produtos; rid uuid; item jsonb;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Acesso não autorizado'; END IF;
 IF jsonb_typeof(itens) IS DISTINCT FROM 'array' OR jsonb_array_length(itens)>100 THEN RAISE EXCEPTION 'Receita inválida'; END IF;
 r:=jsonb_populate_record(NULL::public.produtos,payload);
 IF registro_id IS NULL THEN
 INSERT INTO public.produtos(nome,categoria,rendimento,custo_gas,custo_energia,custo_mao_obra,preco_venda,margem_desejada,modo_preparo,ativo) VALUES(r.nome,r.categoria,r.rendimento,r.custo_gas,r.custo_energia,r.custo_mao_obra,r.preco_venda,r.margem_desejada,r.modo_preparo,r.ativo) RETURNING id INTO rid;
 ELSE
 UPDATE public.produtos SET nome=r.nome,categoria=r.categoria,rendimento=r.rendimento,custo_gas=r.custo_gas,custo_energia=r.custo_energia,custo_mao_obra=r.custo_mao_obra,preco_venda=r.preco_venda,margem_desejada=r.margem_desejada,modo_preparo=r.modo_preparo,ativo=r.ativo WHERE id=registro_id RETURNING id INTO rid;
 IF rid IS NULL THEN RAISE EXCEPTION 'Produto não encontrado'; END IF;
 DELETE FROM public.receita_itens WHERE produto_id=rid;
 END IF;
 FOR item IN SELECT value FROM jsonb_array_elements(itens) LOOP
 INSERT INTO public.receita_itens(produto_id,insumo_id,quantidade,quantidade_utilizada,unidade_receita) VALUES(rid,(item->>'insumo_id')::uuid,coalesce((item->>'quantidade')::numeric,(item->>'quantidade_utilizada')::numeric),(item->>'quantidade_utilizada')::numeric,item->>'unidade_receita');
 END LOOP;
 RETURN rid;
END $$;
REVOKE ALL ON FUNCTION public.salvar_produto(jsonb,jsonb,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.salvar_produto(jsonb,jsonb,uuid) TO authenticated,service_role;
COMMENT ON COLUMN public.insumos.preco_unidade IS 'Compatibility projection in legacy unidade; precise costing uses package price and quantity.';
COMMENT ON COLUMN public.receita_itens.quantidade IS 'Compatibility projection in ingredient legacy unidade; precise consumption uses quantidade_utilizada and unidade_receita.';