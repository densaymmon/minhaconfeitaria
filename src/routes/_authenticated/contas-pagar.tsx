import * as appQueries from "@/lib/queries";
import { createFileRoute } from "@tanstack/react-router";
import { useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Download, Pencil, XCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { contasPagarQ, comprasQ, type ContaPagar } from "@/lib/queries";
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

function ContasPagar() {
  const { data: contas } = useSuspenseQuery(contasPagarQ);
  const { data: compras } = useSuspenseQuery(comprasQ);
  const qc = useQueryClient();
  const blank = {
    descricao: "",
    fornecedor: "",
    data_emissao: hojeISO(),
    data_vencimento: hojeISO(),
    valor: "",
    valor_pago: "0",
    data_pagamento: "",
    forma_pagamento: "",
    compra_id: "",
    observacoes: "",
  };
  const [f, setF] = useState(blank);
  const [id, setId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const hoje = hojeISO();
  const abertas = contas.filter((c) => ["pendente", "parcial"].includes(c.status));
  const totalAberto = abertas.reduce((s, c) => s + Math.max(0, Number(c.valor) - Number(c.valor_pago)), 0);
  const totalVencido = abertas.filter((c) => c.data_vencimento < hoje)
    .reduce((s, c) => s + Math.max(0, Number(c.valor) - Number(c.valor_pago)), 0);
  const totalPago = contas.filter((c) => c.status === "pago")
    .reduce((s, c) => s + Number(c.valor_pago), 0);
  const ordenadas = useMemo(
    () => [...contas].sort((a, b) => a.data_vencimento.localeCompare(b.data_vencimento)),
    [contas],
  );

  function editar(c: ContaPagar) {
    setId(c.id);
    setF({
      descricao: c.descricao,
      fornecedor: c.fornecedor ?? "",
      data_emissao: c.data_emissao,
      data_vencimento: c.data_vencimento,
      valor: String(c.valor),
      valor_pago: String(c.valor_pago),
      data_pagamento: c.data_pagamento ?? "",
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
    const valorPago = parseNum(f.valor_pago);
    if (!f.descricao.trim()) return void toast.error("Informe a descrição da conta.");
    if (!f.data_emissao || !f.data_vencimento) return void toast.error("Informe as datas de emissão e vencimento.");
    if (!Number.isFinite(valor) || valor <= 0 || !Number.isFinite(valorPago) || valorPago < 0 || valorPago > valor) {
      return void toast.error("Confira o valor total e o valor já pago.");
    }
    setBusy(true);
    const payload = {
      descricao: f.descricao.trim(),
      fornecedor: f.fornecedor.trim() || null,
      data_emissao: f.data_emissao,
      data_vencimento: f.data_vencimento,
      valor,
      valor_pago: valorPago,
      data_pagamento: f.data_pagamento || null,
      forma_pagamento: f.forma_pagamento || null,
      compra_id: f.compra_id || null,
      observacoes: f.observacoes.trim() || null,
    };
    const result = id
      ? await supabase.from("contas_pagar").update(payload).eq("id", id)
      : await supabase.from("contas_pagar").insert(payload);
    setBusy(false);
    if (result.error) {
      toast.error(result.error.message);
      return;
    }
    await qc.invalidateQueries({ queryKey: ["contas-pagar"] });
    limpar();
    toast.success(id ? "Conta atualizada." : "Conta registrada.");
  }

  async function cancelar(c: ContaPagar) {
    if (c.valor_pago > 0) {
      toast.error("Esta conta já tem pagamento registrado. Ajuste o valor pago antes de cancelar.");
      return;
    }
    if (!confirm(`Cancelar a conta "${c.descricao}"? O registro será mantido no histórico.`)) return;
    const { error } = await supabase.from("contas_pagar").update({ status: "cancelado" }).eq("id", c.id);
    if (error) return void toast.error(error.message);
    await qc.invalidateQueries({ queryKey: ["contas-pagar"] });
    if (id === c.id) limpar();
    toast.success("Conta cancelada; histórico preservado.");
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

  return (
    <>
      <PageHeader title="Contas a pagar" back="/mais" action={
        <Button variant="outline" size="icon" aria-label="Exportar contas a pagar CSV" onClick={exportar}>
          <Download className="size-4" />
        </Button>
      } />

      <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Stat label="Saldo em aberto" value={brl(totalAberto)} />
        <Stat label="Vencido" value={brl(totalVencido)} tone={totalVencido > 0 ? "danger" : "default"} />
        <Stat label="Total de contas pagas" value={brl(totalPago)} tone="primary" />
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
            <Input required type="date" className="h-11" value={f.data_emissao} onChange={(e) => setF({ ...f, data_emissao: e.target.value })} />
          </Field>
          <Field label="Vencimento">
            <Input required type="date" className="h-11" value={f.data_vencimento} onChange={(e) => setF({ ...f, data_vencimento: e.target.value })} />
          </Field>
          <Field label="Valor total (R$)">
            <Input required inputMode="decimal" className="h-11" value={f.valor} onChange={(e) => setF({ ...f, valor: e.target.value })} />
          </Field>
          <Field label="Valor já pago (R$)" hint="Acumulado até agora">
            <Input required inputMode="decimal" className="h-11" value={f.valor_pago} onChange={(e) => setF({ ...f, valor_pago: e.target.value })} />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Data do pagamento (opcional)">
            <Input type="date" className="h-11" value={f.data_pagamento} onChange={(e) => setF({ ...f, data_pagamento: e.target.value })} />
          </Field>
          <Field label="Forma de pagamento">
            <select className="h-11 w-full rounded-md border border-input bg-background px-3 text-sm" value={f.forma_pagamento} onChange={(e) => setF({ ...f, forma_pagamento: e.target.value })}>
              <option value="">Não informado</option>
              <option value="pix">Pix</option>
              <option value="dinheiro">Dinheiro</option>
              <option value="debito">Débito</option>
              <option value="credito">Crédito</option>
              <option value="boleto">Boleto</option>
              <option value="transferencia">Transferência</option>
              <option value="outro">Outro</option>
            </select>
          </Field>
        </div>
        <Field label="Compra relacionada (opcional)" hint="Apenas referência; não cria outra despesa automaticamente.">
          <select className="h-11 w-full rounded-md border border-input bg-background px-3 text-sm" value={f.compra_id} onChange={(e) => setF({ ...f, compra_id: e.target.value })}>
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
        <p className="text-xs text-muted-foreground">
          Registrar uma conta não altera as despesas nem o resultado do relatório. Use esta tela para acompanhar obrigações e pagamentos; não lance a mesma conta também como despesa sem conferir se isso duplicará o valor.
        </p>
      </form>

      <section>
        <h2 className="mb-3 text-lg font-semibold">Histórico e vencimentos</h2>
        {!ordenadas.length ? <Empty>Nenhuma conta a pagar registrada.</Empty> : (
          <div className="divide-y">
            {ordenadas.map((c) => {
              const saldo = Math.max(0, Number(c.valor) - Number(c.valor_pago));
              const vencida = ["pendente", "parcial"].includes(c.status) && c.data_vencimento < hoje;
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
                    <div className="flex gap-2">
                      {c.status !== "cancelado" && <Button type="button" size="sm" variant="outline" onClick={() => editar(c)}><Pencil className="size-3" /> Editar</Button>}
                      {c.status !== "cancelado" && c.status !== "pago" && <Button type="button" size="sm" variant="ghost" onClick={() => void cancelar(c)}><XCircle className="size-3" /> Cancelar</Button>}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </>
  );
}
