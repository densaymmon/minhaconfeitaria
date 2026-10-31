import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { ArrowDownRight, ArrowUpRight, ChevronLeft, ChevronRight, Minus } from "lucide-react";
import { produtosProntosQ, saldoEstoqueQ, type ContaPagar } from "@/lib/queries";
import { useCustos, usePedidosCalc } from "@/lib/hooks";
import { brl, hojeISO, mesISO, num } from "@/lib/format";
import { deslocarMes, nomeMes } from "@/lib/resumo-mes";
import { saudeDoMes, valorEstoqueInsumos, valorEstoquePronto } from "@/lib/saude-financeira";
import { Card } from "@/components/app/ui";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Despesa = { data: string; valor: number | string; categoria?: string | null };

/** Variação em relação ao mês anterior; `inverter` quando subir é ruim (custos). */
function Variacao({ valor, mes, inverter = false }: { valor: number | null; mes: string; inverter?: boolean }) {
  const anterior = nomeMes(deslocarMes(mes, -1)).split(" ")[0];
  if (valor === null) return <span className="flex items-center gap-1 text-xs text-muted-foreground"><Minus className="size-3" /> sem {anterior} para comparar</span>;
  const bom = valor === 0 ? null : inverter ? valor < 0 : valor > 0;
  return (
    <span className={cn("flex items-center gap-1 text-xs", bom === null ? "text-muted-foreground" : bom ? "text-success" : "text-destructive")}>
      {valor >= 0 ? <ArrowUpRight className="size-3" /> : <ArrowDownRight className="size-3" />}
      {valor > 0 ? "+" : ""}{num(valor, 1)}% vs. {anterior}
    </span>
  );
}

/**
 * Saúde financeira do mês numa tela só: vendido, custo de produção, resultado, contas a pagar
 * e valor parado em estoque. O resultado considera todos os pedidos não cancelados do mês
 * (pela data de entrega), como o "Resumo do mês".
 */
export function SaudeDoMes({ contas, despesas }: { contas: ContaPagar[]; despesas: Despesa[] }) {
  const pedidos = usePedidosCalc("historico");
  const { insumos, custo } = useCustos();
  const { data: saldos, isLoading: carregandoSaldos, isError: erroSaldos } = useQuery(saldoEstoqueQ);
  const { data: prontos, isLoading: carregandoProntos } = useQuery(produtosProntosQ);
  const [mes, setMes] = useState(mesISO());
  const hoje = hojeISO();
  const ehAtual = mes >= mesISO();

  const saude = useMemo(
    () => saudeDoMes({
      pedidos,
      despesas: despesas.map((d) => ({ data: d.data, valor: Number(d.valor), categoria: d.categoria ?? null })),
      contas,
      mes,
      hoje,
    }),
    [pedidos, despesas, contas, mes, hoje],
  );
  const estoqueInsumos = useMemo(() => valorEstoqueInsumos(saldos ?? [], insumos), [saldos, insumos]);
  const estoquePronto = useMemo(() => valorEstoquePronto(prontos ?? [], custo), [prontos, custo]);
  const carregandoEstoque = carregandoSaldos || carregandoProntos;
  const totalEstoque = estoqueInsumos.total + estoquePronto.total;
  const { resumo, contas: pagar } = saude;
  const resultadoPositivo = resumo.resultado >= 0;

  return (
    <section className="mb-6" aria-label="Saúde financeira do mês">
      <div className="mb-3 flex items-center justify-between gap-2 rounded-2xl bg-card p-2 shadow-soft">
        <Button type="button" variant="ghost" size="icon" onClick={() => setMes((m) => deslocarMes(m, -1))} aria-label="Mês anterior"><ChevronLeft className="size-5" /></Button>
        <span className="font-semibold capitalize">{nomeMes(mes)}</span>
        <Button type="button" variant="ghost" size="icon" disabled={ehAtual} onClick={() => setMes((m) => deslocarMes(m, 1))} aria-label="Próximo mês"><ChevronRight className="size-5" /></Button>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Card className="p-4">
          <div className="text-xs text-muted-foreground">Vendido no mês</div>
          <div className="mt-1 font-display text-2xl font-bold tabular-nums">{brl(resumo.vendas)}</div>
          <Variacao valor={saude.variacaoVendas} mes={mes} />
          <div className="mt-2 space-y-0.5 text-xs text-muted-foreground">
            <div className="flex justify-between gap-2"><span>Já recebido</span><span className="tabular-nums">{brl(saude.recebido)}</span></div>
            <div className="flex justify-between gap-2"><span>A receber</span><span className={cn("tabular-nums", saude.aReceber > 0 && "font-medium text-warning-foreground")}>{brl(saude.aReceber)}</span></div>
          </div>
        </Card>

        <Card className="p-4">
          <div className="text-xs text-muted-foreground">Custo de produção</div>
          <div className="mt-1 font-display text-2xl font-bold tabular-nums">{brl(resumo.custoProdutos)}</div>
          <div className="text-xs text-muted-foreground">{resumo.pedidos} pedido(s) no mês</div>
          <div className="mt-2 space-y-0.5 text-xs text-muted-foreground">
            <div className="flex justify-between gap-2"><span>Lucro bruto</span><span className="tabular-nums">{brl(resumo.lucroBruto)}</span></div>
            <div className="flex justify-between gap-2"><span>Margem bruta</span><span className={cn("tabular-nums", saude.margemBruta < 0 && "font-medium text-destructive")}>{num(saude.margemBruta, 1)}%</span></div>
          </div>
        </Card>

        <Card className={cn("p-4", resultadoPositivo ? "ring-1 ring-success/30" : "ring-1 ring-destructive/30")}>
          <div className="text-xs text-muted-foreground">Resultado do mês</div>
          <div className={cn("mt-1 font-display text-2xl font-bold tabular-nums", resultadoPositivo ? "text-success" : "text-destructive")}>{brl(resumo.resultado)}</div>
          <Variacao valor={saude.variacaoResultado} mes={mes} />
          <div className="mt-2 space-y-0.5 text-xs text-muted-foreground">
            <div className="flex justify-between gap-2"><span>Taxas e impostos</span><span className="tabular-nums">{brl(resumo.taxas)}</span></div>
            <div className="flex justify-between gap-2"><span>Despesas</span><span className="tabular-nums">{brl(resumo.despesas)}</span></div>
          </div>
        </Card>

        <Card className={cn("p-4", pagar.vencido > 0 && "ring-1 ring-destructive/30")}>
          <div className="text-xs text-muted-foreground">Contas a pagar</div>
          <div className="mt-1 font-display text-2xl font-bold tabular-nums">{brl(pagar.aberto)}</div>
          <div className="text-xs text-muted-foreground">{pagar.quantidade} conta(s) em aberto</div>
          <div className="mt-2 space-y-0.5 text-xs text-muted-foreground">
            <div className="flex justify-between gap-2"><span>Vencidas</span><span className={cn("tabular-nums", pagar.vencido > 0 && "font-semibold text-destructive")}>{brl(pagar.vencido)}</span></div>
            <div className="flex justify-between gap-2"><span>Vencem em 7 dias</span><span className="tabular-nums">{brl(pagar.proximos)}</span></div>
          </div>
        </Card>

        <Card className="col-span-2 p-4">
          <div className="text-xs text-muted-foreground">Valor em estoque (ao custo)</div>
          <div className="mt-1 font-display text-2xl font-bold tabular-nums">{carregandoEstoque ? "…" : brl(totalEstoque)}</div>
          {!carregandoEstoque && (
            <div className="mt-2 grid grid-cols-1 gap-x-6 gap-y-0.5 text-xs text-muted-foreground sm:grid-cols-2">
              <div className="flex justify-between gap-2">
                <span>Insumos{erroSaldos ? " (indisponível)" : estoqueInsumos.itens ? ` · ${estoqueInsumos.itens} item(ns)` : ""}</span>
                <span className="tabular-nums">{brl(estoqueInsumos.total)}</span>
              </div>
              <div className="flex justify-between gap-2">
                <span>Produtos prontos{estoquePronto.unidades ? ` · ${num(estoquePronto.unidades)} un.` : ""}</span>
                <span className="tabular-nums">{brl(estoquePronto.total)}</span>
              </div>
            </div>
          )}
          {!carregandoEstoque && (estoqueInsumos.negativos > 0 || estoqueInsumos.semValor > 0 || estoquePronto.semCusto > 0) && (
            <p className="mt-2 text-xs text-warning-foreground">
              {[
                estoqueInsumos.negativos > 0 && `${estoqueInsumos.negativos} insumo(s) com saldo negativo (conte o estoque em Compras)`,
                estoqueInsumos.semValor > 0 && `${estoqueInsumos.semValor} insumo(s) sem preço ou medida utilizável`,
                estoquePronto.semCusto > 0 && `${estoquePronto.semCusto} produto(s) pronto(s) sem custo calculado`,
              ].filter(Boolean).join(" · ")}. Esses itens ficam fora do valor.
            </p>
          )}
          <p className="mt-2 text-xs text-muted-foreground">O saldo de insumos só considera movimentações registradas depois de ativar o controle de estoque.</p>
        </Card>
      </div>

      <p className="mt-3 text-xs text-muted-foreground">
        O resultado considera todos os pedidos não cancelados do mês, pela data de entrega (inclusive os ainda não entregues): vendas − custo dos produtos − taxas − despesas. Compras de insumos não entram, porque o custo dos produtos já as representa.{" "}
        <Link to="/resumo-mes" className="font-medium text-primary underline underline-offset-4">Ver resumo completo</Link>
      </p>
    </section>
  );
}
