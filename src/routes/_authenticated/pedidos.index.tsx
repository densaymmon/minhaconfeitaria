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
  head: () => ({
    meta: [
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
  const [busca, setBusca] = useState("");
  const [status, setStatus] = useState<string>("abertos");
  const hoje = hojeISO();

  const lista = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return pedidos.filter((p) => {
      if (status === "abertos" && ["entregue", "cancelado"].includes(p.status)) return false;
      if (status !== "abertos" && status !== "todos" && p.status !== status) return false;
      if (!q) return true;
      return (
        String(p.numero) === q.replace("#", "") ||
        (p.clientes?.nome ?? "").toLowerCase().includes(q) ||
        (p.observacoes ?? "").toLowerCase().includes(q) ||
        p.pedido_itens.some((i) => i.descricao.toLowerCase().includes(q))
      );
    });
  }, [pedidos, busca, status]);

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

  const filtros = [{ value: "abertos", label: "Em aberto" }, { value: "todos", label: "Todos" }, ...STATUS];

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
            const atrasado = p.data_entrega < hoje && !["entregue", "cancelado"].includes(p.status);
            return (
              <Link key={p.id} to="/pedidos/$id" params={{ id: p.id }} className="block">
                <Card className="p-3.5">
                  <div className="flex items-center justify-between gap-2">
                    <div className="font-semibold">#{p.numero} · {p.clientes?.nome ?? "Sem cliente"}</div>
                    <StatusBadge status={p.status} />
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
