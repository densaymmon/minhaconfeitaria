import * as appQueries from "@/lib/queries";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { CheckCircle2, MapPin, MessageCircle, Navigation, Truck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { usePedidosCalc } from "@/lib/hooks";
import { brl, dataLonga, hojeISO } from "@/lib/format";
import { linkWhatsApp } from "@/lib/catalogo";
import { entregasDoDia, linkMapa, linkRota, mensagemSaiuParaEntrega } from "@/lib/gestao";
import { alterarPedido, otimista } from "@/lib/cache-pedidos";
import type { Pedido } from "@/lib/queries";
import { Card, PageHeader, StatusBadge } from "@/components/app/ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export const Route = createFileRoute("/_authenticated/entregas")({
  loader: async ({ context }) => {
    await Promise.all([
      context.queryClient.ensureQueryData(appQueries.pedidosQ),
      context.queryClient.ensureQueryData(appQueries.configQ),
      context.queryClient.ensureQueryData(appQueries.pedidoPagamentosQ),
      context.queryClient.ensureQueryData(appQueries.confeitariaQ),
    ]);
  },
  head: () => ({ meta: [{ title: "Entregas do dia — Doce Gestão" }, { name: "description", content: "Rota das entregas do dia com mapa e aviso pelo WhatsApp." }] }),
  component: EntregasPage,
});

function EntregasPage() {
  const qc = useQueryClient();
  const pedidos = usePedidosCalc();
  const { data: confeitaria } = useSuspenseQuery(appQueries.confeitariaQ);
  const [dia, setDia] = useState(hojeISO());
  const entregas = entregasDoDia(pedidos, dia);
  const cidade = confeitaria?.cidade ?? null;
  const loja = confeitaria?.nome?.trim() || "nossa confeitaria";
  const rota = linkRota(entregas.flatMap((p) => (p.endereco_entrega ? [p.endereco_entrega] : [])), cidade);
  const semEndereco = entregas.filter((p) => !p.endereco_entrega).length;

  async function marcarEntregue(id: string, numero: number) {
    try {
      await otimista<Pedido>(qc, (lista) => alterarPedido(lista, id, { status: "entregue" }), async () => {
        const { error } = await supabase.from("pedidos").update({ status: "entregue" }).eq("id", id);
        if (error) throw new Error(error.message);
      });
      toast.success(`Pedido #${numero} entregue.`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível marcar como entregue.");
    }
  }

  return (
    <>
      <PageHeader title="Entregas do dia" subtitle={dataLonga(dia)} back="/mais" />
      <div className="mb-4 flex items-center gap-2">
        <Input type="date" value={dia} onChange={(e) => e.target.value && setDia(e.target.value)} className="h-11 w-auto bg-card" aria-label="Dia das entregas" />
        {rota && <Button asChild className="h-11 flex-1"><a href={rota} target="_blank" rel="noreferrer"><Navigation className="size-4" /> Abrir rota ({Math.min(10, entregas.length - semEndereco)} parada(s))</a></Button>}
      </div>
      {entregas.length > 10 && <p className="mb-3 text-xs text-muted-foreground">O Google Maps aceita até 10 paradas por rota; as demais ficam para uma segunda rota.</p>}

      {entregas.length === 0 ? (
        <Card className="py-10 text-center text-sm text-muted-foreground"><Truck className="mx-auto mb-2 size-8 opacity-50" />Nenhuma entrega pendente neste dia.</Card>
      ) : (
        <ol className="space-y-3 pb-6">
          {entregas.map((p, i) => {
            const falta = Math.max(0, Math.round((p.t.venda - p.t.recebido) * 100) / 100);
            const whats = linkWhatsApp(p.clientes?.telefone, mensagemSaiuParaEntrega({ cliente: p.clientes?.nome, numero: p.numero, loja, falta }));
            return (
              <li key={p.id}>
                <Card className="space-y-2 p-3">
                  <div className="flex items-start gap-3">
                    <span className="grid size-8 shrink-0 place-items-center rounded-full bg-primary text-sm font-bold text-primary-foreground">{i + 1}</span>
                    <div className="min-w-0 flex-1">
                      <Link to="/pedidos/$id" params={{ id: p.id }} className="font-semibold hover:underline">#{p.numero} · {p.clientes?.nome ?? "Sem cliente"}</Link>
                      <p className="text-sm text-muted-foreground">{p.hora_entrega ? `${p.hora_entrega} · ` : ""}{p.pedido_itens.map((it) => `${Number(it.quantidade)}× ${it.descricao}`).join(", ")}</p>
                      <p className="mt-1 flex items-start gap-1 text-sm"><MapPin className="mt-0.5 size-3.5 shrink-0 text-primary" />{p.endereco_entrega ?? <span className="text-warning-foreground">Sem endereço no pedido</span>}</p>
                      {falta > 0 && <p className="mt-1 text-sm font-medium">Receber na entrega: {brl(falta)}</p>}
                    </div>
                    <StatusBadge status={p.status} />
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    {p.endereco_entrega ? <Button asChild size="sm" variant="outline"><a href={linkMapa(p.endereco_entrega, cidade)} target="_blank" rel="noreferrer"><MapPin className="size-4" /> Mapa</a></Button> : <span />}
                    {whats ? <Button asChild size="sm" variant="outline"><a href={whats} target="_blank" rel="noreferrer"><MessageCircle className="size-4" /> Saiu</a></Button> : <span />}
                    <Button type="button" size="sm" onClick={() => void marcarEntregue(p.id, p.numero)}><CheckCircle2 className="size-4" /> Entregue</Button>
                  </div>
                </Card>
              </li>
            );
          })}
        </ol>
      )}
    </>
  );
}
