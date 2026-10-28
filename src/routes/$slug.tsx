import { createFileRoute } from "@tanstack/react-router";
import { CatalogoPage, catalogoQ } from "./c.$slug";

// Link curto do catálogo: dominio/<endereço>. Páginas do sistema têm prioridade
// (rotas fixas vencem rotas com parâmetro) e seus nomes são bloqueados como endereço.
export const Route = createFileRoute("/$slug")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Catálogo — faça seu pedido" },
      { name: "description", content: "Veja os produtos, monte seu pedido e pague por Pix." },
      { property: "og:title", content: "Catálogo — faça seu pedido" },
      { property: "og:description", content: "Veja os produtos, monte seu pedido e pague por Pix." },
      { property: "og:type", content: "website" },
    ],
  }),
  loader: ({ context, params }) => { void context.queryClient.prefetchQuery(catalogoQ(params.slug)); },
  component: CatalogoCurto,
});

function CatalogoCurto() {
  const { slug } = Route.useParams();
  return <CatalogoPage slug={slug} />;
}
