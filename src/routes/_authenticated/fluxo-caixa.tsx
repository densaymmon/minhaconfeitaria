import * as appQueries from "@/lib/queries";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { ArrowDownCircle, ArrowUpCircle, TrendingUp } from "lucide-react";
import { usePedidosCalc } from "@/lib/hooks";
import { brl, dataBR, hojeISO } from "@/lib/format";
import { fluxoDeCaixa, type Movimento } from "@/lib/gestao";
import { Card, PageHeader } from "@/components/app/ui";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/fluxo-caixa")({
  loader: async ({ context }) => {
    await Promise.all([
      context.queryClient.ensureQueryData(appQueries.pedidosQ),
      context.queryClient.ensureQueryData(appQueries.configQ),
      context.queryClient.ensureQueryData(appQueries.pedidoPagamentosQ),
      context.queryClient.ensureQueryData(appQueries.contasPagarQ),
    ]);
  },
  errorComponent: ({ error }) => <p role="alert" className="py-8 text-destructive">{error instanceof Error ? error.message : "Não foi possível carregar o fluxo de caixa."}</p>,
  head: () => ({ meta: [{ title: "Fluxo de caixa — Doce Gestão" }, { name: "description", content: "O que vai entrar e sair nas próximas semanas." }] }),
  component: FluxoCaixaPage,
});

function FluxoCaixaPage() {
  const pedidos = usePedidosCalc();
  const { data: contas } = useSuspenseQuery(appQueries.contasPagarQ);
  const hoje = hojeISO();
  const [semanas, setSemanas] = useState(8);

  const entradas: Movimento[] = useMemo(() => pedidos
    .filter((p) => p.status !== "cancelado" && p.t.saldo > 0.009)
    .map((p) => ({ data: p.data_entrega, valor: p.t.saldo, descricao: `Pedido #${p.numero} · ${p.clientes?.nome ?? "Sem cliente"}` })), [pedidos]);
  const saidas: Movimento[] = useMemo(() => contas
    .filter((c) => !c.cancelada_em && c.status !== "cancelado" && c.status !== "pago" && Number(c.valor) - Number(c.valor_pago ?? 0) > 0.009)
    .map((c) => ({ data: c.data_vencimento, valor: Math.round((Number(c.valor) - Number(c.valor_pago ?? 0)) * 100) / 100, descricao: c.descricao + (c.fornecedor ? ` · ${c.fornecedor}` : "") })), [contas]);
  const fluxo = fluxoDeCaixa(entradas, saidas, hoje, semanas);
  const maior = Math.max(1, ...fluxo.flatMap((s) => [s.entradas, s.saidas]));
  const fimPeriodo = fluxo[fluxo.length - 1]?.fim ?? hoje;
  const proximas = [...entradas.map((m) => ({ ...m, tipo: "entrada" as const })), ...saidas.map((m) => ({ ...m, tipo: "saida" as const }))]
    .filter((m) => m.data <= fimPeriodo)
    .sort((a, b) => a.data.localeCompare(b.data))
    .slice(0, 30);
  const negativa = fluxo.find((s) => s.acumulado < 0);

  return (
    <>
      <PageHeader title="Fluxo de caixa" subtitle="Saldos de pedidos a receber e contas a pagar, por semana" back="/mais" />
      <div className="mb-4 flex gap-2">
        {[4, 8, 12].map((n) => <Button key={n} type="button" size="sm" variant={semanas === n ? "default" : "outline"} onClick={() => setSemanas(n)}>{n} semanas</Button>)}
      </div>

      {negativa && (
        <p role="alert" className="mb-4 rounded-xl bg-destructive/10 p-3 text-sm text-destructive">
          Atenção: na semana {negativa.rotulo.toLowerCase()} as contas passam o que entra ({brl(negativa.acumulado)} no acumulado). Antecipe recebimentos ou renegocie vencimentos.
        </p>
      )}

      <Card className="space-y-3">
        <h2 className="flex items-center gap-2 font-semibold"><TrendingUp className="size-4 text-primary" /> Por semana</h2>
        <ul className="space-y-3">
          {fluxo.map((s) => (
            <li key={s.inicio} className="space-y-1">
              <div className="flex items-baseline justify-between gap-2 text-sm">
                <span className="font-medium">{s.rotulo}</span>
                <span className={cn("tabular-nums", s.saldo < 0 ? "text-destructive" : "text-success")}>{s.saldo >= 0 ? "+" : ""}{brl(s.saldo)}</span>
              </div>
              <div className="grid grid-cols-[4.5rem_1fr] items-center gap-x-2 gap-y-1 text-xs">
                <span className="text-muted-foreground">Entra</span>
                <div className="flex items-center gap-2"><div className="h-2 rounded-full bg-success" style={{ width: `${Math.max(2, (s.entradas / maior) * 100)}%` }} /><span className="tabular-nums">{brl(s.entradas)}</span></div>
                <span className="text-muted-foreground">Sai</span>
                <div className="flex items-center gap-2"><div className="h-2 rounded-full bg-destructive/70" style={{ width: `${Math.max(2, (s.saidas / maior) * 100)}%` }} /><span className="tabular-nums">{brl(s.saidas)}</span></div>
              </div>
              <p className="text-xs text-muted-foreground">Acumulado: <span className={cn("font-medium tabular-nums", s.acumulado < 0 && "text-destructive")}>{brl(s.acumulado)}</span></p>
            </li>
          ))}
        </ul>
        <p className="text-xs text-muted-foreground">A 1ª semana inclui o que está atrasado. Entradas = saldo em aberto dos pedidos na data de entrega; saídas = contas a pagar pendentes no vencimento.</p>
      </Card>

      <Card className="mt-4 space-y-2 pb-2">
        <h2 className="font-semibold">Próximos lançamentos</h2>
        {proximas.length === 0 ? <p className="text-sm text-muted-foreground">Nada previsto no período.</p> : (
          <ul className="divide-y text-sm">
            {proximas.map((m, i) => (
              <li key={i} className="flex items-center gap-2 py-2">
                {m.tipo === "entrada" ? <ArrowDownCircle className="size-4 shrink-0 text-success" /> : <ArrowUpCircle className="size-4 shrink-0 text-destructive" />}
                <span className={cn("w-20 shrink-0 tabular-nums", m.data < hoje && "font-medium text-destructive")}>{dataBR(m.data).slice(0, 5)}{m.data < hoje ? " ⚠" : ""}</span>
                <span className="min-w-0 flex-1 truncate">{m.descricao}</span>
                <span className={cn("shrink-0 tabular-nums", m.tipo === "saida" && "text-destructive")}>{m.tipo === "saida" ? "−" : ""}{brl(m.valor)}</span>
              </li>
            ))}
          </ul>
        )}
        <div className="flex gap-3 pt-1 text-sm">
          <Link to="/contas-pagar" className="text-primary hover:underline">Contas a pagar</Link>
          <Link to="/pedidos" className="text-primary hover:underline">Pedidos</Link>
        </div>
      </Card>
    </>
  );
}
