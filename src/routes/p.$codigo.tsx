import { createFileRoute } from "@tanstack/react-router";
import { AcompanharPedido } from "./pedido.$codigo";

// Link curto de acompanhamento enviado ao cliente: dominio/p/<código de 10 caracteres>.
export const Route = createFileRoute("/p/$codigo")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Acompanhe seu pedido" },
      { name: "description", content: "Situação do pedido e pagamento por Pix." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AcompanharCurto,
});

function AcompanharCurto() {
  const { codigo } = Route.useParams();
  return <AcompanharPedido codigo={codigo} />;
}
