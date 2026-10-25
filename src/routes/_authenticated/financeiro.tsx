import * as appQueries from "@/lib/queries";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { CalendarClock, CircleAlert, Receipt, ShoppingCart } from "lucide-react";
import { contasPagarQ, despesasQ } from "@/lib/queries";
import { brl, dataBR, hojeISO, mesISO } from "@/lib/format";
import { PageHeader, Stat, Empty } from "@/components/app/ui";
import { Button } from "@/components/ui/button";
import { Despesas } from "./despesas";
import { ContasPagar } from "./contas-pagar";
import { RelatoriosEmbedded } from "./relatorios";

export const Route = createFileRoute("/_authenticated/financeiro")({
  loader: async ({ context }) => {
    await Promise.all([
      context.queryClient.ensureQueryData(appQueries.contasPagarQ),
      context.queryClient.ensureQueryData(appQueries.despesasQ),
      context.queryClient.ensureQueryData(appQueries.contasPagarPagamentosQ),
      context.queryClient.ensureQueryData(appQueries.contasPagarEstornosQ),
      context.queryClient.ensureQueryData(appQueries.comprasQ),
    ]);
  },
  errorComponent: ({ error }) => (
    <p role="alert" className="py-8 text-destructive">
      {error instanceof Error ? error.message : "Não foi possível carregar o financeiro."}
    </p>
  ),
  component: Financeiro,
});

type AbaFinanceiro = "resumo" | "despesas" | "contas" | "relatorio";

function Financeiro() {
  const { data: contas } = useSuspenseQuery(contasPagarQ);
  const { data: despesas } = useSuspenseQuery(despesasQ);
  const [aba, setAba] = useState<AbaFinanceiro>("resumo");
  const hoje = hojeISO();
  const inicioMes = mesISO() + "-01";
  const contasAtivas = contas.filter((conta) => !conta.cancelada_em && conta.status !== "cancelado");
  const contasAbertas = contasAtivas.filter((conta) => ["pendente", "parcial"].includes(conta.status));
  const saldoAberto = contasAbertas.reduce(
    (total, conta) => total + Math.max(0, Number(conta.valor) - Number(conta.valor_pago)),
    0,
  );
  const saldoVencido = contasAbertas
    .filter((conta) => conta.data_vencimento < hoje)
    .reduce((total, conta) => total + Math.max(0, Number(conta.valor) - Number(conta.valor_pago)), 0);
  const totalPago = contasAtivas.reduce((total, conta) => total + Math.max(0, Number(conta.valor_pago) || 0), 0);
  const despesasMes = despesas.filter((despesa) => despesa.data >= inicioMes && despesa.data <= hoje);
  const totalDespesasMes = despesasMes.reduce((total, despesa) => total + Math.max(0, Number(despesa.valor) || 0), 0);
  const despesasOrdenadas = useMemo(() => [...despesas].sort((a, b) => b.data.localeCompare(a.data)), [despesas]);
  const proximasContas = [...contasAbertas]
    .sort((a, b) => a.data_vencimento.localeCompare(b.data_vencimento))
    .slice(0, 5);
  const despesasRecentes = despesasOrdenadas.slice(0, 5);

  return (
    <>
      <PageHeader title="Financeiro" back="/mais" />
      <p className="mb-5 text-sm text-muted-foreground">
        Cadastre e acompanhe os gastos da confeitaria em um só lugar. Escolha o tipo de lançamento abaixo: compra de insumos movimenta o estoque; despesa registra um gasto operacional; conta a pagar controla uma obrigação futura ou parcelas do cartão.
      </p>

      <div className="mb-5 grid grid-cols-2 gap-3">
        <Stat label="Saldo a pagar" value={brl(saldoAberto)} />
        <Stat label="Contas vencidas" value={brl(saldoVencido)} tone={saldoVencido > 0 ? "danger" : "default"} />
        <Stat label="Pago registrado" value={brl(totalPago)} tone="primary" />
        <Stat label="Despesas deste mês" value={brl(totalDespesasMes)} />
      </div>

      <div className="mb-5 grid grid-cols-2 gap-2 sm:grid-cols-4" role="group" aria-label="Navegação do financeiro">
        <Button type="button" size="sm" variant={aba === "resumo" ? "default" : "outline"} onClick={() => { setAba("resumo"); }} aria-pressed={aba === "resumo"}>Resumo</Button>
        <Button type="button" size="sm" variant={aba === "despesas" ? "default" : "outline"} onClick={() => { setAba("despesas"); }} aria-pressed={aba === "despesas"}>Despesas</Button>
        <Button type="button" size="sm" variant={aba === "contas" ? "default" : "outline"} onClick={() => { setAba("contas"); }} aria-pressed={aba === "contas"}>Contas a pagar</Button>
        <Button type="button" size="sm" variant={aba === "relatorio" ? "default" : "outline"} onClick={() => { setAba("relatorio"); }} aria-pressed={aba === "relatorio"}>Relatório financeiro</Button>
      </div>

      {aba === "relatorio" ? (
        <RelatoriosEmbedded />
      ) : aba === "resumo" ? (
        <>
          <section className="mb-7 rounded-xl border p-4">
            <h2 className="mb-1 font-semibold">Cadastrar lançamento</h2>
            <p className="mb-3 text-sm text-muted-foreground">
              Use o caminho adequado para evitar registrar o mesmo gasto duas vezes.
            </p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <Button asChild className="h-12">
                <Link to="/compras" search={{ secao: "compras" }}><ShoppingCart className="mr-2 size-4" /> Compra de insumos</Link>
              </Button>
              <Button type="button" variant="outline" className="h-12" onClick={() => setAba("despesas")}>
                <Receipt className="mr-2 size-4" /> Despesa operacional
              </Button>
              <Button type="button" variant="outline" className="h-12" onClick={() => setAba("contas")}>
                <CalendarClock className="mr-2 size-4" /> Conta a pagar / crédito
              </Button>
            </div>
          </section>

          <section className="mb-7">
            <div className="mb-3 flex items-center justify-between gap-3">
              <h2 className="text-lg font-semibold">Próximas contas a pagar</h2>
              <Button type="button" variant="link" className="h-auto p-0" onClick={() => setAba("contas")}>Ver todas</Button>
            </div>
            {!proximasContas.length ? <Empty>Nenhuma conta em aberto.</Empty> : (
              <div className="divide-y rounded-xl border px-3">
                {proximasContas.map((conta) => {
                  const saldo = Math.max(0, Number(conta.valor) - Number(conta.valor_pago));
                  const vencida = conta.data_vencimento < hoje;
                  return (
                    <div key={conta.id} className="flex items-start gap-3 py-3">
                      {vencida ? <CircleAlert className="mt-0.5 size-4 shrink-0 text-destructive" /> : <CalendarClock className="mt-0.5 size-4 shrink-0 text-muted-foreground" />}
                      <div className="min-w-0 flex-1">
                        <p className="break-words font-medium">{conta.descricao}</p>
                        <p className={vencida ? "text-xs text-destructive" : "text-xs text-muted-foreground"}>
                          {vencida ? "Vencida" : "Vencimento"}: {dataBR(conta.data_vencimento)}
                        </p>
                      </div>
                      <b className="whitespace-nowrap text-sm">{brl(saldo)}</b>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          <section>
            <div className="mb-3 flex items-center justify-between gap-3">
              <h2 className="text-lg font-semibold">Despesas recentes</h2>
              <Button type="button" variant="link" className="h-auto p-0" onClick={() => setAba("despesas")}>Ver todas</Button>
            </div>
            {!despesasRecentes.length ? <Empty>Nenhuma despesa registrada.</Empty> : (
              <div className="divide-y rounded-xl border px-3">
                {despesasRecentes.map((despesa) => (
                  <div key={despesa.id} className="flex items-start gap-3 py-3">
                    <Receipt className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                    <div className="min-w-0 flex-1">
                      <p className="break-words font-medium">{despesa.descricao}</p>
                      <p className="text-xs text-muted-foreground">{dataBR(despesa.data)} · {despesa.categoria || "Sem categoria"}</p>
                    </div>
                    <b className="whitespace-nowrap text-sm">{brl(despesa.valor)}</b>
                  </div>
                ))}
              </div>
            )}
          </section>
        </>
      ) : aba === "despesas" ? (
        <Despesas embedded />
      ) : (
        <ContasPagar embedded />
      )}

      <div className="mt-6 rounded-lg bg-muted/50 p-3 text-xs text-muted-foreground">
        Despesas registradas e contas a pagar permanecem em registros separados. Não some compras, contas e pagamentos automaticamente: os relatórios existentes continuam responsáveis por aplicar as regras contra dupla contagem.
      </div>
    </>
  );
}
