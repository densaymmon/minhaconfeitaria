import { createFileRoute } from "@tanstack/react-router";
import { PaginaLegal } from "@/components/app/pagina-legal";
import { termosDeUso } from "@/lib/termos";

export const Route = createFileRoute("/termos")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Termos de uso — Doce Gestão" },
      { name: "description", content: "Termos de uso da plataforma Doce Gestão para confeitarias." },
    ],
  }),
  component: () => <PaginaLegal titulo="Termos de uso" secoes={termosDeUso} />,
});
