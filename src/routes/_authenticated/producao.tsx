import { createFileRoute, Link } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";
import { toast } from "sonner";
import { Minus, Plus, CheckCircle2, Play } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { usePedidosCalc, type PedidoCalc } from "@/lib/hooks";
import { dataLonga, hojeISO, num } from "@/lib/format";
import { Card, Empty, PageHeader, StatusBadge } from "@/components/app/ui";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/producao")({
  head: () => ({
    meta: [
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { title: "Produção — Doce Gestão" },
      { name: "description", content: "Agenda de produção por data de entrega." },
      { property: "og:title", content: "Produção — Doce Gestão" },
      { property: "og:description", content: "Agenda de produção por data de entrega." },
    ],
  }),
  component: Producao,
});

const A_PRODUZIR = ["recebido", "confirmado", "em_producao"];

function Producao() {
  const pedidos = usePedidosCalc();
  const qc = useQueryClient();
  const hoje = hojeISO();

  const fila = useMemo(
    () =>
      pedidos
        .filter((p) => A_PRODUZIR.includes(p.status))
        .sort((a, b) => a.data_entrega.localeCompare(b.data_entrega) || (a.hora_entrega ?? "").localeCompare(b.hora_entrega ?? "")),
    [pedidos],
  );

  const porData = useMemo(() => {
    const m = new Map<string, PedidoCalc[]>();
    for (const p of fila) m.set(p.data_entrega, [...(m.get(p.data_entrega) ?? []), p]);
    return [...m.entries()];
  }, [fila]);

  const resumo = useMemo(() => {
    const m = new Map<string, { qtd: number; feito: number }>();
    for (const p of fila)
      for (const i of p.pedido_itens) {
        const r = m.get(i.descricao) ?? { qtd: 0, feito: 0 };
        r.qtd += Number(i.quantidade);
        r.feito += Number(i.quantidade_produzida);
        m.set(i.descricao, r);
      }
    return [...m.entries()].sort((a, b) => b[1].qtd - b[1].feito - (a[1].qtd - a[1].feito));
  }, [fila]);

  async function ajustar(itemId: string, valor: number, max: number) {
    const v = Math.max(0, Math.min(max, valor));
    const { error } = await supabase.from("pedido_itens").update({ quantidade_produzida: v }).eq("id", itemId);
    if (error) return void toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["pedidos"] });
  }

  async function mudarStatus(p: PedidoCalc, status: string) {
    const { error } = await supabase.from("pedidos").update({ status }).eq("id", p.id);
    if (error) return void toast.error(error.message);
    if (status === "pronto") {
      await Promise.all(
        p.pedido_itens.map((i) => supabase.from("pedido_itens").update({ quantidade_produzida: i.quantidade }).eq("id", i.id)),
      );
    }
    qc.invalidateQueries({ queryKey: ["pedidos"] });
    toast.success(status === "pronto" ? `Pedido #${p.numero} pronto!` : `Pedido #${p.numero} em produção`);
  }

  const atrasados = fila.filter((p) => p.data_entrega < hoje).length;

  return (
    <>
      <PageHeader title="Produção" subtitle={`${fila.length} pedido(s) na fila${atrasados ? ` · ${atrasados} atrasado(s)` : ""}`} />

      {resumo.length > 0 && (
        <Card className="mb-5">
          <h2 className="mb-2 text-lg font-semibold">Total a produzir</h2>
          <div className="space-y-2">
            {resumo.map(([nome, r]) => {
              const pend = Math.max(0, r.qtd - r.feito);
              return (
                <div key={nome}>
                  <div className="flex justify-between text-sm">
                    <span className="truncate">{nome}</span>
                    <span className="tabular-nums">
                      <b className={cn(pend > 0 ? "text-primary" : "text-success")}>{num(pend)}</b>
                      <span className="text-muted-foreground"> pendente · {num(r.feito)}/{num(r.qtd)}</span>
                    </span>
                  </div>
                  <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
                    <div className="h-full rounded-full bg-success" style={{ width: `${r.qtd ? (r.feito / r.qtd) * 100 : 0}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {porData.length === 0 ? (
        <Empty>Nada para produzir. 🎉</Empty>
      ) : (
        <div className="space-y-5">
          {porData.map(([data, lista]) => {
            const atrasado = data < hoje;
            return (
              <section key={data}>
                <h2 className={cn("mb-2 text-base font-semibold capitalize", atrasado && "text-destructive")}>
                  {atrasado ? "⚠ Atrasado · " : data === hoje ? "Hoje · " : ""}
                  {dataLonga(data)}
                </h2>
                <div className="space-y-2">
                  {lista.map((p) => (
                    <Card key={p.id} className={cn("p-3.5", atrasado && "ring-2 ring-destructive/40")}>
                      <div className="mb-2 flex items-center justify-between gap-2">
                        <Link to="/pedidos/$id" params={{ id: p.id }} className="font-semibold">
                          #{p.numero} · {p.clientes?.nome ?? "Sem cliente"} {p.hora_entrega && <span className="font-normal text-muted-foreground">· {p.hora_entrega}</span>}
                        </Link>
                        <StatusBadge status={p.status} />
                      </div>
                      {p.observacoes && <p className="mb-2 rounded-lg bg-accent p-2 text-xs text-accent-foreground">{p.observacoes}</p>}
                      <div className="space-y-1.5">
                        {p.pedido_itens.map((i) => {
                          const q = Number(i.quantidade);
                          const f = Number(i.quantidade_produzida);
                          return (
                            <div key={i.id} className="flex items-center gap-2">
                              <div className="min-w-0 flex-1 text-sm">
                                <div className="truncate">{i.descricao}</div>
                                <div className="text-xs text-muted-foreground">
                                  {num(f)} de {num(q)} feitos · {num(Math.max(0, q - f))} pendente
                                </div>
                              </div>
                              <Button size="icon" variant="outline" className="size-9" onClick={() => ajustar(i.id, f - 1, q)} aria-label="Diminuir">
                                <Minus className="size-4" />
                              </Button>
                              <Button size="icon" variant="outline" className="size-9" onClick={() => ajustar(i.id, f + 1, q)} aria-label="Aumentar">
                                <Plus className="size-4" />
                              </Button>
                            </div>
                          );
                        })}
                      </div>
                      <div className="mt-3 flex gap-2">
                        {p.status !== "em_producao" && (
                          <Button size="sm" variant="secondary" className="flex-1" onClick={() => mudarStatus(p, "em_producao")}>
                            <Play className="size-4" /> Iniciar
                          </Button>
                        )}
                        <Button size="sm" className="flex-1" onClick={() => mudarStatus(p, "pronto")}>
                          <CheckCircle2 className="size-4" /> Marcar pronto
                        </Button>
                      </div>
                    </Card>
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </>
  );
}
