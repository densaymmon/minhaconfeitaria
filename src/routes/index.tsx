import { createFileRoute, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { PaginaVendas } from "@/components/app/pagina-vendas";

export const Route = createFileRoute("/")({
  ssr: false,
  head: () => ({
    meta: [
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { title: "Doce Gestão — Sistema para confeitarias: pedidos, custos e catálogo com Pix" },
      { name: "description", content: "Organize pedidos, produção, custos e financeiro da sua confeitaria. Catálogo on-line com Pix e WhatsApp. Teste grátis." },
      { property: "og:title", content: "Doce Gestão — Sistema para confeitarias" },
      { property: "og:description", content: "Pedidos, produção, custos, catálogo on-line com Pix e WhatsApp num só lugar. Teste grátis." },
    ],
  }),
  // Quem já entrou vai direto para o painel; visitantes veem a apresentação do sistema.
  beforeLoad: async () => {
    const { data } = await supabase.auth.getSession();
    if (data.session) throw redirect({ to: "/painel" });
  },
  component: PaginaVendas,
});
