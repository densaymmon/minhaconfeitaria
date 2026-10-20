import * as appQueries from "@/lib/queries";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { CalendarClock, CircleAlert, Receipt } from "lucide-react";
import { contasPagarQ, despesasQ } from "@/lib/queries";
import { brl, dataBR, hojeISO, mesISO } from "@/lib/format";
import { PageHeader, Stat, Empty } from "@/components/app/ui";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/financeiro")({
  loader: async ({ context }) => {
    await Promise.all([
      context.queryClient.ensureQueryData(appQueries.contasPagarQ),
      context.queryClient.ensureQueryData(appQueries.despesasQ),
    ]);
  },
  errorComponent: ({ error }) => (
    <p role="alert" className="py-8 text-destructive">
      {error instanceof Error ? error.message : "Não foi possível carregar o financeiro."}
    </p>
  ),
  component: Financeiro,
});

function Financeiro() {
  const { data: contas } = useSuspenseQuery(contasPagarQ);
  const { data: despesas } = useSuspenseQuery(despesasQ);
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
  const proximasContas = [...contasAbertas]
    .sort((a, b) => a.data_vencimento.localeCompare(b.data_vencimento))
    .slice(0, 5);
  const despesasRecentes = [...despesas].sort((a, b) => b.data.localeCompare(a.data)).slice(0, 5);

  return (
    <>
      <PageHeader title="Financeiro" back="/mais" />
      <p className="mb-5 text-sm text-muted-foreground">
        Visão conjunta das despesas registradas e das obrigações a pagar. Os registros e históricos continuam separados para evitar duplicidade nos relatórios.
      </p>

      <div className="mb-6 grid grid-cols-2 gap-3">
        <Stat label="Saldo a pagar" value={brl(saldoAberto)} />
        <Stat label="Contas vencidas" value={brl(saldoVencido)} tone={saldoVencido > 0 ? "danger" : "default"} />
        <Stat label="Pago registrado" value={brl(totalPago)} tone="primary" />
        <Stat label="Despesas deste mês" value={brl(totalDespesasMes)} />
      </div>

      <div className="mb-7 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Button asChild className="h-12">
          <Link to="/despesas"><Receipt className="mr-2 size-4" /> Registrar e consultar despesas</Link>
        </Button>
        <Button asChild variant="outline" className="h-12">
          <Link to="/contas-pagar"><CalendarClock className="mr-2 size-4" /> Gerenciar contas a pagar</Link>
        </Button>
      </div>

      <section className="mb-7">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">Próximas contas a pagar</h2>
          <Link to="/contas-pagar" className="text-sm font-medium text-primary">Ver todas</Link>
        </div>
        {!proximasContas.length ? (
          <Empty>Nenhuma conta em aberto.</Empty>
        ) : (
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
          <Link to="/despesas" className="text-sm font-medium text-primary">Ver todas</Link>
        </div>
        {!despesasRecentes.length ? (
          <Empty>Nenhuma despesa registrada.</Empty>
        ) : (
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

      <div className="mt-6 rounded-lg bg-muted/50 p-3 text-xs text-muted-foreground">
        As despesas registradas e as contas a pagar não são somadas automaticamente entre si. Compras de insumos e pagamentos vinculados continuam seguindo as regras atuais do relatório financeiro.
      </div>
    </>
  );
}
