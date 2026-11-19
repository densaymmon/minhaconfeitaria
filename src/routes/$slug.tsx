import { createFileRoute } from "@tanstack/react-router";
import { metaDoCatalogo, previaDoCatalogo } from "@/lib/catalogo";
import { CatalogoPage, carregarCatalogo } from "./c.$slug";

// Link curto do catálogo: dominio/<endereço>. Páginas do sistema têm prioridade
// (rotas fixas vencem rotas com parâmetro) e seus nomes são bloqueados como endereço.
export const Route = createFileRoute("/$slug")({
  // "data-only": o servidor roda só o loader, para a prévia do link (WhatsApp, Instagram)
  // já sair com o nome e a foto da confeitaria; a página continua sendo montada no navegador.
  ssr: "data-only",
  head: ({ loaderData }) => ({ meta: metaDoCatalogo(loaderData?.previa ?? previaDoCatalogo(null)) }),
  loader: carregarCatalogo,
  component: CatalogoCurto,
});

function CatalogoCurto() {
  const { slug } = Route.useParams();
  return <CatalogoPage slug={slug} />;
}
