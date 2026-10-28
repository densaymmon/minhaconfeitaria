import * as appQueries from "@/lib/queries";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { ArrowDownRight, ArrowUpRight, ChevronLeft, ChevronRight, Minus, Trophy } from "lucide-react";
import { usePedidosCalc } from "@/lib/hooks";
import { brl, mesISO, num } from "@/lib/format";
import { deslocarMes, nomeMes, resumoDoMes, variacao } from "@/lib/resumo-mes";
import { Card, PageHeader } from "@/components/app/ui";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/resumo-mes")({
  loader: async ({ context }) => {
    await Promise.all([
      context.queryClient.ensureQueryData(appQueries.pedidosHistoricoQ),
      context.queryClient.ensureQueryData(appQueries.configQ),
      context.queryClient.ensureQueryData(appQueries.pedidoPagamentosQ),
      context.queryClient.ensureQueryData(appQueries.despesasQ),
    ]);
  },
  errorComponent: ({ error }) => <p role="alert" className="py-8 text-destructive">{error instanceof Error ? error.message : "Não foi possível carregar o resumo."}</p>,
  head: () => ({ meta: [{ title: "Resumo do mês — Doce Gestão" }, { name: "description", content: "Vendas, custos, despesas e lucro do mês, comparados com o mês anterior." }] }),
  component: ResumoMesPage,
});

function ResumoMesPage() {
  const pedidos = usePedidosCalc("historico");
  const { data: despesas } = useSuspenseQuery(appQueries.despesasQ);
  const [mes, setMes] = useState(mesISO());
  const atual = useMemo(() => resumoDoMes(pedidos, despesas.map((d) => ({ data: d.data, valor: Number(d.valor), categoria: d.categoria })), mes), [pedidos, despesas, mes]);
  const anterior = useMemo(() => resumoDoMes(pedidos, despesas.map((d) => ({ data: d.data, valor: Number(d.valor), categoria: d.categoria })), deslocarMes(mes, -1)), [pedidos, despesas, mes]);
  const ehAtual = mes >= mesISO();
  const maiorLucro = Math.max(1, ...atual.produtos.map((p) => Math.abs(p.lucro)));

  const cards: { rotulo: string; valor: number; antes: number; dinheiro?: boolean; inverter?: boolean; destaque?: boolean }[] = [
    { rotulo: "Vendas", valor: atual.vendas, antes: anterior.vendas, dinheiro: true },
    { rotulo: "Lucro do mês", valor: atual.resultado, antes: anterior.resultado, dinheiro: true, destaque: true },
    { rotulo: "Pedidos", valor: atual.pedidos, antes: anterior.pedidos },
    { rotulo: "Ticket médio", valor: atual.ticketMedio, antes: anterior.ticketMedio, dinheiro: true },
    { rotulo: "Custo dos produtos", valor: atual.custoProdutos, antes: anterior.custoProdutos, dinheiro: true, inverter: true },
    { rotulo: "Despesas", valor: atual.despesas, antes: anterior.despesas, dinheiro: true, inverter: true },
  ];

  return (
    <>
      <PageHeader title="Resumo do mês" subtitle="Pela data de entrega dos pedidos" back="/mais" />

      <div className="mb-4 flex items-center justify-between gap-2 rounded-2xl bg-card p-2 shadow-soft">
        <Button type="button" variant="ghost" size="icon" onClick={() => setMes((m) => deslocarMes(m, -1))} aria-label="Mês anterior"><ChevronLeft className="size-5" /></Button>
        <span className="font-semibold capitalize">{nomeMes(mes)}</span>
        <Button type="button" variant="ghost" size="icon" disabled={ehAtual} onClick={() => setMes((m) => deslocarMes(m, 1))} aria-label="Próximo mês"><ChevronRight className="size-5" /></Button>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        {cards.map((c) => {
          const v = variacao(c.valor, c.antes);
          const bom = v === null || v === 0 ? null : c.inverter ? v < 0 : v > 0;
          return (
            <Card key={c.rotulo} className={cn("p-4", c.destaque && (c.valor >= 0 ? "ring-1 ring-success/30" : "ring-1 ring-destructive/30"))}>
              <div className="text-xs text-muted-foreground">{c.rotulo}</div>
              <div className={cn("mt-1 font-display text-2xl font-bold tabular-nums", c.destaque && (c.valor >= 0 ? "text-success" : "text-destructive"))}>{c.dinheiro ? brl(c.valor) : num(c.valor)}</div>
              <div className={cn("mt-1 flex items-center gap-1 text-xs", bom === null ? "text-muted-foreground" : bom ? "text-success" : "text-destructive")}>
                {v === null ? <Minus className="size-3" /> : v >= 0 ? <ArrowUpRight className="size-3" /> : <ArrowDownRight className="size-3" />}
                {v === null ? "sem mês anterior para comparar" : `${v > 0 ? "+" : ""}${num(v, 1)}% vs. ${nomeMes(deslocarMes(mes, -1)).split(" ")[0]}`}
              </div>
            </Card>
          );
        })}
      </div>

      <Card className="mt-4 space-y-2 p-4 text-sm">
        <h2 className="font-semibold">Como chegamos no lucro</h2>
        <Linha rotulo="Vendas" valor={atual.vendas} />
        <Linha rotulo="(−) Custo dos produtos" valor={-atual.custoProdutos} />
        <Linha rotulo="(−) Taxas e impostos" valor={-atual.taxas} />
        <Linha rotulo="(−) Despesas" valor={-atual.despesas} />
        <div className="flex justify-between border-t pt-2 font-semibold"><span>Lucro do mês</span><span className={cn("tabular-nums", atual.resultado < 0 && "text-destructive")}>{brl(atual.resultado)}</span></div>
        <p className="text-xs text-muted-foreground">Margem: {num(atual.margem, 1)}% das vendas. O custo dos produtos vem das fichas técnicas no momento de cada pedido.</p>
      </Card>

      <Card className="mt-4 p-4">
        <h2 className="mb-3 flex items-center gap-2 font-semibold"><Trophy className="size-4 text-primary" /> Produtos que mais deram lucro</h2>
        {atual.produtos.length === 0 ? <p className="text-sm text-muted-foreground">Nenhuma venda neste mês.</p> : (
          <ul className="space-y-3">
            {atual.produtos.slice(0, 8).map((p) => (
              <li key={p.nome}>
                <div className="flex items-baseline justify-between gap-2 text-sm">
                  <span className="min-w-0 truncate font-medium">{p.nome}</span>
                  <span className={cn("shrink-0 font-semibold tabular-nums", p.lucro < 0 && "text-destructive")}>{brl(p.lucro)}</span>
                </div>
                <div className="mt-1 h-2 overflow-hidden rounded-full bg-muted"><div className={cn("h-full rounded-full", p.lucro >= 0 ? "bg-success" : "bg-destructive")} style={{ width: `${Math.round((Math.abs(p.lucro) / maiorLucro) * 100)}%` }} /></div>
                <div className="mt-0.5 text-xs text-muted-foreground">{num(p.quantidade)} vendido(s) · vendas {brl(p.receita)} · custo {brl(p.custo)}{p.custo === 0 ? " (sem ficha técnica)" : ""}</div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {atual.despesasPorCategoria.length > 0 && (
        <Card className="mt-4 space-y-2 p-4 text-sm">
          <h2 className="font-semibold">Despesas por categoria</h2>
          {atual.despesasPorCategoria.map((d) => <div key={d.categoria} className="flex justify-between"><span>{d.categoria}</span><span className="tabular-nums">{brl(d.valor)}</span></div>)}
        </Card>
      )}

      <div className="mt-4 pb-6">
        <Button asChild variant="outline" className="w-full sm:w-auto"><Link to="/relatorios" search={{ inicio: `${mes}-01`, fim: ultimoDia(mes), secao: "visao-geral", dataBase: "entrega" }}>Ver relatórios completos</Link></Button>
      </div>
    </>
  );
}

function Linha({ rotulo, valor }: { rotulo: string; valor: number }) {
  return <div className="flex justify-between"><span className="text-muted-foreground">{rotulo}</span><span className="tabular-nums">{brl(valor)}</span></div>;
}

function ultimoDia(mes: string) {
  const [a, m] = mes.split("-").map(Number);
  return new Date(Date.UTC(a ?? 1970, m ?? 1, 0)).toISOString().slice(0, 10);
}
