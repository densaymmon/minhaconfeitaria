import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { redirecionamentoCardapio } from "@/lib/catalogo";

/** Leitura pública apenas do endereço próprio (função do banco): nunca consulta tabelas anonimamente. */
export const enderecoCardapioQ = (slug: string) => queryOptions({
  queryKey: ["endereco-cardapio", slug],
  queryFn: async () => {
    const { data, error } = await supabase.rpc("endereco_cardapio_publico", { p_slug: slug });
    // Sem resposta, mostra o catálogo interno em vez de travar a página.
    if (error) return null;
    return redirecionamentoCardapio(data);
  },
  staleTime: 60_000,
});
