import * as appQueries from "@/lib/queries";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { MessageCircle, Pencil, Trash2, MapPin } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { clientesQ } from "@/lib/queries";
import { usePedidosCalc } from "@/lib/hooks";
import { brl, dataBR } from "@/lib/format";
import { Card, Empty, PageHeader, Stat, StatusBadge } from "@/components/app/ui";
import { Button } from "@/components/ui/button";
import { ClienteDialog } from "./clientes.index";

export const Route = createFileRoute("/_authenticated/clientes/$id")({
 loader: async ({ context }) => { await Promise.all([context.queryClient.ensureQueryData(appQueries.clientesQ),context.queryClient.ensureQueryData(appQueries.pedidosQ),context.queryClient.ensureQueryData(appQueries.configQ)]); },
 errorComponent: ({error}) => <p role="alert" className="py-8 text-destructive">{error instanceof Error ? error.message : "Não foi possível carregar os registros."}</p>,
 notFoundComponent: () => <p>Registro não encontrado.</p>,

  head: () => ({
    meta: [
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { title: "Cliente — Doce Gestão" },
      { name: "description", content: "Dados e histórico de pedidos do cliente." },
      { property: "og:title", content: "Cliente — Doce Gestão" },
      { property: "og:description", content: "Dados e histórico de pedidos do cliente." },
    ],
  }),
  component: ClienteDetalhe,
});

function ClienteDetalhe() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { data: clientes } = useSuspenseQuery(clientesQ);
  const pedidos = usePedidosCalc();
  const [editar, setEditar] = useState(false);
  const c = clientes.find((x) => x.id === id);
  if (!c) return <Empty>Cliente não encontrado. <Link to="/clientes" className="text-primary">Voltar</Link></Empty>;

  const hist = pedidos.filter((p) => p.cliente_id === id);
  const validos = hist.filter((p) => p.status !== "cancelado");
  const total = validos.reduce((s, p) => s + p.t.venda, 0);
  const aReceber = validos.reduce((s, p) => s + p.t.saldo, 0);
  const tel = c.telefone?.replace(/\D/g, "").replace(/^55/, "");

  async function excluir() {
    if (!confirm(`Excluir ${c?.nome}? Os pedidos serão mantidos sem cliente.`)) return;
    const { error } = await supabase.from("clientes").delete().eq("id", id);
    if (error) return void toast.error(error.message);
    await qc.invalidateQueries({ queryKey: ["clientes"] });
    qc.invalidateQueries({ queryKey: ["pedidos"] });
    navigate({ to: "/clientes" });
  }

  return (
    <>
      <PageHeader
        title={c.nome}
        subtitle={c.telefone ?? undefined}
        back="/clientes"
        action={
          <Button size="icon" variant="outline" onClick={() => setEditar(true)} aria-label="Editar">
            <Pencil className="size-4" />
          </Button>
        }
      />
      <Card className="mb-4 space-y-2 text-sm">
        {c.endereco && (
          <div className="flex gap-2"><MapPin className="size-4 shrink-0 text-muted-foreground" /> {c.endereco}</div>
        )}
        {c.observacoes && <p className="rounded-lg bg-accent p-2 text-accent-foreground">{c.observacoes}</p>}
        <div className="flex gap-2 pt-1">
          {tel && (
            <Button asChild size="sm" variant="secondary">
              <a href={`https://wa.me/55${tel}`} target="_blank" rel="noreferrer"><MessageCircle className="size-4" /> WhatsApp</a>
            </Button>
          )}
          <Button size="sm" variant="ghost" className="text-destructive" onClick={excluir}>
            <Trash2 className="size-4" /> Excluir
          </Button>
        </div>
      </Card>
      <div className="mb-4 grid grid-cols-3 gap-2">
        <Stat label="Pedidos" value={validos.length} />
        <Stat label="Total comprado" value={brl(total)} tone="primary" />
        <Stat label="A receber" value={brl(aReceber)} tone={aReceber > 0 ? "danger" : "default"} />
      </div>
      <h2 className="mb-2 text-lg font-semibold">Histórico</h2>
      {hist.length === 0 ? (
        <Empty>Nenhum pedido ainda.</Empty>
      ) : (
        <div className="space-y-2">
          {hist.map((p) => (
            <Link key={p.id} to="/pedidos/$id" params={{ id: p.id }} className="block">
              <Card className="flex items-center justify-between gap-2 p-3">
                <div className="min-w-0">
                  <div className="font-medium">#{p.numero} · {dataBR(p.data_entrega)}</div>
                  <div className="truncate text-xs text-muted-foreground">{p.pedido_itens.map((i) => i.descricao).join(", ")}</div>
                </div>
                <div className="text-right">
                  <div className="text-sm font-semibold">{brl(p.t.venda)}</div>
                  <StatusBadge status={p.status} />
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}
      <ClienteDialog key={c.id + String(editar)} cliente={c} open={editar} onOpenChange={setEditar} />
    </>
  );
}
