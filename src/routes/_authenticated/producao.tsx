import * as appQueries from "@/lib/queries";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Minus, Plus, CheckCircle2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { usePedidosCalc, type PedidoCalc } from "@/lib/hooks";
import { dataLonga, hojeISO, num } from "@/lib/format";
import { Card, Empty, Field, PageHeader, StatusBadge } from "@/components/app/ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/producao")({
 loader: async ({ context }) => { await Promise.all([context.queryClient.ensureQueryData(appQueries.pedidosQ),context.queryClient.ensureQueryData(appQueries.configQ)]); },
 errorComponent: ({error}) => <p role="alert" className="py-8 text-destructive">{error instanceof Error ? error.message : "Não foi possível carregar os registros."}</p>,
 notFoundComponent: () => <p>Registro não encontrado.</p>,

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

const A_PRODUZIR = ["recebido", "em_producao", "pronto"];

function Producao() {
  const pedidos = usePedidosCalc();
  const qc = useQueryClient();
  const hoje = hojeISO();
  const [dataInicial, setDataInicial] = useState("");
  const [dataFinal, setDataFinal] = useState("");
  const [clienteFiltro, setClienteFiltro] = useState("");

  const fila = useMemo(
    () =>
      pedidos
        .filter((p) => A_PRODUZIR.includes(p.status))
        .sort((a, b) => a.data_entrega.localeCompare(b.data_entrega) || (a.hora_entrega ?? "").localeCompare(b.hora_entrega ?? "")),
    [pedidos],
  );

  const filaPeriodo = useMemo(
    () => fila.filter((p) =>
      (!dataInicial || p.data_entrega >= dataInicial) &&
      (!dataFinal || p.data_entrega <= dataFinal)
    ),
    [fila, dataInicial, dataFinal],
  );

  const clientesPeriodo = useMemo(() => {
    const m = new Map<string, string>();
    for (const p of filaPeriodo) {
      if (p.cliente_id && p.clientes?.nome) m.set(p.cliente_id, p.clientes.nome);
    }
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1], "pt-BR"));
  }, [filaPeriodo]);

  const filaFiltrada = useMemo(
    () => filaPeriodo.filter((p) => !clienteFiltro || p.cliente_id === clienteFiltro),
    [filaPeriodo, clienteFiltro],
  );

  const porData = useMemo(() => {
    const m = new Map<string, PedidoCalc[]>();
    for (const p of filaFiltrada) m.set(p.data_entrega, [...(m.get(p.data_entrega) ?? []), p]);
    return [...m.entries()];
  }, [filaFiltrada]);

  const resumo = useMemo(() => {
    const m = new Map<string, { qtd: number; feito: number }>();
    for (const p of filaFiltrada)
      for (const i of p.pedido_itens) {
        const r = m.get(i.descricao) ?? { qtd: 0, feito: 0 };
        r.qtd += Number(i.quantidade);
        r.feito += Number(i.quantidade_produzida);
        m.set(i.descricao, r);
      }
    return [...m.entries()].sort((a, b) => (b[1].qtd - b[1].feito) - (a[1].qtd - a[1].feito));
  }, [filaFiltrada]);

  async function ajustar(itemId: string, valor: number, max: number) {
    const v = Math.max(0, Math.min(max, valor));
    const { error } = await supabase.from("pedido_itens").update({ quantidade_produzida: v }).eq("id", itemId);
    if (error) return void toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["pedidos"] });
  }

  async function mudarStatus(p: PedidoCalc, status: "entregue") {
    try {
      // Marca os itens como produzidos antes de concluir o pedido. Se algum item falhar,
      // o pedido continua na fila e não mostramos uma conclusão falsa.
      const atualizacoesItens = await Promise.all(
        p.pedido_itens.map((i) =>
          supabase.from("pedido_itens")
            .update({ quantidade_produzida: i.quantidade })
            .eq("id", i.id),
        ),
      );
      const erroItem = atualizacoesItens.find((resultado) => resultado.error)?.error;
      if (erroItem) throw new Error(`Não foi possível registrar todos os itens produzidos: ${erroItem.message}`);

      const { error } = await supabase.from("pedidos").update({ status }).eq("id", p.id);
      if (error) throw new Error(`Não foi possível finalizar o pedido: ${error.message}`);

      await qc.invalidateQueries({ queryKey: ["pedidos"] });
      toast.success(`Pedido #${p.numero} finalizado e marcado como entregue!`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível finalizar o pedido. Tente novamente.");
    }
  }

  const atrasados = filaFiltrada.filter((p) => p.data_entrega < hoje).length;

  return (
    <>
      <PageHeader title="Produção" subtitle={`${filaFiltrada.length} pedido(s) na fila${atrasados ? ` · ${atrasados} atrasado(s)` : ""}`} />

      <Card className="mb-5 space-y-3">
        <h2 className="text-lg font-semibold">Total a produzir</h2>
        <p className="text-sm text-muted-foreground">Filtre pelas datas de entrega e, se quiser, por cliente. Os totais abaixo acompanham os filtros.</p>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Entrega a partir de">
            <Input type="date" value={dataInicial} max={dataFinal || undefined} onChange={(e) => { setDataInicial(e.target.value); setClienteFiltro(""); }} className="h-11" />
          </Field>
          <Field label="Entrega até">
            <Input type="date" value={dataFinal} min={dataInicial || undefined} onChange={(e) => { setDataFinal(e.target.value); setClienteFiltro(""); }} className="h-11" />
          </Field>
        </div>
        <Field label="Cliente (somente do período selecionado)">
          <select
            value={clienteFiltro}
            onChange={(e) => setClienteFiltro(e.target.value)}
            className="flex h-11 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          >
            <option value="">Todos os clientes do período</option>
            {clientesPeriodo.map(([id, nome]) => <option key={id} value={id}>{nome}</option>)}
          </select>
        </Field>
        {(dataInicial || dataFinal || clienteFiltro) && (
          <Button type="button" size="sm" variant="outline" className="w-full" onClick={() => { setDataInicial(""); setDataFinal(""); setClienteFiltro(""); }}>
            Limpar filtros
          </Button>
        )}
        {resumo.length > 0 ? (
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
        ) : (
          <p className="text-sm text-muted-foreground">Nenhum item para produzir nesse filtro.</p>
        )}
      </Card>

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
                              <label className="flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground" title="Marcar item como produzido">
                                <input
                                  type="checkbox"
                                  checked={q > 0 && f >= q}
                                  onChange={(e) => ajustar(i.id, e.target.checked ? q : 0, q)}
                                  className="size-4 accent-primary"
                                  aria-label={`Marcar ${i.descricao} como produzido`}
                                />
                                Feito
                              </label>
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
                        <Button size="sm" className="flex-1" onClick={() => mudarStatus(p, "finalizado")}>
                          <CheckCircle2 className="size-4" /> Finalizado / entregue
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
