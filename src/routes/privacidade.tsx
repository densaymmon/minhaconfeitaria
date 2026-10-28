import { createFileRoute } from "@tanstack/react-router";
import { PaginaLegal } from "@/components/app/pagina-legal";
import { politicaPrivacidade } from "@/lib/termos";

export const Route = createFileRoute("/privacidade")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Política de privacidade — Doce Gestão" },
      { name: "description", content: "Como a plataforma Doce Gestão trata dados pessoais, conforme a LGPD." },
    ],
  }),
  component: () => <PaginaLegal titulo="Política de privacidade" secoes={politicaPrivacidade} />,
});
