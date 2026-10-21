import * as appQueries from "@/lib/queries";
import { createFileRoute } from "@tanstack/react-router";
import { useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Download, Pencil, XCircle, CreditCard, RotateCcw, History } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  contasPagarQ,
  contasPagarPagamentosQ,
  contasPagarEstornosQ,
  comprasQ,
  type ContaPagar,
  type ContaPagarPagamento,
} from "@/lib/queries";
import { brl, dataBR, hojeISO, parseNum } from "@/lib/format";
import { baixarCSV } from "@/lib/csv";
import { Empty, Field, PageHeader, Stat } from "@/components/app/ui";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/contas-pagar")({
  loader: async ({ context }) => {
    await Promise.all([
      context.queryClient.ensureQueryData(appQueries.contasPagarQ),
      context.queryClient.ensureQueryData(appQueries.contasPagarPagamentosQ),
      context.queryClient.ensureQueryData(appQueries.contasPagarEstornosQ),
      context.queryClient.ensureQueryData(appQueries.comprasQ),
    ]);
  },
  errorComponent: ({ error }) => (
    <p role="alert" className="py-8 text-destructive">
      {error instanceof Error ? error.message : "Não foi possível carregar as contas a pagar."}
    </p>
  ),
  head: () => ({
    meta: [
      { title: "Contas a pagar — Doce Gestão" },
      { name: "description", content: "Controle vencimentos, pagamentos e obrigações financeiras." },
    ],
  }),
  component: ContasPagar,
});

type AcaoFinanceira =
  | { tipo: "pagamento"; conta: ContaPagar }
  | { tipo: "estorno"; conta: ContaPagar; pagamento: ContaPagarPagamento; disponivel: number }
  | { tipo: "cancelamento"; conta: ContaPagar }
  | null;

export function ContasPagar({ embedded = false }: { embedded?: boolean }) {
  const { data: contas } = useSuspenseQuery(contasPagarQ);
  const { data: compras } = useSuspenseQuery(comprasQ);
  const { data: pagamentos } = useSuspenseQuery(contasPagarPagamentosQ);
  const { data: estornos } = useSuspenseQuery(contasPagarEstornosQ);
  const qc = useQueryClient();
  const blank = {
    descricao: "",
    fornecedor: "",
    data_emissao: hojeISO(),
    data_vencimento: hojeISO(),
    valor: "",
    forma_pagamento: "",
    compra_id: "",
    observacoes: "",
  };
  const [f, setF] = useState(blank);\n  const [buscaContas, setBuscaContas] = useState("");\n  const [filtroStatus, setFiltroStatus] = useState("todas");
  const [id, setId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [acao, setAcao] = useState<AcaoFinanceira>(null);
  const [valorPagamento, setValorPagamento] = useState("");
  const [dataPagamento, setDataPagamento] = useState(hojeISO());
  const [formaPagamento, setFormaPagamento] = useState("pix");
  const [obsPagamento, setObsPagamento] = useState("");
  const [valorEstorno, setValorEstorno] = useState("");
  const [motivoEstorno, setMotivoEstorno] = useState("");
  const [motivoCancelamento, setMotivoCancelamento] = useState("");
  const operacoesRef = useRef<Record<string, { assinatura: string; id: string }>>({});

  const hoje = hojeISO();
  const abertas = contas.filter((c) => ["pendente", "parcial"].includes(c.status));
  const totalAberto = abertas.reduce((s, c) => s + Math.max(0, Number(c.valor) - Number(c.valor_pago)), 0);
  const totalVencido = abertas.filter((c) => c.data_vencimento < hoje)
    .reduce((s, c) => s + Math.max(0, Number(c.valor) - Number(c.valor_pago)), 0);
  const totalPago = contas.filter((c) => ["pago", "parcial"].includes(c.status))
    .reduce((s, c) => s + Number(c.valor_pago), 0);
  const ordenadas = useMemo(
    () => [...contas].sort((a, b) => a.data_vencimento.localeCompare(b.data_vencimento)),
    [contas],
  );
  const pagamentosPorConta = useMemo(() => {
    const mapa = new Map<string, ContaPagarPagamento[]>();
    for (const pagamento of pagamentos) {
      mapa.set(pagamento.conta_id, [...(mapa.get(pagamento.conta_id) ?? []), pagamento]);
    }
    return mapa;
  }, [pagamentos]);
  const estornadoPorPagamento = useMemo(() => {
    const mapa = new Map<string, number>();
    for (const estorno of estornos) mapa.set(estorno.pagamento_id, (mapa.get(estorno.pagamento_id) ?? 0) + Number(estorno.valor));
    return mapa;
  }, [estornos]);

  function operacaoId(chave: string, assinatura: string) {
    const atual = operacoesRef.current[chave];
    if (atual?.assinatura === assinatura) return atual.id;
    const novo = crypto.randomUUID();
    operacoesRef.current[chave] = { assinatura, id: novo };
    return novo;
  }

  async function atualizarFinanceiro() {
    await Promise.all([
      qc.invalidateQueries({ queryKey: ["contas-pagar"] }),
      qc.invalidateQueries({ queryKey: ["contas-pagar-pagamentos"] }),
      qc.invalidateQueries({ queryKey: ["contas-pagar-estornos"] }),
    ]);
  }

  function editar(c: ContaPagar) {
    setId(c.id);
    setF({
      descricao: c.descricao,
      fornecedor: c.fornecedor ?? "",
      data_emissao: c.data_emissao,
      data_vencimento: c.data_vencimento,
      valor: String(c.valor),
      forma_pagamento: c.forma_pagamento ?? "",
      compra_id: c.compra_id ?? "",
      observacoes: c.observacoes ?? "",
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function limpar() {
    setId(null);
    setF({ ...blank });
  }

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    const valor = parseNum(f.valor);
    if (!f.descricao.trim()) return void toast.error("Informe a descrição da conta.");
    if (!f.data_emissao || !f.data_vencimento) return void toast.error("Informe as datas de emissão e vencimento.");
    if (!Number.isFinite(valor) || valor <= 0) return void toast.error("O valor total precisa ser maior que zero.");
    const payload = {
      descricao: f.descricao.trim(),
      fornecedor: f.fornecedor.trim() || null,
      data_emissao: f.data_emissao,
      data_vencimento: f.data_vencimento,
      valor,
      compra_id: f.compra_id || null,
      observacoes: f.observacoes.trim() || null,
    };
    const chave = "salvar:" + (id ?? "nova");
    const assinatura = JSON.stringify({ id, payload });
    const p_operacao_id = operacaoId(chave, assinatura);
    setBusy(true);
    try {
      const { error } = await supabase.rpc("salvar_conta_pagar", {
        p_dados: payload,
        ...(id ? { p_conta_id: id } : {}),
        p_operacao_id,
      });
      if (error) throw error;
      delete operacoesRef.current[chave];
      await atualizarFinanceiro();
      limpar();
      toast.success(id ? "Conta atualizada." : "Conta registrada.");
    } catch (erro) {
      toast.error(erro instanceof Error ? erro.message : "Não foi possível salvar a conta.");
    } finally {
      setBusy(false);
    }
  }

  function abrirPagamento(c: ContaPagar) {
    setAcao({ tipo: "pagamento", conta: c });
    setValorPagamento(String(Math.max(0, Number(c.valor) - Number(c.valor_pago)).toFixed(2)));
    setDataPagamento(hojeISO());
    setFormaPagamento("pix");
    setObsPagamento("");
  }

  async function registrarPagamento(e: React.FormEvent) {
    e.preventDefault();
    if (acao?.tipo !== "pagamento") return;
    const valor = parseNum(valorPagamento);
    const saldo = Math.max(0, Number(acao.conta.valor) - Number(acao.conta.valor_pago));
    if (!Number.isFinite(valor) || valor <= 0 || valor > saldo) {
      toast.error("Informe um valor positivo que não ultrapasse o saldo devedor.");
      return;
    }
    const dados = {
      conta_id: acao.conta.id,
      valor,
      data_pagamento: dataPagamento,
      forma_pagamento: formaPagamento,
      observacoes: obsPagamento.trim() || null,
    };
    const chave = "pagamento:" + acao.conta.id;
    const p_operacao_id = operacaoId(chave, JSON.stringify(dados));
    setBusy(true);
    try {
      const { error } = await supabase.rpc("registrar_pagamento_conta_pagar", {
        p_conta_id: acao.conta.id,
        p_valor: valor,
        p_data_pagamento: dataPagamento,
        p_forma_pagamento: formaPagamento,
        p_observacoes: obsPagamento.trim(),
        p_operacao_id,
      });
      if (error) throw error;
      delete operacoesRef.current[chave];
      await atualizarFinanceiro();
      setAcao(null);
      toast.success("Pagamento registrado no extrato.");
    } catch (erro) {
      toast.error(erro instanceof Error ? erro.message : "Não foi possível registrar o pagamento.");
    } finally {
      setBusy(false);
    }
  }

  function abrirEstorno(c: ContaPagar, p: ContaPagarPagamento, disponivel: number) {
    setAcao({ tipo: "estorno", conta: c, pagamento: p, disponivel });
    setValorEstorno(disponivel.toFixed(2));
    setMotivoEstorno("");
  }

  async function registrarEstorno(e: React.FormEvent) {
    e.preventDefault();
    if (acao?.tipo !== "estorno") return;
    const valor = parseNum(valorEstorno);
    if (!Number.isFinite(valor) || valor <= 0 || valor > acao.disponivel) {
      toast.error("O valor do estorno precisa ser positivo e não pode exceder o saldo do pagamento.");
      return;
    }
    if (!motivoEstorno.trim()) return void toast.error("Informe o motivo do estorno.");
    const chave = "estorno:" + acao.pagamento.id;
    const assinatura = JSON.stringify({ pagamento_id: acao.pagamento.id, valor, motivo: motivoEstorno.trim() });
    const p_operacao_id = operacaoId(chave, assinatura);
    setBusy(true);
    try {
      const { error } = await supabase.rpc("estornar_pagamento_conta_pagar", {
        p_pagamento_id: acao.pagamento.id,
        p_valor: valor,
        p_motivo: motivoEstorno.trim(),
        p_operacao_id,
      });
      if (error) throw error;
      delete operacoesRef.current[chave];
      await atualizarFinanceiro();
      setAcao(null);
      toast.success("Estorno registrado e vinculado ao pagamento original.");
    } catch (erro) {
      toast.error(erro instanceof Error ? erro.message : "Não foi possível registrar o estorno.");
    } finally {
      setBusy(false);
    }
  }

  async function cancelarConta(e: React.FormEvent) {
    e.preventDefault();
    if (acao?.tipo !== "cancelamento") return;
    if (!motivoCancelamento.trim()) return void toast.error("Informe o motivo do cancelamento.");
    const chave = "cancelar:" + acao.conta.id;
    const assinatura = JSON.stringify({ conta_id: acao.conta.id, motivo: motivoCancelamento.trim() });
    const p_operacao_id = operacaoId(chave, assinatura);
    setBusy(true);
    try {
      const { error } = await supabase.rpc("cancelar_conta_pagar", {
        p_conta_id: acao.conta.id,
        p_motivo: motivoCancelamento.trim(),
        p_operacao_id,
      });
      if (error) throw error;
      delete operacoesRef.current[chave];
      await atualizarFinanceiro();
      if (id === acao.conta.id) limpar();
      setAcao(null);
      toast.success("Conta cancelada; o histórico foi preservado.");
    } catch (erro) {
      toast.error(erro instanceof Error ? erro.message : "Não foi possível cancelar a conta.");
    } finally {
      setBusy(false);
    }
  }

  function exportar() {
    baixarCSV(
      "contas-a-pagar-" + hoje,
      ["Descrição", "Fornecedor", "Emissão", "Vencimento", "Valor", "Pago", "Saldo", "Status", "Data do pagamento"],
      ordenadas.map((c) => [
        c.descricao, c.fornecedor, dataBR(c.data_emissao), dataBR(c.data_vencimento),
        c.valor, c.valor_pago, Math.max(0, c.valor - c.valor_pago), c.status,
        c.data_pagamento ? dataBR(c.data_pagamento) : "",
      ]),
    );
  }

  const contaEditada = id ? contas.find((c) => c.id === id) : undefined;
  const temPagamentosEditada = id ? (pagamentosPorConta.get(id)?.length ?? 0) > 0 : false;

  return (
    <>
      {!embedded && <PageHeader title="Contas a pagar" back="/mais" action={
        <Button variant="outline" className="h-11" aria-label="Exportar contas a pagar em CSV" onClick={exportar}>
          <Download className="size-4" />
          <span>Exportar CSV</span>
        </Button>
      } />}

      <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Stat label="Saldo em aberto" value={brl(totalAberto)} />
        <Stat label="Vencido" value={brl(totalVencido)} tone={totalVencido > 0 ? "danger" : "default"} />
        <Stat label="Total já pago" value={brl(totalPago)} tone="primary" />
      </div>

      <form onSubmit={salvar} className="mb-8 space-y-3 rounded-xl border p-4">
        <h2 className="text-lg font-semibold">{id ? "Editar conta" : "Nova conta a pagar"}</h2>
        <Field label="Descrição">
          <Input required maxLength={200} className="h-11" value={f.descricao} onChange={(e) => setF({ ...f, descricao: e.target.value })} placeholder="Ex.: compra de chocolate, aluguel..." />
        </Field>
        <Field label="Fornecedor (opcional)">
          <Input className="h-11" value={f.fornecedor} onChange={(e) => setF({ ...f, fornecedor: e.target.value })} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Data de emissão">
            <Input required type="date" disabled={temPagamentosEditada} className="h-11" value={f.data_emissao} onChange={(e) => setF({ ...f, data_emissao: e.target.value })} />
          </Field>
          <Field label="Vencimento">
            <Input required type="date" className="h-11" value={f.data_vencimento} onChange={(e) => setF({ ...f, data_vencimento: e.target.value })} />
          </Field>
          <Field label="Valor total (R$)" hint={temPagamentosEditada ? "Protegido após o primeiro pagamento" : "Pode ser alterado enquanto não houver pagamentos."}>
            <Input required inputMode="decimal" disabled={temPagamentosEditada} className="h-11" value={f.valor} onChange={(e) => setF({ ...f, valor: e.target.value })} />
          </Field>
        </div>
        <Field label="Compra relacionada (opcional)" hint={temPagamentosEditada ? "Protegida após o primeiro pagamento" : "Apenas referência; não cria outra despesa automaticamente."}>
          <select disabled={temPagamentosEditada} className="h-11 w-full rounded-md border border-input bg-background px-3 text-sm" value={f.compra_id} onChange={(e) => setF({ ...f, compra_id: e.target.value })}>
            <option value="">Sem vínculo com compra</option>
            {compras.filter((c) => !c.cancelada_em).map((c) => (
              <option key={c.id} value={c.id}>{dataBR(c.data_compra)} · {brl(c.total)}</option>
            ))}
          </select>
        </Field>
        <Field label="Observações (opcional)">
          <Textarea rows={2} value={f.observacoes} onChange={(e) => setF({ ...f, observacoes: e.target.value })} />
        </Field>
        <div className="flex gap-2">
          {id && <Button type="button" variant="outline" onClick={limpar}>Cancelar edição</Button>}
          <Button disabled={busy} className="h-11 flex-1">{busy ? "Salvando..." : id ? "Salvar alterações" : "Registrar conta"}</Button>
        </div>
        {contaEditada && <p className="text-xs text-muted-foreground">Status atual: {contaEditada.status}. Pagamentos e estornos são registrados no extrato, não neste formulário.</p>}
        <p className="text-xs text-muted-foreground">
          Registrar uma conta não altera automaticamente as despesas nem o resultado do relatório. Evite lançar a mesma obrigação duas vezes como despesa.
        </p>
      </form>

      <section>
        <h2 className="mb-3 text-lg font-semibold">Histórico e vencimentos</h2>
        {!ordenadas.length ? <Empty>Nenhuma conta a pagar registrada.</Empty> : (
          <div className="divide-y">
            {ordenadas.map((c) => {
              const saldo = Math.max(0, Number(c.valor) - Number(c.valor_pago));
              const vencida = ["pendente", "parcial"].includes(c.status) && c.data_vencimento < hoje;
              const pagamentosConta = pagamentosPorConta.get(c.id) ?? [];
              const temPagamento = pagamentosConta.length > 0;
              return (
                <div key={c.id} className="py-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className={c.status === "cancelado" ? "font-medium line-through text-muted-foreground" : "font-medium"}>{c.descricao}</p>
                      <p className="text-xs text-muted-foreground">
                        {c.fornecedor ? c.fornecedor + " · " : ""}Vence {dataBR(c.data_vencimento)}{vencida ? " · VENCIDA" : ""}
                      </p>
                    </div>
                    <div className="text-right">
                      <b>{brl(saldo)}</b>
                      <p className="text-xs text-muted-foreground">saldo</p>
                    </div>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                    <p className="text-xs text-muted-foreground">
                      Total {brl(c.valor)} · Pago {brl(c.valor_pago)} · {c.status === "cancelado" ? "Cancelada" : c.status === "pago" ? "Paga" : c.status === "parcial" ? "Parcial" : "Pendente"}
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {c.status !== "cancelado" && <Button type="button" size="sm" variant="outline" onClick={() => editar(c)}><Pencil className="size-3" /> Editar</Button>}
                      {c.status !== "cancelado" && saldo > 0 && <Button type="button" size="sm" onClick={() => abrirPagamento(c)}><CreditCard className="size-3" /> Pagar</Button>}
                      {c.status !== "cancelado" && <Button type="button" size="sm" variant="ghost" onClick={() => { setAcao({ tipo: "cancelamento", conta: c }); setMotivoCancelamento(""); }}><XCircle className="size-3" /> Cancelar</Button>}
                    </div>
                  </div>
                  <details className="mt-3 rounded-lg bg-muted/40 p-3">
                    <summary className="flex cursor-pointer list-none items-center gap-2 text-sm font-medium">
                      <History className="size-4" /> Extrato de pagamentos e estornos ({pagamentosConta.length})
                    </summary>
                    {!temPagamento ? <p className="pt-3 text-sm text-muted-foreground">Nenhum pagamento registrado.</p> : (
                      <div className="mt-2 divide-y">
                        {pagamentosConta.map((p) => {
                          const estornado = estornadoPorPagamento.get(p.id) ?? 0;
                          const disponivel = Math.max(0, Number(p.valor) - estornado);
                          const estornosDoPagamento = estornos.filter((e) => e.pagamento_id === p.id);
                          return (
                            <div key={p.id} className="py-3">
                              <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                  <p className="text-sm font-medium">Pagamento de {brl(p.valor)} · {dataBR(p.data_pagamento)}</p>
                                  <p className="text-xs text-muted-foreground">{p.forma_pagamento} · {p.observacoes || "Sem observações"}</p>
                                </div>
                                <div className="text-right text-sm">
                                  <b>{brl(disponivel)}</b>
                                  <p className="text-xs text-muted-foreground">saldo do pagamento</p>
                                </div>
                              </div>
                              {estornosDoPagamento.map((e) => (
                                <p key={e.id} className="mt-1 text-xs text-muted-foreground">
                                  Estorno de {brl(e.valor)} · {e.motivo} · {dataBR(e.created_at.slice(0, 10))}
                                </p>
                              ))}
                              {c.status !== "cancelado" && disponivel > 0 && (
                                <Button type="button" size="sm" variant="outline" className="mt-2" onClick={() => abrirEstorno(c, p, disponivel)}>
                                  <RotateCcw className="size-3" /> Estornar pagamento
                                </Button>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </details>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {acao && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" role="presentation">
          <section role="dialog" aria-modal="true" aria-labelledby="financeiro-dialog-title" className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl border bg-background p-5 shadow-xl">
            <h2 id="financeiro-dialog-title" className="mb-1 text-lg font-semibold">
              {acao.tipo === "pagamento" ? "Registrar pagamento" : acao.tipo === "estorno" ? "Estornar pagamento" : "Cancelar conta"}
            </h2>
            <p className="mb-4 text-sm text-muted-foreground">{acao.conta.descricao}</p>
            {acao.tipo === "pagamento" && (
              <form onSubmit={registrarPagamento} className="space-y-3">
                <p className="rounded-lg bg-muted p-3 text-sm">Saldo devedor: <b>{brl(Math.max(0, acao.conta.valor - acao.conta.valor_pago))}</b></p>
                <Field label="Valor do pagamento (R$)">
                  <Input required autoFocus inputMode="decimal" className="h-11" value={valorPagamento} onChange={(e) => setValorPagamento(e.target.value)} />
                </Field>
                <Field label="Data do pagamento">
                  <Input required type="date" className="h-11" value={dataPagamento} onChange={(e) => setDataPagamento(e.target.value)} />
                </Field>
                <Field label="Forma de pagamento">
                  <select required className="h-11 w-full rounded-md border border-input bg-background px-3 text-sm" value={formaPagamento} onChange={(e) => setFormaPagamento(e.target.value)}>
                    <option value="pix">Pix</option><option value="dinheiro">Dinheiro</option><option value="debito">Débito</option><option value="credito">Crédito</option><option value="boleto">Boleto</option><option value="transferencia">Transferência</option><option value="outro">Outro</option>
                  </select>
                </Field>
                <Field label="Observações (opcional)">
                  <Textarea rows={2} value={obsPagamento} onChange={(e) => setObsPagamento(e.target.value)} />
                </Field>
                <div className="flex gap-2"><Button type="button" variant="outline" className="flex-1" disabled={busy} onClick={() => setAcao(null)}>Voltar</Button><Button disabled={busy} className="flex-1">{busy ? "Registrando..." : "Confirmar pagamento"}</Button></div>
              </form>
            )}
            {acao.tipo === "estorno" && (
              <form onSubmit={registrarEstorno} className="space-y-3">
                <p className="rounded-lg bg-muted p-3 text-sm">Valor ainda disponível para estorno neste pagamento: <b>{brl(acao.disponivel)}</b></p>
                <Field label="Valor do estorno (R$)">
                  <Input required autoFocus inputMode="decimal" className="h-11" value={valorEstorno} onChange={(e) => setValorEstorno(e.target.value)} />
                </Field>
                <Field label="Motivo do estorno">
                  <Textarea required rows={3} maxLength={500} value={motivoEstorno} onChange={(e) => setMotivoEstorno(e.target.value)} />
                </Field>
                <div className="flex gap-2"><Button type="button" variant="outline" className="flex-1" disabled={busy} onClick={() => setAcao(null)}>Voltar</Button><Button disabled={busy} className="flex-1">{busy ? "Registrando..." : "Confirmar estorno"}</Button></div>
              </form>
            )}
            {acao.tipo === "cancelamento" && (
              <form onSubmit={cancelarConta} className="space-y-3">
                <p className="rounded-lg bg-muted p-3 text-sm">A conta só pode ser cancelada quando não houver pagamentos líquidos ativos. O registro e a auditoria serão preservados.</p>
                <Field label="Motivo do cancelamento">
                  <Textarea required autoFocus rows={3} maxLength={500} value={motivoCancelamento} onChange={(e) => setMotivoCancelamento(e.target.value)} />
                </Field>
                <div className="flex gap-2"><Button type="button" variant="outline" className="flex-1" disabled={busy} onClick={() => setAcao(null)}>Voltar</Button><Button disabled={busy} variant="destructive" className="flex-1">{busy ? "Cancelando..." : "Confirmar cancelamento"}</Button></div>
              </form>
            )}
          </section>
        </div>
      )}
    </>
  );
}
