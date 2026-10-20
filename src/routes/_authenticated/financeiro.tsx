import * as appQueries from "@/lib/queries";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { CalendarClock, CircleAlert, Receipt, Wallet, Search } from "lucide-react";
import { contasPagarQ, despesasQ } from "@/lib/queries";
import { brl, dataBR, hojeISO, mesISO } from "@/lib/format";
import { PageHeader, Stat, Empty, Field } from "@/components/app/ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

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

type AbaFinanceiro = "resumo" | "despesas" | "contas";

function Financeiro() {
  const { data: contas } = useSuspenseQuery(contasPagarQ);
  const { data: despesas } = useSuspenseQuery(despesasQ);
  const [aba, setAba] = useState<AbaFinanceiro>("resumo");
  const [busca, setBusca] = useState("");
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
  const contasOrdenadas = useMemo(
    () => [...contas].sort((a, b) => b.data_vencimento.localeCompare(a.data_vencimento)),
    [contas],
  );
  const termo = busca.trim().toLocaleLowerCase("pt-BR");
  const despesasFiltradas = despesasOrdenadas.filter((d) =>
    !termo || [d.descricao, d.categoria, d.data].some((v) => String(v ?? "").toLocaleLowerCase("pt-BR").includes(termo)),
  );
  const contasFiltradas = contasOrdenadas.filter((c) =>
    !termo || [c.descricao, c.fornecedor, c.status, c.data_vencimento].some((v) => String(v ?? "").toLocaleLowerCase("pt-BR").includes(termo)),
  );
  const proximasContas = [...contasAbertas]
    .sort((a, b) => a.data_vencimento.localeCompare(b.data_vencimento))
    .slice(0, 5);
  const despesasRecentes = despesasOrdenadas.slice(0, 5);

  return (
    <>
      <PageHeader title="Financeiro" back="/mais" />
      <p className="mb-5 text-sm text-muted-foreground">
        Consulte despesas e contas a pagar no mesmo lugar. Os históricos, pagamentos e estornos continuam separados para preservar a rastreabilidade e evitar duplicidade nos relatórios.
      </p>

      <div className="mb-5 grid grid-cols-2 gap-3">
        <Stat label="Saldo a pagar" value={brl(saldoAberto)} />
        <Stat label="Contas vencidas" value={brl(saldoVencido)} tone={saldoVencido > 0 ? "danger" : "default"} />
        <Stat label="Pago registrado" value={brl(totalPago)} tone="primary" />
        <Stat label="Despesas deste mês" value={brl(totalDespesasMes)} />
      </div>

      <div className="mb-5 grid grid-cols-3 gap-2" role="tablist" aria-label="Seções do financeiro">
        <Button type="button" size="sm" variant={aba === "resumo" ? "default" : "outline"} onClick={() => { setAba("resumo"); setBusca(""); }}>Resumo</Button>
        <Button type="button" size="sm" variant={aba === "despesas" ? "default" : "outline"} onClick={() => { setAba("despesas"); setBusca(""); }}>Despesas</Button>
        <Button type="button" size="sm" variant={aba === "contas" ? "default" : "outline"} onClick={() => { setAba("contas"); setBusca(""); }}>Contas a pagar</Button>
      </div>

      {aba === "resumo" ? (
        <>
          <div className="mb-7 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Button asChild className="h-12">
              <Link to="/despesas"><Receipt className="mr-2 size-4" /> Registrar despesa</Link>
            </Button>
            <Button asChild variant="outline" className="h-12">
              <Link to="/contas-pagar"><CalendarClock className="mr-2 size-4" /> Gerenciar contas a pagar</Link>
            </Button>
          </div>

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
      ) : (
        <>
          <div className="mb-4 flex items-end gap-3">
            <div className="min-w-0 flex-1">
              <Field label="Buscar por descrição, fornecedor, categoria ou data">
                <Input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Digite para filtrar..." className="h-11" />
              </Field>
            </div>
            <Button asChild className="h-11 shrink-0">
              <Link to={aba === "despesas" ? "/despesas" : "/contas-pagar"}>
                {aba === "despesas" ? <Receipt className="mr-2 size-4" /> : <Wallet className="mr-2 size-4" />}
                {aba === "despesas" ? "Nova despesa" : "Gerenciar"}
              </Link>
            </Button>
          </div>
          {aba === "despesas" ? (
            !despesasFiltradas.length ? <Empty>Nenhuma despesa corresponde à busca.</Empty> : (
              <div className="divide-y rounded-xl border px-3">
                {despesasFiltradas.map((despesa) => (
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
            )
          ) : (
            !contasFiltradas.length ? <Empty>Nenhuma conta corresponde à busca.</Empty> : (
              <div className="divide-y rounded-xl border px-3">
                {contasFiltradas.map((conta) => {
                  const saldo = Math.max(0, Number(conta.valor) - Number(conta.valor_pago));
                  const cancelada = Boolean(conta.cancelada_em) || conta.status === "cancelado";
                  const vencida = !cancelada && saldo > 0 && conta.data_vencimento < hoje;
                  return (
                    <div key={conta.id} className="flex items-start gap-3 py-3">
                      {vencida ? <CircleAlert className="mt-0.5 size-4 shrink-0 text-destructive" /> : <CalendarClock className="mt-0.5 size-4 shrink-0 text-muted-foreground" />}
                      <div className="min-w-0 flex-1">
                        <p className="break-words font-medium">{conta.descricao}</p>
                        <p className="text-xs text-muted-foreground">
                          {conta.fornecedor ? conta.fornecedor + " · " : ""}{dataBR(conta.data_vencimento)} · {cancelada ? "Cancelada" : conta.status === "pago" ? "Paga" : conta.status === "parcial" ? "Parcial" : "Pendente"}
                        </p>
                        {conta.status === "parcial" && <p className="mt-1 text-xs text-muted-foreground">Pago: {brl(conta.valor_pago)}</p>}
                      </div>
                      <div className="text-right">
                        <b className="whitespace-nowrap text-sm">{brl(conta.valor)}</b>
                        {!cancelada && saldo > 0 && <p className="text-xs text-muted-foreground">Saldo {brl(saldo)}</p>}
                      </div>
                    </div>
                  );
                })}
              </div>
            )
          )}
          <p className="mt-4 flex items-start gap-2 rounded-lg bg-muted/50 p-3 text-xs text-muted-foreground">
            <Search className="mt-0.5 size-4 shrink-0" />
            Esta tela centraliza a consulta. Para editar registros, lançar pagamentos ou estornos, use o botão de gerenciamento; as regras atuais e o histórico financeiro são preservados.
          </p>
        </>
      )}

      <div className="mt-6 rounded-lg bg-muted/50 p-3 text-xs text-muted-foreground">
        Despesas registradas e contas a pagar permanecem em registros separados. Não some compras, contas e pagamentos automaticamente: os relatórios existentes continuam responsáveis por aplicar as regras contra dupla contagem.
      </div>
    </>
  );
}
