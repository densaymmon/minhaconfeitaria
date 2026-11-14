import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { redirecionamentoCardapio } from "@/lib/catalogo";

/** Leitura pública apenas do endereço: nunca consulta tabelas anonimamente. */
export const enderecoCardapioQ = (slug: string) => queryOptions({
  queryKey: ["endereco-cardapio", slug],
  queryFn: async () => {
    if (slug !== "casaldobolo-catalogo") return null;
    const { data, error } = await supabase.rpc("endereco_cardapio_publico", { p_slug: slug });
    if (error) throw new Error("Não foi possível consultar o endereço do cardápio. Tente novamente.");
    return redirecionamentoCardapio(slug, data);
  },
  staleTime: 0,
});