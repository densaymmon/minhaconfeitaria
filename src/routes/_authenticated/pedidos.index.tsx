import * as appQueries from "@/lib/queries";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Download, Plus, Search } from "lucide-react";
import { usePedidosCalc } from "@/lib/hooks";
import { STATUS, brl, dataBR, formaLabel, hojeISO, statusLabel } from "@/lib/format";
import { baixarCSV } from "@/lib/csv";
import { Card, Empty, PageHeader, StatusBadge } from "@/components/app/ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/pedidos/")({
 validateSearch: (search: Record<string, unknown>) => ({
   filtro: typeof search.filtro === "string" ? search.filtro : undefined,
   dataInicial: typeof search.dataInicial === "string" ? search.dataInicial : undefined,
   dataFinal: typeof search.dataFinal === "string" ? search.dataFinal : undefined,
 }),
 loader: async ({ context }) => { await Promise.all([context.queryClient.ensureQueryData(appQueries.pedidosQ),context.queryClient.ensureQueryData(appQueries.configQ)]); },
 errorComponent: ({error}) => <p role="alert" className="py-8 text-destructive">{error instanceof Error ? error.message : "Não foi possível carregar os registros."}</p>,
 notFoundComponent: () => <p>Registro não encontrado.</p>,

  head: () => ({
    meta: [
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { title: "Pedidos — Doce Gestão" },
      { name: "description", content: "Lista e busca de encomendas." },
      { property: "og:title", content: "Pedidos — Doce Gestão" },
      { property: "og:description", content: "Lista e busca de encomendas." },
    ],
  }),
  component: Pedidos,
});

function Pedidos() {
  const pedidos = usePedidosCalc();
  const search = Route.useSearch();
  const [busca, setBusca] = useState("");
  const [status, setStatus] = useState<string>(search.filtro === "em_andamento" ? "em_andamento" : search.filtro === "mes" ? "todos" : search.filtro === "todos" ? "todos" : "abertos");
  const [dataInicial, setDataInicial] = useState(search.dataInicial ?? "");
  const [dataFinal, setDataFinal] = useState(search.dataFinal ?? "");
  const hoje = hojeISO();

  const lista = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return pedidos.filter((p) => {
      if (dataInicial && p.data_entrega < dataInicial) return false;
      if (dataFinal && p.data_entrega > dataFinal) return false;
      if (status === "abertos" && ["finalizado", "entregue", "cancelado"].includes(p.status)) return false;
      if (status === "em_andamento" && !["recebido", "confirmado", "em_producao", "pronto"].includes(p.status)) return false;
      if (status !== "abertos" && status !== "todos" && status !== "em_andamento") {
        const statusCompativel = status === "entregue"
          ? ["entregue", "finalizado"].includes(p.status)
          : p.status === status;
        if (!statusCompativel) return false;
      }
      if (!q) return true;
      return (
        String(p.numero) === q.replace("#", "") ||
        (p.clientes?.nome ?? "").toLowerCase().includes(q) ||
        (p.observacoes ?? "").toLowerCase().includes(q) ||
        p.pedido_itens.some((i) => i.descricao.toLowerCase().includes(q))
      );
    });
  }, [pedidos, busca, status, dataInicial, dataFinal]);

  function exportar() {
    baixarCSV(
      `pedidos-${hoje}`,
      ["Nº", "Cliente", "Entrega", "Status", "Pagamento", "Itens", "Valor vendido", "Custo", "Taxas", "Lucro bruto", "Lucro líquido", "Entrada", "Recebido", "Saldo", "Observações"],
      lista.map((p) => [
        p.numero,
        p.clientes?.nome ?? "",
        dataBR(p.data_entrega),
        statusLabel(p.status),
        formaLabel(p.forma_pagamento),
        p.pedido_itens.map((i) => `${Number(i.quantidade)}x ${i.descricao}`).join(", "),
        +p.t.venda.toFixed(2),
        +p.t.custo.toFixed(2),
        +p.t.taxas.toFixed(2),
        +p.t.lucroBruto.toFixed(2),
        +p.t.lucroLiquido.toFixed(2),
        Number(p.valor_entrada),
        +p.t.recebido.toFixed(2),
        +p.t.saldo.toFixed(2),
        p.observacoes ?? "",
      ]),
    );
  }

  const filtros = [{ value: "abertos", label: "Em aberto" }, { value: "em_andamento", label: "Recebidos e em produção" }, { value: "todos", label: "Todos" }, ...STATUS];

  return (
    <>
      <PageHeader
        title="Pedidos"
        subtitle={`${lista.length} encontrado(s)`}
        action={
          <div className="mt-1 flex gap-2">
            <Button size="icon" variant="outline" onClick={exportar} aria-label="Exportar CSV">
              <Download className="size-4" />
            </Button>
            <Button asChild size="sm" className="h-9">
              <Link to="/pedidos/$id" params={{ id: "novo" }}>
                <Plus className="size-4" /> Novo
              </Link>
            </Button>
          </div>
        }
      />
      <div className="relative mb-3">
        <Search className="absolute top-3.5 left-3 size-4 text-muted-foreground" />
        <Input placeholder="Buscar por nº, cliente ou produto" value={busca} onChange={(e) => setBusca(e.target.value)} className="h-11 bg-card pl-9" />
      </div>
      <Card className="mb-3 space-y-2 p-3">
        <div className="text-sm font-semibold">Filtrar por data de entrega</div>
        <div className="grid grid-cols-2 gap-3">
          <label className="space-y-1 text-xs font-medium text-muted-foreground">
            De
            <Input type="date" aria-label="Data inicial de entrega" value={dataInicial} max={dataFinal || undefined} onChange={(e) => setDataInicial(e.target.value)} className="h-10 bg-background text-sm" />
          </label>
          <label className="space-y-1 text-xs font-medium text-muted-foreground">
            Até
            <Input type="date" aria-label="Data final de entrega" value={dataFinal} min={dataInicial || undefined} onChange={(e) => setDataFinal(e.target.value)} className="h-10 bg-background text-sm" />
          </label>
        </div>
        {(dataInicial || dataFinal) && (
          <button type="button" className="text-left text-sm text-primary" onClick={() => { setDataInicial(""); setDataFinal(""); }}>
            Limpar filtro de datas
          </button>
        )}
      </Card>
      <div className="-mx-4 mb-4 flex gap-2 overflow-x-auto px-4 pb-1">
        {filtros.map((f) => (
          <button
            key={f.value}
            onClick={() => setStatus(f.value)}
            className={cn(
              "shrink-0 rounded-full border px-3 py-1.5 text-sm font-medium",
              status === f.value ? "border-primary bg-primary text-primary-foreground" : "bg-card",
            )}
          >
            {f.label}
          </button>
        ))}
      </div>
      {lista.length === 0 ? (
        <Empty>Nenhum pedido encontrado.</Empty>
      ) : (
        <div className="space-y-2">
          {lista.map((p) => {
            const atrasado = p.data_entrega < hoje && !["finalizado", "entregue", "cancelado"].includes(p.status);
            return (
              <Link key={p.id} to="/pedidos/$id" params={{ id: p.id }} className="block">
                <Card className="p-3.5">
                  <div className="flex items-center justify-between gap-2">
                    <div className="font-semibold">#{p.numero} · {p.clientes?.nome ?? "Sem cliente"}</div>
                    <div className="flex shrink-0 items-center gap-1.5">
                      {p.t.venda > 0 && p.t.saldo <= 0 && <span className="rounded-full bg-success/15 px-2 py-0.5 text-xs font-semibold text-success">Pago</span>}
                      <StatusBadge status={p.status} />
                    </div>
                  </div>
                  <div className="mt-1 truncate text-xs text-muted-foreground">
                    {p.pedido_itens.map((i) => `${Number(i.quantidade)}× ${i.descricao}`).join(", ") || "Sem itens"}
                  </div>
                  <div className="mt-2 flex items-center justify-between text-sm">
                    <span className={cn(atrasado && "font-semibold text-destructive")}>
                      {atrasado ? "Atrasado · " : ""}
                      {dataBR(p.data_entrega)} {p.hora_entrega ?? ""}
                    </span>
                    <span className="font-semibold tabular-nums">{brl(p.t.venda)}</span>
                  </div>
                  {p.t.saldo > 0 && <div className="mt-0.5 text-right text-xs text-warning-foreground">Falta receber {brl(p.t.saldo)}</div>}
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </>
  );
}
