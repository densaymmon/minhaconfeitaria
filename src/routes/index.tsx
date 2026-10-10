import { createFileRoute, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Doce Gestão — Sistema da confeitaria" },
      { name: "description", content: "Pedidos, produção, receitas e finanças da sua confeitaria artesanal em um só lugar." },
      { property: "og:title", content: "Doce Gestão — Sistema da confeitaria" },
      { property: "og:description", content: "Pedidos, produção, receitas e finanças da sua confeitaria artesanal." },
    ],
  }),
  beforeLoad: async () => {
    const { data } = await supabase.auth.getUser();
    throw redirect({ to: data.user ? "/painel" : "/auth" });
  },
  component: () => null,
});
