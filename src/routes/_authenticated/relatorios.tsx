import * as appQueries from "@/lib/queries";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Download } from "lucide-react";
import { configQ, despesasQ, pedidosQ } from "@/lib/queries";
import { custoUnitario, totaisPedido } from "@/lib/calc";
import { brl, dataBR, hojeISO, mesISO, num } from "@/lib/format";
import { baixarCSV } from "@/lib/csv";
import { PageHeader, Field, Stat, Row, Empty } from "@/components/app/ui";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/relatorios")({
  loader: async ({ context }) => {
    await Promise.all([
      context.queryClient.ensureQueryData(appQueries.pedidosQ),
      context.queryClient.ensureQueryData(appQueries.configQ),
      context.queryClient.ensureQueryData(appQueries.despesasQ),
      context.queryClient.ensureQueryData(appQueries.produtosQ),
      context.queryClient.ensureQueryData(appQueries.insumosQ),
      context.queryClient.ensureQueryData(appQueries.contasPagarQ),
      context.queryClient.ensureQueryData(appQueries.comprasQ),
      context.queryClient.ensureQueryData(appQueries.pedidoPagamentosQ),
    ]);
  },
  errorComponent: ({ error }) => (
    <p role="alert" className="py-8 text-destructive">
      {error instanceof Error ? error.message : "Não foi possível carregar os registros."}
    </p>
  ),
  notFoundComponent: () => <p>Registro não encontrado.</p>,
  validateSearch: (s: Record<string, unknown>) => ({
    inicio: typeof s["inicio"] === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s["inicio"]) ? s["inicio"] : mesISO() + "-01",
    fim: typeof s["fim"] === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s["fim"]) ? s["fim"] : hojeISO(),
  }),
  head: () => ({
    meta: [
      { title: "Relatórios — Doce Gestão" },
      { name: "description", content: "Vendas, custos, resultados estimados e valores a receber por período." },
      { property: "og:title", content: "Relatórios — Doce Gestão" },
      { property: "og:description", content: "Vendas, custos, resultados estimados e valores a receber por período." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Relatorios,
});

function Relatorios() {
  const { inicio, fim } = Route.useSearch();
  const qc = useQueryClient();
  const [corrigindoCustos, setCorrigindoCustos] = useState(false);
  const [inicioRecebimentos, setInicioRecebimentos] = useState(mesISO() + "-01");
  const [fimRecebimentos, setFimRecebimentos] = useState(hojeISO());
  const navigate = Route.useNavigate();
  const { data: pedidos } = useSuspenseQuery(pedidosQ);
  const { data: config } = useSuspenseQuery(configQ);
  const { data: produtos } = useSuspenseQuery(appQueries.produtosQ);
  const { data: insumos } = useSuspenseQuery(appQueries.insumosQ);
  const { data: despesas } = useSuspenseQuery(despesasQ);
  const { data: contasPagar } = useSuspenseQuery(appQueries.contasPagarQ);
  const { data: compras } = useSuspenseQuery(appQueries.comprasQ);
  const { data: pagamentosPedidos } = useSuspenseQuery(appQueries.pedidoPagamentosQ);
  const intervaloValido = inicio <= fim;
  const contasAbertas = contasPagar.filter((c) => !c.cancelada_em && ["pendente", "parcial"].includes(c.status));
  const saldoContasAbertas = contasAbertas.reduce((s, c) => s + Math.max(0, Number(c.valor) - Number(c.valor_pago)), 0);
  const saldoContasVencidas = contasAbertas
    .filter((c) => c.data_vencimento < hojeISO())
    .reduce((s, c) => s + Math.max(0, Number(c.valor) - Number(c.valor_pago)), 0);
  const insumosPorId = useMemo(
    () => new Map(insumos.map((i) => [i.id, { ...i, preco_unidade: Number(i.preco_unidade) }])),
    [insumos],
  );
  // Calcula produto a produto. Se alguma receita tiver unidades incompatíveis,
  // preserva o custo salvo para esse produto sem derrubar o relatório inteiro.
  const custoAtual = useMemo(() => {
    const custos = new Map<string, number>();
    for (const produto of produtos) {
      try {
        const custo = custoUnitario(produto, produto.receita_itens, insumosPorId);
        if (Number.isFinite(custo) && custo >= 0) custos.set(produto.id, custo);
      } catch {
        // Unidade inválida: o item do pedido mantém o custo salvo como fallback.
      }
    }
    return custos;
  }, [produtos, insumosPorId]);
  const produtosPorId = useMemo(() => new Map(produtos.map((p) => [p.id, p])), [produtos]);
  const pedidosCalculados = useMemo(() => pedidos.map((pedido) => {
    const itens = pedido.pedido_itens.map((item) => {
      const produto = item.produto_id ? produtosPorId.get(item.produto_id) : undefined;
      const temCustoCadastrado = !!produto && (
        produto.receita_itens.length > 0 ||
        Number(produto.custo_gas) > 0 ||
        Number(produto.custo_energia) > 0 ||
        Number(produto.custo_mao_obra) > 0
      );
      const custoUnitarioAtual = item.produto_id && temCustoCadastrado
        ? (custoAtual.get(item.produto_id) ?? Number(item.custo_unitario))
        : Number(item.custo_unitario);
      return { ...item, custo_unitario: custoUnitarioAtual };
    });
    return { ...pedido, pedido_itens: itens, t: totaisPedido({ ...pedido, pedido_itens: itens }, config) };
  }), [pedidos, produtosPorId, custoAtual, config]);

  const lista = intervaloValido
    ? pedidosCalculados.filter((p) => p.status !== "cancelado" && p.data_entrega >= inicio && p.data_entrega <= fim)
    : [];
  const entregues = lista.filter((p) => ["finalizado", "entregue"].includes(p.status));
  const gastos = intervaloValido
    ? despesas.filter((d) => d.data >= inicio && d.data <= fim).reduce((s, d) => s + Number(d.valor), 0)
    : 0;
  // Compras são mostradas como movimento/compromisso financeiro, sem subtraí-las
  // novamente do resultado: os insumos consumidos já devem compor o custo dos produtos vendidos.
  const comprasNoPeriodo = intervaloValido
    ? compras.filter((c) => !c.cancelada_em && c.data_compra >= inicio && c.data_compra <= fim)
    : [];
  const totalComprasInsumos = comprasNoPeriodo.reduce((s, c) => s + Math.max(0, Number(c.total) || 0), 0);
  const intervaloRecebimentosValido = inicioRecebimentos <= fimRecebimentos;
  const recebimentosNoPeriodo = intervaloRecebimentosValido ? pagamentosPedidos.filter((p) => p.data_pagamento >= inicioRecebimentos && p.data_pagamento <= fimRecebimentos) : [];
  const totalRecebidoNoPeriodo = recebimentosNoPeriodo.reduce((s, p) => s + Math.max(0, Number(p.valor) || 0), 0);
  const comprasPorForma = useMemo(() => {
    const totais = new Map<string, number>();
    for (const compra of comprasNoPeriodo) {
      const forma = compra.forma_pagamento_compra || "não informado";
      totais.set(forma, (totais.get(forma) ?? 0) + Math.max(0, Number(compra.total) || 0));
    }
    return [...totais.entries()].sort((a, b) => b[1] - a[1]);
  }, [comprasNoPeriodo]);
  const despesasPorCategoria = useMemo(() => {
    const totais = new Map<string, number>();
    for (const despesa of despesas) {
      if (!intervaloValido || despesa.data < inicio || despesa.data > fim) continue;
      const categoria = despesa.categoria?.trim() || "Sem categoria";
      totais.set(categoria, (totais.get(categoria) ?? 0) + (Number(despesa.valor) || 0));
    }
    return [...totais.entries()].sort((a, b) => b[1] - a[1]);
  }, [despesas, inicio, fim, intervaloValido]);

  const contratado = lista.reduce((s, p) => ({
    venda: s.venda + p.t.venda,
    recebido: s.recebido + p.t.recebido,
    saldo: s.saldo + p.t.saldo,
  }), { venda: 0, recebido: 0, saldo: 0 });
  const realizado = entregues.reduce((s, p) => ({
    venda: s.venda + p.t.venda,
    custo: s.custo + p.t.custo,
    taxas: s.taxas + p.t.taxas,
  }), { venda: 0, custo: 0, taxas: 0 });
  const lucroBruto = realizado.venda - realizado.custo;
  const margemBruta = realizado.venda > 0 ? (lucroBruto / realizado.venda) * 100 : 0;
  const resultado = lucroBruto - realizado.taxas - gastos;

  const porProduto = useMemo(() => {
    const m = new Map<string, { qtd: number; venda: number; custo: number; nome: string }>();
    for (const pedido of entregues) {
      for (const item of pedido.pedido_itens) {
        const key = item.produto_id ?? item.descricao;
        const r = m.get(key) ?? { qtd: 0, venda: 0, custo: 0, nome: item.descricao || "Produto sem nome" };
        r.qtd += Number(item.quantidade);
        r.venda += Number(item.quantidade) * Number(item.preco_unitario);
        r.custo += Number(item.quantidade) * Number(item.custo_unitario);
        m.set(key, r);
      }
    }
    return [...m.values()].sort((a, b) => b.venda - a.venda);
  }, [entregues]);

  async function corrigirCustosHistoricos() {
    if (!confirm("Isso atualizará o custo salvo de todos os itens de pedidos vinculados a produtos cadastrados, usando os preços e receitas atuais. Valores de venda, pagamentos e datas não serão alterados. Deseja continuar?")) return;
    setCorrigindoCustos(true);
    try {
      const { data, error } = await supabase.rpc("recalcular_custos_historicos");
      if (error) throw error;
      await qc.invalidateQueries({ queryKey: ["pedidos"] });
      toast.success(`Custos atualizados em ${Number(data ?? 0)} itens de pedidos.`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível corrigir os custos antigos.");
    } finally {
      setCorrigindoCustos(false);
    }
  }

  function exportar() {
    baixarCSV(
      "relatorio-" + inicio + "-" + fim,
      ["Pedido", "Entrega", "Cliente", "Status", "Vendido", "Custo estimado atual", "Taxas estimadas", "Resultado estimado", "Recebido estimado", "Saldo estimado"],
      lista.map((p) => [
        p.numero, dataBR(p.data_entrega), p.clientes?.nome, p.status, p.t.venda, p.t.custo,
        p.t.taxas, p.t.lucroLiquido, p.t.recebido, p.t.saldo,
      ]),
    );
  }

  return (
    <>
      <PageHeader title="Relatórios" back="/mais" action={
        <Button size="icon" variant="outline" aria-label="Exportar relatório CSV" onClick={exportar}>
          <Download className="size-4" />
        </Button>
      } />
      <div className="mb-5 grid grid-cols-2 gap-3">
        <Field label="Entrega a partir de">
          <Input type="date" value={inicio} onChange={(e) => navigate({ search: (s) => ({ ...s, inicio: e.target.value }) })} className="h-11 bg-card" />
        </Field>
        <Field label="Até">
          <Input type="date" value={fim} onChange={(e) => navigate({ search: (s) => ({ ...s, fim: e.target.value }) })} className="h-11 bg-card" />
        </Field>
      </div>
      {!intervaloValido && <p className="mb-4 text-destructive">A data final deve ser igual ou posterior à data inicial.</p>}

      <h2 className="mb-3 text-lg font-semibold">Visão geral do período</h2>
      <div className="mb-6 grid grid-cols-2 gap-3">
        <Stat label="Vendas contratadas" value={brl(contratado.venda)} />
        <Stat label="Vendas entregues" value={brl(realizado.venda)} tone="primary" />
        <Stat label="Lucro bruto estimado" value={brl(lucroBruto)} tone={lucroBruto >= 0 ? "success" : "danger"} />
        <Stat label="Margem bruta estimada" value={String(margemBruta.toLocaleString("pt-BR", { maximumFractionDigits: 1 })) + "%"} />
        <Stat label="Pago cadastrado nos pedidos" value={brl(contratado.recebido)} />
        <Stat label="Saldo a receber" value={brl(contratado.saldo)} />
        <Stat label="Compras de insumos" value={brl(totalComprasInsumos)} />
        <Stat label="Contas a pagar em aberto" value={brl(saldoContasAbertas)} tone={saldoContasAbertas > 0 ? "danger" : "default"} />
        <Stat label="Resultado estimado" value={brl(resultado)} tone={resultado >= 0 ? "success" : "danger"} />
      </div>
      <p className="mb-6 text-xs text-muted-foreground">
        Recebimentos no período consideram somente pagamentos com data individual registrada. Pagamentos antigos sem histórico detalhado continuam no valor pago cadastrado, mas não são atribuídos a uma data fictícia. Compras de insumos e contas a pagar são indicadores separados e não são descontados novamente do resultado estimado.
      </p>

      <section className="mb-6 rounded-xl border p-4">
        <h2 className="mb-1 text-lg font-semibold">Fluxo de recebimentos</h2>
        <p className="mb-3 text-sm text-muted-foreground">Pagamentos registrados pela data em que o dinheiro entrou no caixa.</p>
        <div className="mb-4 grid grid-cols-2 gap-3">
          <Field label="Recebimentos a partir de">
            <Input type="date" value={inicioRecebimentos} onChange={(e) => setInicioRecebimentos(e.target.value)} className="h-11 bg-card" />
          </Field>
          <Field label="Até">
            <Input type="date" value={fimRecebimentos} onChange={(e) => setFimRecebimentos(e.target.value)} className="h-11 bg-card" />
          </Field>
        </div>
        {!intervaloRecebimentosValido && <p className="mb-3 text-sm text-destructive">A data final deve ser igual ou posterior à data inicial.</p>}
        <Stat label="Total recebido no período" value={brl(totalRecebidoNoPeriodo)} tone="primary" />
        <div className="mt-3 space-y-2">
          {recebimentosNoPeriodo.length === 0 ? <p className="text-sm text-muted-foreground">Nenhum recebimento detalhado neste intervalo. Pagamentos antigos sem data individual não entram neste total.</p> : recebimentosNoPeriodo.slice().sort((a, b) => b.data_pagamento.localeCompare(a.data_pagamento)).map((p) => (
            <div key={p.id} className="flex items-start justify-between gap-3 border-t pt-2 text-sm">
              <div><p className="font-medium">{dataBR(p.data_pagamento)} · {p.forma_pagamento}</p>{p.observacoes && <p className="text-muted-foreground">{p.observacoes}</p>}</div>
              <span className="shrink-0 font-semibold">{brl(Number(p.valor))}</span>
            </div>
          ))}
        </div>
      </section>
      <section className="mb-6 border-y py-4">
        <h2 className="mb-2 text-lg font-semibold">Resultado dos pedidos entregues</h2>
        <Row label="Vendas dos pedidos entregues" value={brl(realizado.venda)} />
        <Row label="Custo estimado dos produtos" value={brl(realizado.custo)} />
        <Row label="Lucro bruto estimado" value={brl(lucroBruto)} strong />
        <Row label="Margem bruta estimada" value={String(margemBruta.toLocaleString("pt-BR", { maximumFractionDigits: 1 })) + "%"} />
        <Row label="Taxas e impostos estimados" value={brl(realizado.taxas)} />
        <Row label="Despesas registradas no período" value={brl(gastos)} />
        <Row label="Resultado estimado após despesas" value={brl(resultado)} strong />
        <div className="mt-4 space-y-2">
          <Button variant="outline" className="w-full" disabled={corrigindoCustos} onClick={corrigirCustosHistoricos}>
            {corrigindoCustos ? "Atualizando custos antigos..." : "Corrigir custos das vendas antigas"}
          </Button>
          <p className="text-xs text-muted-foreground">Essa ação atualiza os custos salvos dos pedidos usando os preços atuais cadastrados. Faça isso porque você confirmou que as vendas antigas usaram insumos comprados juntos. Os valores de venda e pagamento permanecem iguais.</p>
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          O resultado considera apenas pedidos entregues/finalizados no período selecionado. As despesas são filtradas pela data em que foram registradas. Não lance novamente como despesa ingredientes, embalagens, gás, energia ou mão de obra que já estejam incluídos no custo da receita, pois isso pode duplicar o desconto.
        </p>
      </section>

      <section className="mb-6">
        <h2 className="mb-3 text-lg font-semibold">Despesas por categoria</h2>
        {!despesasPorCategoria.length ? <Empty>Nenhuma despesa registrada no período.</Empty> : (
          <div className="divide-y">
            {despesasPorCategoria.map(([categoria, valor]) => (
              <Row key={categoria} label={categoria} value={brl(valor)} />
            ))}
          </div>
        )}
        <p className="mt-2 text-xs text-muted-foreground">
          Soma as despesas pela data registrada. Confira se os lançamentos não repetem custos de ingredientes, embalagens ou outros itens já calculados nas receitas.
        </p>
      </section>

      <section className="mb-6">
        <h2 className="mb-3 text-lg font-semibold">Compras de insumos por pagamento</h2>
        {!comprasPorForma.length ? <Empty>Nenhuma compra registrada no período.</Empty> : (
          <div className="divide-y">
            {comprasPorForma.map(([forma, valor]) => (
              <Row key={forma} label={forma.replaceAll("_", " ")} value={brl(valor)} />
            ))}
          </div>
        )}
        <p className="mt-2 text-xs text-muted-foreground">
          Valores agrupados pela forma de pagamento informada na compra, não pelo valor efetivamente pago no período.
        </p>
      </section>

      <section className="mb-6 rounded-xl border p-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">Contas a pagar</h2>
          <Link to="/contas-pagar" className="text-sm font-medium text-primary">Ver detalhes</Link>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Stat label="Saldo em aberto" value={brl(saldoContasAbertas)} />
          <Stat label="Contas vencidas" value={brl(saldoContasVencidas)} tone={saldoContasVencidas > 0 ? "danger" : "default"} />
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          Valores atuais, independentemente do período de entrega selecionado. Esses compromissos não são descontados novamente do resultado estimado; registre despesas pagas uma única vez para evitar duplicidade.
        </p>
      </section>

      <section className="mb-6">
        <h2 className="mb-3 text-lg font-semibold">Vendas por produto</h2>
        <p className="mb-3 text-xs text-muted-foreground">Somente pedidos entregues. Os custos dos produtos cadastrados usam os preços e a receita cadastrados atualmente.</p>
        {!porProduto.length ? <Empty>Nenhuma venda entregue no período.</Empty> : (
          <div className="divide-y">
            {porProduto.map((p, i) => (
              <div key={i} className="py-3">
                <div className="flex justify-between gap-2">
                  <span className="break-words">{p.nome}</span>
                  <b className="whitespace-nowrap">{brl(p.venda)}</b>
                </div>
                <div className="text-xs text-muted-foreground">
                  {num(p.qtd)} unidades · Custo {brl(p.custo)} · Lucro bruto estimado {brl(p.venda - p.custo)} · Margem {String((p.venda > 0 ? ((p.venda - p.custo) / p.venda) * 100 : 0).toLocaleString("pt-BR", { maximumFractionDigits: 1 }))}%
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="mb-5">
        <h2 className="mb-3 text-lg font-semibold">Detalhamento dos pedidos</h2>
        {!lista.length ? <Empty>Nenhum pedido no período.</Empty> : (
          <div className="divide-y">
            {lista.map((p) => (
              <Link key={p.id} to="/pedidos/$id" params={{ id: p.id }} className="flex justify-between gap-3 py-3">
                <div className="min-w-0">
                  <span className="font-medium">#{p.numero} · {p.clientes?.nome ?? "Sem cliente"}</span>
                  <p className="text-xs text-muted-foreground">{dataBR(p.data_entrega)} · {p.status} · Venda {brl(p.t.venda)}</p>
                </div>
                <div className="shrink-0 text-right">
                  <b className={p.t.lucroLiquido >= 0 ? "text-success" : "text-destructive"}>{brl(p.t.lucroLiquido)}</b>
                  <p className="text-xs text-muted-foreground">resultado estimado</p>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>

      <p className="mb-2 text-xs text-muted-foreground">
        Valores recebidos e saldo são estimativas dos pedidos com entrega no período, não um extrato por data de pagamento. O sistema ainda não registra cada pagamento parcial com sua própria data.
      </p>
      <p className="text-xs text-muted-foreground">
        Para itens avulsos sem produto/receita cadastrada, o relatório mantém o custo salvo no pedido. Taxas e impostos são estimativas conforme as configurações atuais.
      </p>
    </>
  );
}
