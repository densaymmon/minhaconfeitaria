import * as appQueries from "@/lib/queries";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Store, Truck } from "lucide-react";
import { usePedidosCalc } from "@/lib/hooks";
import { hojeISO } from "@/lib/format";
import { agendaDaSemana, semanaDe, somarDiasISO } from "@/lib/gestao";
import { Card, PageHeader, StatusBadge } from "@/components/app/ui";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/agenda")({
  loader: async ({ context }) => {
    await Promise.all([
      context.queryClient.ensureQueryData(appQueries.pedidosQ),
      context.queryClient.ensureQueryData(appQueries.configQ),
      context.queryClient.ensureQueryData(appQueries.pedidoPagamentosQ),
      context.queryClient.ensureQueryData(appQueries.confeitariaQ),
    ]);
  },
  head: () => ({ meta: [{ title: "Agenda da semana — Doce Gestão" }, { name: "description", content: "Pedidos e carga de produção de cada dia da semana." }] }),
  component: AgendaPage,
});

const NOMES = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];

function AgendaPage() {
  const pedidos = usePedidosCalc();
  const { data: confeitaria } = useSuspenseQuery(appQueries.confeitariaQ);
  const hoje = hojeISO();
  const [base, setBase] = useState(hoje);
  const dias = semanaDe(base);
  const semana = useMemo(() => agendaDaSemana(pedidos, dias, confeitaria?.limite_pedidos_dia ?? null), [pedidos, dias.join(), confeitaria?.limite_pedidos_dia]);
  const maior = Math.max(1, ...semana.map((d) => d.itens));
  const totalPedidos = semana.reduce((s, d) => s + d.pedidos.length, 0);
  const primeiro = dias[0] ?? base, ultimo = dias[6] ?? base;

  return (
    <>
      <PageHeader title="Agenda da semana" subtitle={`${totalPedidos} pedido(s) · ${primeiro.slice(8, 10)}/${primeiro.slice(5, 7)} a ${ultimo.slice(8, 10)}/${ultimo.slice(5, 7)}`} back="/mais" />
      <div className="mb-4 flex items-center justify-between gap-2 rounded-2xl bg-card p-2 shadow-soft">
        <Button type="button" variant="ghost" size="icon" onClick={() => setBase((b) => somarDiasISO(b, -7))} aria-label="Semana anterior"><ChevronLeft className="size-5" /></Button>
        <Button type="button" variant={dias.includes(hoje) ? "secondary" : "outline"} size="sm" onClick={() => setBase(hoje)}>Esta semana</Button>
        <Button type="button" variant="ghost" size="icon" onClick={() => setBase((b) => somarDiasISO(b, 7))} aria-label="Próxima semana"><ChevronRight className="size-5" /></Button>
      </div>

      <div className="space-y-3 pb-6">
        {semana.map((d, i) => {
          const ehHoje = d.dia === hoje;
          return (
            <Card key={d.dia} className={cn("p-3", ehHoje && "ring-1 ring-primary/40", d.dia < hoje && "opacity-70")}>
              <div className="flex items-center gap-3">
                <div className={cn("grid w-14 shrink-0 place-items-center rounded-xl py-1.5 text-center", ehHoje ? "bg-primary text-primary-foreground" : "bg-muted")}>
                  <span className="text-[11px] font-medium">{NOMES[i]}</span>
                  <span className="font-display text-lg font-bold tabular-nums">{d.dia.slice(8, 10)}</span>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2 text-sm font-semibold">
                    {d.pedidos.length === 0 ? <span className="font-normal text-muted-foreground">Livre</span> : <span>{d.pedidos.length} pedido(s) · {d.itens.toLocaleString("pt-BR")} item(ns)</span>}
                    {d.cheio && <span className="rounded-full bg-warning/20 px-2 py-0.5 text-xs text-warning-foreground">agenda cheia</span>}
                  </div>
                  {d.itens > 0 && (
                    <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-muted" title={`${d.pendente} item(ns) ainda por produzir`}>
                      <div className="h-full rounded-full bg-primary" style={{ width: `${Math.round((d.itens / maior) * 100)}%` }} />
                    </div>
                  )}
                  {d.pendente > 0 && d.dia >= hoje && <p className="mt-1 text-xs text-muted-foreground">{d.pendente.toLocaleString("pt-BR")} item(ns) por produzir</p>}
                </div>
              </div>
              {d.pedidos.length > 0 && (
                <ul className="mt-3 divide-y border-t">
                  {[...d.pedidos].sort((a, b) => (a.hora_entrega || "99").localeCompare(b.hora_entrega || "99")).map((p) => (
                    <li key={p.id}>
                      <Link to="/pedidos/$id" params={{ id: p.id }} className="flex items-center gap-2 py-2 text-sm hover:bg-muted/40">
                        <span className="w-11 shrink-0 tabular-nums text-muted-foreground">{p.hora_entrega ?? "—"}</span>
                        {p.tipo_entrega === "entrega" ? <Truck className="size-3.5 shrink-0 text-muted-foreground" /> : <Store className="size-3.5 shrink-0 text-muted-foreground" />}
                        <span className="min-w-0 flex-1 truncate">#{p.numero} · {p.clientes?.nome ?? "Sem cliente"} · {p.pedido_itens.map((it) => `${Number(it.quantidade)}× ${it.descricao}`).join(", ")}</span>
                        <StatusBadge status={p.status} />
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          );
        })}
      </div>
    </>
  );
}
