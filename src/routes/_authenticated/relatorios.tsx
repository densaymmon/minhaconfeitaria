import * as appQueries from "@/lib/queries";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { endOfMonth, format } from "date-fns";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Download } from "lucide-react";
import { configQ, despesasQ, pedidosQ } from "@/lib/queries";
import { calcularRecebimentoPedido, custoUnitario, ratearVendaETaxas, totaisPedido } from "@/lib/calc";
import { medida } from "@/lib/ingredient-cost";
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
      context.queryClient.ensureQueryData(appQueries.compraItensQ),
      context.queryClient.ensureQueryData(appQueries.pedidoPagamentosQ),
      context.queryClient.ensureQueryData(appQueries.contasPagarPagamentosQ),
      context.queryClient.ensureQueryData(appQueries.contasPagarEstornosQ),
    ]);
  },
  errorComponent: ({ error }) => (
    <p role="alert" className="py-8 text-destructive">
      {error instanceof Error ? error.message : "Não foi possível carregar os registros."}
    </p>
  ),
  notFoundComponent: () => <p>Registro não encontrado.</p>,
  validateSearch: (s: Record<string, unknown>) => {
    const hoje = hojeISO();
    const dataValida = (valor: unknown): valor is string =>
      typeof valor === "string" && /^\\d{4}-\\d{2}-\\d{2}$/.test(valor);
    const inicioInformado = dataValida(s["inicio"]) ? s["inicio"] : mesISO() + "-01";
    const fimInformado = dataValida(s["fim"]) ? s["fim"] : hoje;
    const fim = fimInformado > hoje ? hoje : fimInformado;
    return {
      inicio: inicioInformado > fim ? fim : inicioInformado,
      fim,
      secao: ["visao-geral", "vendas", "compras", "contas", "caixa", "despesas"].includes(String(s["secao"])) ? String(s["secao"]) : "visao-geral",
      dataBase: s["dataBase"] === "criacao" ? "criacao" : "entrega",
    };
  },
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
  const { inicio, fim, secao, dataBase } = Route.useSearch();
  const qc = useQueryClient();
  const [corrigindoCustos, setCorrigindoCustos] = useState(false);
  const [inicioRecebimentos, setInicioRecebimentos] = useState(inicio);
  const [fimRecebimentos, setFimRecebimentos] = useState(fim);
  const navigate = Route.useNavigate();
  const categoriaRelatorio = secao;
  useEffect(() => {
    setInicioRecebimentos(inicio);
    setFimRecebimentos(fim);
  }, [inicio, fim]);
  const [filtroStatusConta, setFiltroStatusConta] = useState("todas");
  const [filtroFormaCompra, setFiltroFormaCompra] = useState("todas");
  const [filtroCategoriaDespesa, setFiltroCategoriaDespesa] = useState("todas");
  const { data: pedidos } = useSuspenseQuery(pedidosQ);
  const { data: config } = useSuspenseQuery(configQ);
  const { data: produtos } = useSuspenseQuery(appQueries.produtosQ);
  const { data: insumos } = useSuspenseQuery(appQueries.insumosQ);
  const { data: despesas } = useSuspenseQuery(despesasQ);
  const { data: contasPagar } = useSuspenseQuery(appQueries.contasPagarQ);
  const { data: compras } = useSuspenseQuery(appQueries.comprasQ);
  const { data: itensCompra } = useSuspenseQuery(appQueries.compraItensQ);
  const { data: pagamentosPedidos } = useSuspenseQuery(appQueries.pedidoPagamentosQ);
  const { data: pagamentosContasPagar } = useSuspenseQuery(appQueries.contasPagarPagamentosQ);
  const { data: estornosContasPagar } = useSuspenseQuery(appQueries.contasPagarEstornosQ);
  const intervaloValido = inicio <= fim;
  const contasAbertas = contasPagar.filter((c) => !c.cancelada_em && ["pendente", "parcial"].includes(c.status));
  const saldoContasAbertas = contasAbertas.reduce((s, c) => s + Math.max(0, Number(c.valor) - Number(c.valor_pago)), 0);
  const saldoContasVencidas = contasAbertas
    .filter((c) => c.data_vencimento < hojeISO())
    .reduce((s, c) => s + Math.max(0, Number(c.valor) - Number(c.valor_pago)), 0);
  const dataLimiteContas = new Date(hojeISO() + "T00:00:00");
  dataLimiteContas.setDate(dataLimiteContas.getDate() + 7);
  const dataLimiteContasISO = dataLimiteContas.getFullYear() + "-" + String(dataLimiteContas.getMonth() + 1).padStart(2, "0") + "-" + String(dataLimiteContas.getDate()).padStart(2, "0");
  const saldoContasProximos7Dias = contasAbertas
    .filter((c) => c.data_vencimento >= hojeISO() && c.data_vencimento <= dataLimiteContasISO)
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
    const totais = totaisPedido({ ...pedido, pedido_itens: itens }, config);
    const pagamentosDetalhados = pagamentosPedidos
      .filter((pagamento) => pagamento.pedido_id === pedido.id)
      .reduce((soma, pagamento) => soma + Math.max(0, Number(pagamento.valor) || 0), 0);
    const recebimento = calcularRecebimentoPedido({
      venda: totais.venda,
      status: pedido.status,
      saldo_quitado: pedido.saldo_quitado,
      valor_entrada: totais.recebido,
      pagamentosDetalhados,
    });
    return { ...pedido, pedido_itens: itens, t: { ...totais, ...recebimento } };
  }), [pedidos, produtosPorId, custoAtual, config, pagamentosPedidos]);

  const lista = intervaloValido
    ? pedidosCalculados.filter((p) => {
      if (p.status === "cancelado") return false;
      const dataReferencia = dataBase === "criacao"
        ? String(p.created_at ?? "").slice(0, 10)
        : p.data_entrega;
      return dataReferencia >= inicio && dataReferencia <= fim;
    })
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
  // Normaliza quantidades antes de somar: 1 kg + 200 g = 1,2 kg,
  // e 1 L + 200 ml = 1,2 L. Nunca soma valores de unidades diferentes diretamente.
  const comprasFiltradasForma = useMemo(() => comprasNoPeriodo.filter((compra) => filtroFormaCompra === "todas" || (compra.forma_pagamento_compra || "não informado") === filtroFormaCompra), [comprasNoPeriodo, filtroFormaCompra]);
  const totalComprasFiltradas = comprasFiltradasForma.reduce((s, c) => s + Math.max(0, Number(c.total) || 0), 0);
  const gastosPorInsumo = useMemo(() => {
    const idsComprasValidas = new Set(comprasFiltradasForma.map((compra) => compra.id));
    const totais = new Map<string, { nome: string; total: number; quantidadeCompras: number; quantidadeBase: number; unidadeBase: string; unidadesIncompativeis: boolean }>();
    const comprasPorInsumo = new Map<string, Set<string>>();
    for (const item of itensCompra) {
      if (!idsComprasValidas.has(item.compra_id)) continue;
      const insumo = insumosPorId.get(item.insumo_id);
      const nome = insumo?.nome ?? "Insumo removido";
      const conversao = medida(item.unidade);
      const unidadeBase = conversao?.base ?? item.unidade ?? insumo?.unidade ?? "un";
      const quantidadeBase = Math.max(0, Number(item.quantidade) || 0) * (conversao?.fator ?? 1);
      const atual = totais.get(item.insumo_id);
      if (!atual) {
        totais.set(item.insumo_id, {
          nome, total: Math.max(0, Number(item.total) || 0), quantidadeBase,
          quantidadeCompras: 0, unidadeBase, unidadesIncompativeis: false,
        });
      } else {
        atual.total += Math.max(0, Number(item.total) || 0);
        if (atual.unidadeBase === unidadeBase) {
          atual.quantidadeBase += quantidadeBase;
        } else {
          // Dados legados com unidades incompatíveis não devem gerar uma quantidade enganosa.
          atual.unidadesIncompativeis = true;
        }
      }
      const ids = comprasPorInsumo.get(item.insumo_id) ?? new Set<string>();
      ids.add(item.compra_id);
      comprasPorInsumo.set(item.insumo_id, ids);
    }
    return [...totais.entries()].map(([id, item]) => {
      const unidadeExibicao = item.unidadeBase === "g" ? "kg"
        : item.unidadeBase === "ml" ? "L"
        : item.unidadeBase === "un" ? "un"
        : item.unidadeBase;
      const divisor = item.unidadeBase === "g" || item.unidadeBase === "ml" ? 1000
        : item.unidadeBase === "un" ? 1 : 1;
      return {
        id, nome: item.nome, total: item.total,
        quantidade: item.unidadesIncompativeis ? null : item.quantidadeBase / divisor,
        unidade: item.unidadesIncompativeis ? "unidades incompatíveis" : unidadeExibicao,
        quantidadeCompras: comprasPorInsumo.get(id)?.size ?? 0,
      };
    }).sort((a, b) => b.total - a.total);
  }, [comprasFiltradasForma, itensCompra, insumosPorId]);
  const intervaloRecebimentosValido = inicioRecebimentos <= fimRecebimentos;
  const recebimentosNoPeriodo = intervaloRecebimentosValido
    ? pagamentosPedidos.filter((p) => p.data_pagamento >= inicioRecebimentos && p.data_pagamento <= fimRecebimentos)
    : [];
  const totalRecebidoDetalhadoNoPeriodo = recebimentosNoPeriodo.reduce((s, p) => s + Math.max(0, Number(p.valor) || 0), 0);
  // Pedidos antigos podem ter valor pago consolidado, mas nenhum lançamento em pedido_pagamentos.
  // Como não há data individual de recebimento, usa-se uma data já registrada no pedido:
  // prioriza a entrega quando estiver no período; caso contrário, considera a data de cadastro.
  // Não cria histórico fictício e só soma a diferença que ainda não está detalhada.
  const recebimentosLegadosNoPeriodo = intervaloRecebimentosValido
    ? pedidosCalculados.flatMap((pedido) => {
      if (pedido.status === "cancelado") return [];
      const dataCadastro = String(pedido.created_at ?? "").slice(0, 10);
      const entregaNoPeriodo = pedido.data_entrega >= inicioRecebimentos && pedido.data_entrega <= fimRecebimentos;
      const cadastroNoPeriodo = dataCadastro >= inicioRecebimentos && dataCadastro <= fimRecebimentos;
      if (!entregaNoPeriodo && !cadastroNoPeriodo) return [];
      const dataReferencia = entregaNoPeriodo ? pedido.data_entrega : dataCadastro;
      const detalhado = pagamentosPedidos
        .filter((pagamento) => pagamento.pedido_id === pedido.id)
        .reduce((soma, pagamento) => soma + Math.max(0, Number(pagamento.valor) || 0), 0);
      const faltante = Math.max(0, Number(pedido.t.recebido) - detalhado);
      return faltante > 0.009
        ? [{ id: pedido.id, numero: pedido.numero, data_pagamento: dataReferencia, valor: Math.round(faltante * 100) / 100 }]
        : [];
    })
    : [];
  const totalRecebidoLegadoNoPeriodo = recebimentosLegadosNoPeriodo.reduce((s, p) => s + p.valor, 0);
  const totalRecebidoNoPeriodo = totalRecebidoDetalhadoNoPeriodo + totalRecebidoLegadoNoPeriodo;
  // O caixa considera movimentos datados: recebimentos detalhados, despesas lançadas,
  // compras pagas à vista e pagamentos efetivos de contas a pagar.
  // Compras no crédito entram apenas quando cada parcela é paga, evitando duplicidade.
  const despesasCaixaNoPeriodo = intervaloRecebimentosValido
    ? despesas.filter((d) => d.data >= inicioRecebimentos && d.data <= fimRecebimentos)
    : [];
  const comprasAvistaNoPeriodo = intervaloRecebimentosValido
    ? compras.filter((c) => !c.cancelada_em
      && c.data_compra >= inicioRecebimentos
      && c.data_compra <= fimRecebimentos
      && String(c.forma_pagamento_compra || "").toLowerCase() !== "credito")
    : [];
  const pagamentosContasNoPeriodo = intervaloRecebimentosValido
    ? pagamentosContasPagar.filter((p) => p.data_pagamento >= inicioRecebimentos && p.data_pagamento <= fimRecebimentos)
    : [];
  const estornosContasNoPeriodo = intervaloRecebimentosValido
    ? estornosContasPagar.filter((e) => e.created_at.slice(0, 10) >= inicioRecebimentos && e.created_at.slice(0, 10) <= fimRecebimentos)
    : [];
  const totalDespesasCaixa = despesasCaixaNoPeriodo.reduce((s, d) => s + Math.max(0, Number(d.valor) || 0), 0);
  const totalComprasAvista = comprasAvistaNoPeriodo.reduce((s, c) => s + Math.max(0, Number(c.total) || 0), 0);
  const totalPagamentosContas = pagamentosContasNoPeriodo.reduce((s, p) => s + Math.max(0, Number(p.valor) || 0), 0);
  const totalEstornosContas = estornosContasNoPeriodo.reduce((s, e) => s + Math.max(0, Number(e.valor) || 0), 0);
  const totalEntradasCaixa = totalRecebidoNoPeriodo + totalEstornosContas;
  const totalSaidasCaixa = totalDespesasCaixa + totalComprasAvista + totalPagamentosContas;
  const saldoMovimentoCaixa = totalEntradasCaixa - totalSaidasCaixa;
  const comprasPorForma = useMemo(() => {
    const totais = new Map<string, number>();
    for (const compra of comprasNoPeriodo) {
      const forma = compra.forma_pagamento_compra || "não informado";
      totais.set(forma, (totais.get(forma) ?? 0) + Math.max(0, Number(compra.total) || 0));
    }
    return [...totais.entries()].sort((a, b) => b[1] - a[1]);
  }, [comprasNoPeriodo]);
  const categoriasDespesasDisponiveis = useMemo(() => [...new Set(despesas.filter((d) => !intervaloValido || (d.data >= inicio && d.data <= fim)).map((d) => d.categoria?.trim() || "Sem categoria"))].sort((a, b) => a.localeCompare(b, "pt-BR")), [despesas, inicio, fim, intervaloValido]);
  const despesasPorCategoria = useMemo(() => {
    const totais = new Map<string, number>();
    for (const despesa of despesas) {
      if (!intervaloValido || despesa.data < inicio || despesa.data > fim) continue;
      const categoria = despesa.categoria?.trim() || "Sem categoria";
      if (filtroCategoriaDespesa !== "todas" && categoria !== filtroCategoriaDespesa) continue;
      totais.set(categoria, (totais.get(categoria) ?? 0) + (Number(despesa.valor) || 0));
    }
    return [...totais.entries()].sort((a, b) => b[1] - a[1]);
  }, [despesas, inicio, fim, intervaloValido, filtroCategoriaDespesa]);

  // Indicadores atuais não dependem do filtro de entrega do relatório.
  const pedidosEmAberto = pedidosCalculados.filter((p) => p.status !== "cancelado");
  const saldoTotalAReceber = pedidosEmAberto.reduce((s, p) => s + Math.max(0, Number(p.t.saldo) || 0), 0);
  const pedidosComSaldo = pedidosEmAberto.filter((p) => Number(p.t.saldo) > 0).length;
  const saldoAReceberNoPeriodo = lista.reduce((soma, pedido) => soma + Math.max(0, Number(pedido.t.saldo) || 0), 0);

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
  // O resumo considera todos os pedidos não cancelados do período e subtrai
  // custos registrados nos itens, taxas estimadas e despesas lançadas.
  // Compras e contas a pagar são indicadores informativos, não são subtraídos
  // novamente para evitar duplicar insumos já contabilizados no custo da produção.
  const custosProducaoPeriodo = lista.reduce((s, p) => s + Math.max(0, Number(p.t.custo) || 0), 0);
  const taxasPeriodo = lista.reduce((s, p) => s + Math.max(0, Number(p.t.taxas) || 0), 0);
  const lucroTotalPeriodo = contratado.venda - custosProducaoPeriodo - taxasPeriodo - gastos;
  const lucroBruto = realizado.venda - realizado.custo;
  const margemBruta = realizado.venda > 0 ? (lucroBruto / realizado.venda) * 100 : 0;
  const resultado = lucroBruto - realizado.taxas - gastos;

  const porProduto = useMemo(() => {
    const m = new Map<string, { qtd: number; venda: number; custo: number; taxas: number; lucro: number; nome: string }>();
    for (const pedido of entregues) {
      const subtotal = pedido.pedido_itens.reduce((s, item) => s + Number(item.quantidade) * Number(item.preco_unitario), 0);
      for (const item of pedido.pedido_itens) {
        const vendaItem = Number(item.quantidade) * Number(item.preco_unitario);
        const rateio = ratearVendaETaxas(vendaItem, subtotal, pedido.t.venda, pedido.t.taxas);
        const custoItem = Number(item.quantidade) * Number(item.custo_unitario);
        const key = item.produto_id ?? item.descricao;
        const r = m.get(key) ?? { qtd: 0, venda: 0, custo: 0, taxas: 0, lucro: 0, nome: item.descricao || "Produto sem nome" };
        r.qtd += Number(item.quantidade);
        r.venda += rateio.venda;
        r.custo += custoItem;
        r.taxas += rateio.taxas;
        r.lucro += rateio.venda - custoItem - rateio.taxas;
        m.set(key, r);
      }
    }
    return [...m.values()].sort((a, b) => b.lucro - a.lucro);
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
    const sufixo = inicio + "-" + fim;
    if (categoriaRelatorio === "visao-geral") {
      baixarCSV("relatorio-visao-geral-" + sufixo, ["Indicador", "Valor"], [
        ["Vendas totais", contratado.venda],
        ["Compra de insumos", totalComprasInsumos],
        ["Contas a pagar", saldoContasAbertas],
        ["Lucro total estimado", lucroTotalPeriodo],
      ]);
      return;
    }
    if (categoriaRelatorio === "compras") {
      baixarCSV("relatorio-compras-por-insumo-" + sufixo,
        ["Insumo", "Quantidade comprada", "Unidade", "Número de compras", "Gasto total", "Participação nos gastos (%)"],
        gastosPorInsumo.map((item) => [
          item.nome, item.quantidade ?? "Conferir unidades", item.unidade, item.quantidadeCompras, item.total,
          totalComprasFiltradas > 0 ? Number(((item.total / totalComprasFiltradas) * 100).toFixed(2)) : 0,
        ]),
      );
      return;
    }
    if (categoriaRelatorio === "despesas") {
      const despesasNoPeriodo = intervaloValido
        ? despesas.filter((d) => d.data >= inicio && d.data <= fim && (filtroCategoriaDespesa === "todas" || (d.categoria?.trim() || "Sem categoria") === filtroCategoriaDespesa))
        : [];
      baixarCSV("relatorio-despesas-custos-" + sufixo,
        ["Data", "Categoria", "Descrição", "Valor"],
        despesasNoPeriodo.map((d) => [dataBR(d.data), d.categoria || "Sem categoria", d.descricao, Number(d.valor) || 0]),
      );
      return;
    }
    if (categoriaRelatorio === "contas") {
      baixarCSV("relatorio-contas-a-pagar-" + sufixo,
        ["Vencimento", "Descrição", "Fornecedor", "Status", "Valor", "Valor pago", "Saldo pendente"],
        contasPagar.filter((c) => filtroStatusConta === "todas" ? !c.cancelada_em : filtroStatusConta === "cancelado" ? !!c.cancelada_em || c.status === "cancelado" : !c.cancelada_em && c.status === filtroStatusConta).map((c) => [
          dataBR(c.data_vencimento), c.descricao, c.fornecedor || "", c.status,
          Number(c.valor) || 0, Number(c.valor_pago) || 0,
          Math.max(0, Number(c.valor) - Number(c.valor_pago)),
        ]),
      );
      return;
    }
    if (categoriaRelatorio === "caixa") {
      const movimentos = [
        ...recebimentosNoPeriodo.map((p) => [dataBR(p.data_pagamento), "Entrada", "Recebimento de pedido", p.forma_pagamento, Number(p.valor) || 0]),
        ...recebimentosLegadosNoPeriodo.map((p) => [dataBR(p.data_pagamento), "Entrada", "Recebimento legado (data do pedido como referência)", "Pedido #" + p.numero + " · precisa conferir a data real", p.valor]),
        ...estornosContasNoPeriodo.map((e) => [dataBR(e.created_at.slice(0, 10)), "Entrada", "Estorno de conta a pagar", e.motivo, Number(e.valor) || 0]),
        ...despesasCaixaNoPeriodo.map((d) => [dataBR(d.data), "Saída", d.categoria || "Despesa", d.descricao, Number(d.valor) || 0]),
        ...comprasAvistaNoPeriodo.map((c) => [dataBR(c.data_compra), "Saída", "Compra de insumos", c.local_compra || c.forma_pagamento_compra || "", Number(c.total) || 0]),
        ...pagamentosContasNoPeriodo.map((p) => [dataBR(p.data_pagamento), "Saída", "Pagamento de conta", p.forma_pagamento, Number(p.valor) || 0]),
      ].sort((a, b) => String(a[0]).localeCompare(String(b[0])));
      baixarCSV("relatorio-fluxo-caixa-" + inicioRecebimentos + "-" + fimRecebimentos,
        ["Data", "Tipo", "Categoria", "Descrição / forma", "Valor"], movimentos);
      return;
    }
    baixarCSV(
      "relatorio-vendas-lucro-" + sufixo,
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
        <Field label="Data inicial">
          <Input type="date" value={inicio} max={fim} onChange={(e) => navigate({ search: (s) => ({ ...s, inicio: e.target.value }) })} className="h-11 bg-card" />
        </Field>
        <Field label="Data final">
          <Input type="date" value={fim} min={inicio} max={hojeISO()} onChange={(e) => navigate({ search: (s) => ({ ...s, fim: e.target.value }) })} className="h-11 bg-card" />
        </Field>
      </div>
      {!intervaloValido && <p className="mb-4 text-destructive">A data final deve ser igual ou posterior à data inicial.</p>}

      <nav aria-label="Categorias do relatório financeiro" className="mb-6 grid grid-cols-2 gap-2 sm:grid-cols-3">
        {[
          ["visao-geral", "Visão geral"],
          ["vendas", "Vendas e lucro"],
          ["compras", "Compras e insumos"],
          ["contas", "Contas a pagar"],
          ["caixa", "Fluxo de caixa"],
          ["despesas", "Despesas e custos"],
        ].map(([valor, rotulo]) => (
          <Button key={valor} type="button" size="sm" variant={categoriaRelatorio === valor ? "default" : "outline"} aria-pressed={categoriaRelatorio === valor} onClick={() => navigate({ search: (s) => ({ ...s, secao: valor ?? "visao-geral" }) })}>
            {rotulo}
          </Button>
        ))}
      </nav>

      {categoriaRelatorio === "visao-geral" && <>
      <h2 className="mb-3 text-lg font-semibold">Visão geral do período</h2>
      <div className="mb-6 grid grid-cols-2 gap-3">
        <Stat label="Vendas totais" value={brl(contratado.venda)} tone="primary" />
        <Stat label="Compra de insumos" value={brl(totalComprasInsumos)} />
        <Stat label="Contas a pagar" value={brl(saldoContasAbertas)} tone={saldoContasAbertas > 0 ? "danger" : "default"} />
        <Stat label="Lucro total estimado" value={brl(lucroTotalPeriodo)} tone={lucroTotalPeriodo >= 0 ? "success" : "danger"} />
      </div>
      </>}
      {categoriaRelatorio === "contas" && <section className="mb-6 rounded-xl border p-4">
        <h2 className="mb-1 text-lg font-semibold">Saúde financeira atual</h2>
        <p className="mb-4 text-sm text-muted-foreground">
          Estes valores representam a posição atual de todos os pedidos e contas cadastrados, independentemente do período selecionado acima.
        </p>
        <div className="grid grid-cols-2 gap-3">
          <Stat label="A receber dos pedidos no período" value={brl(saldoAReceberNoPeriodo)} tone={saldoAReceberNoPeriodo > 0 ? "primary" : "default"} />
          <Stat label="Total a receber em todos os pedidos" value={brl(saldoTotalAReceber)} tone={saldoTotalAReceber > 0 ? "primary" : "default"} />
          <Stat label="Pedidos com saldo pendente" value={String(pedidosComSaldo)} />
          <Stat label="Contas vencidas" value={brl(saldoContasVencidas)} tone={saldoContasVencidas > 0 ? "danger" : "success"} />
          <Stat label="Contas vencendo em 7 dias" value={brl(saldoContasProximos7Dias)} tone={saldoContasProximos7Dias > 0 ? "danger" : "default"} />
          <Stat label="Total de contas em aberto" value={brl(saldoContasAbertas)} />
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          O total a receber usa o saldo cadastrado em cada pedido não cancelado. Contas a pagar consideram apenas o saldo ainda não quitado. Isso não substitui a conferência dos extratos bancários nem inclui um saldo inicial de caixa.
        </p>
      </section>}
      {categoriaRelatorio === "visao-geral" && <p className="mb-6 text-xs text-muted-foreground">
        Recebimentos no período consideram somente pagamentos com data individual registrada. Pagamentos antigos sem histórico detalhado continuam no valor pago cadastrado, mas não são atribuídos a uma data fictícia. Compras de insumos e contas a pagar são indicadores separados e não são descontados novamente do resultado estimado.
      </p>}

      {categoriaRelatorio === "caixa" && <>
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
          {recebimentosNoPeriodo.length === 0 && recebimentosLegadosNoPeriodo.length === 0 ? <p className="text-sm text-muted-foreground">Nenhum recebimento encontrado neste intervalo.</p> : <>
            {recebimentosNoPeriodo.slice().sort((a, b) => b.data_pagamento.localeCompare(a.data_pagamento)).map((p) => (
              <div key={p.id} className="flex items-start justify-between gap-3 border-t pt-2 text-sm">
                <div><p className="font-medium">{dataBR(p.data_pagamento)} · {p.forma_pagamento}</p>{p.observacoes && <p className="text-muted-foreground">{p.observacoes}</p>}</div>
                <span className="shrink-0 font-semibold">{brl(Number(p.valor))}</span>
              </div>
            ))}
            {recebimentosLegadosNoPeriodo.map((p) => (
              <div key={"legado-" + p.id} className="flex items-start justify-between gap-3 border-t border-dashed pt-2 text-sm">
                <div>
                  <p className="font-medium">Pedido #{p.numero} · {dataBR(p.data_pagamento)}</p>
                  <p className="text-amber-700 dark:text-amber-400">Pagamento antigo sem histórico detalhado · data do pedido usada como referência</p>
                </div>
                <span className="shrink-0 font-semibold">{brl(p.valor)}</span>
              </div>
            ))}
          </>}
        </div>
      </section>
      <section className="mb-6 rounded-xl border p-4">
        <h2 className="mb-1 text-lg font-semibold">Conciliação do fluxo de caixa</h2>
        <p className="mb-4 text-sm text-muted-foreground">
          Compara o dinheiro registrado como recebido e pago no intervalo acima. O saldo é a diferença dos movimentos deste período, não o saldo bancário total da empresa.
        </p>
        <div className="mb-4 grid grid-cols-2 gap-3">
          <Stat label="Entradas registradas" value={brl(totalEntradasCaixa)} tone="primary" />
          <Stat label="Saídas registradas" value={brl(totalSaidasCaixa)} />
          <Stat label="Saldo do período" value={brl(saldoMovimentoCaixa)} tone={saldoMovimentoCaixa >= 0 ? "success" : "danger"} />
          <Stat label="Estornos de contas" value={brl(totalEstornosContas)} />
        </div>
        <div className="space-y-2">
          <Row label="Recebimentos detalhados" value={brl(totalRecebidoDetalhadoNoPeriodo)} />
          <Row label="Pedidos antigos sem histórico (data do pedido como referência)" value={brl(totalRecebidoLegadoNoPeriodo)} />
          <Row label="Estornos de pagamentos (entrada)" value={brl(totalEstornosContas)} />
          <Row label="Despesas registradas" value={brl(totalDespesasCaixa)} />
          <Row label="Compras pagas sem crédito" value={brl(totalComprasAvista)} />
          <Row label="Pagamentos de contas a pagar" value={brl(totalPagamentosContas)} />
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          Para pedidos antigos sem histórico de pagamento, a data de entrega é priorizada quando está no período; caso contrário, usa-se a data de cadastro. É uma referência de conciliação, não uma confirmação da data real do recebimento. Compras no crédito entram quando as parcelas são pagas. O saldo não inclui saldo inicial nem movimentações externas ao sistema.
        </p>
      </section>
      </>}
      {categoriaRelatorio === "vendas" && <section className="mb-6 border-y py-4">
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
      </section>}

      {categoriaRelatorio === "despesas" && <section className="mb-6">
        <h2 className="mb-3 text-lg font-semibold">Despesas por categoria</h2>
        <Field label="Filtrar categoria">
          <select className="h-11 w-full rounded-md border bg-card px-3 text-sm" value={filtroCategoriaDespesa} onChange={(e) => setFiltroCategoriaDespesa(e.target.value)}>
            <option value="todas">Todas as categorias</option>
            {categoriasDespesasDisponiveis.map((categoria) => <option key={categoria} value={categoria}>{categoria}</option>)}
          </select>
        </Field>
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
      </section>}

      {categoriaRelatorio === "compras" && <section className="mb-6">
        <h2 className="mb-1 text-lg font-semibold">Gastos por insumo</h2>
        <p className="mb-3 text-sm text-muted-foreground">Veja quanto foi gasto com cada produto comprado no período selecionado. Quantidades de peso são convertidas para kg, de volume para L e de dúzias para unidades antes da soma. Compras canceladas não entram no cálculo.</p>
        <Field label="Filtrar forma de pagamento">
          <select className="h-11 w-full rounded-md border bg-card px-3 text-sm" value={filtroFormaCompra} onChange={(e) => setFiltroFormaCompra(e.target.value)}>
            <option value="todas">Todas as formas</option>
            {[...new Set(comprasNoPeriodo.map((c) => c.forma_pagamento_compra || "não informado"))].sort().map((forma) => <option key={forma} value={forma}>{forma.replaceAll("_", " ")}</option>)}
          </select>
        </Field>
        <div className="mb-3 grid grid-cols-2 gap-3">
          <Stat label="Total de compras filtradas" value={brl(totalComprasFiltradas)} />
          <Stat label="Insumos comprados" value={String(gastosPorInsumo.length)} />
        </div>
        <details className="mt-3 rounded-xl border px-3">
          <summary className="cursor-pointer py-3 text-sm font-medium">Detalhar gastos por insumo ({gastosPorInsumo.length})</summary>
          {!gastosPorInsumo.length ? <Empty>Nenhuma compra com itens registrada no período.</Empty> : (
            <div className="divide-y">
              {gastosPorInsumo.map((item) => (
                <div key={item.id} className="py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-medium">{item.nome}</p>
                      <p className="text-xs text-muted-foreground">{item.quantidade === null ? "Confira as unidades cadastradas" : `${num(item.quantidade)} ${item.unidade}`} · {item.quantidadeCompras} compra(s)</p>
                    </div>
                    <b className="shrink-0">{brl(item.total)}</b>
                  </div>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
                    <div className="h-full rounded-full bg-primary" style={{ width: totalComprasFiltradas > 0 ? Math.min(100, (item.total / totalComprasFiltradas) * 100) + "%" : "0%" }} />
                  </div>
                  <p className="mt-1 text-right text-xs text-muted-foreground">{(totalComprasFiltradas > 0 ? (item.total / totalComprasFiltradas) * 100 : 0).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}% dos gastos</p>
                </div>
              ))}
            </div>
          )}
        </details>
        <details className="mt-3 rounded-xl border px-3">
          <summary className="cursor-pointer py-3 text-sm font-medium">Gastos por forma de pagamento ({comprasPorForma.length})</summary>
          {!comprasPorForma.length ? <p className="pb-3 text-sm text-muted-foreground">Nenhuma compra registrada no período.</p> : (
            <div className="divide-y">
              {comprasPorForma.map(([forma, valor]) => (
                <Row key={forma} label={forma.replaceAll("_", " ")} value={brl(valor)} />
              ))}
            </div>
          )}
        </details>
        <p className="mt-2 text-xs text-muted-foreground">O gasto por insumo usa o valor de cada item da compra; a forma de pagamento é um resumo separado do total das compras, não do valor efetivamente pago em cada data.</p>
      </section>}

      {categoriaRelatorio === "contas" && <section className="mb-6 rounded-xl border p-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">Contas a pagar</h2>
          <Link to="/contas-pagar" className="text-sm font-medium text-primary">Ver detalhes</Link>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Stat label="Saldo em aberto" value={brl(saldoContasAbertas)} />
          <Stat label="Contas vencidas" value={brl(saldoContasVencidas)} tone={saldoContasVencidas > 0 ? "danger" : "default"} />
        </div>
        <div className="mt-4">
          <Field label="Filtrar situação">
            <select className="h-11 w-full rounded-md border bg-card px-3 text-sm" value={filtroStatusConta} onChange={(e) => setFiltroStatusConta(e.target.value)}>
              <option value="todas">Todas as situações</option>
              <option value="pendente">Pendente</option>
              <option value="parcial">Parcialmente paga</option>
              <option value="pago">Paga</option>
              <option value="cancelado">Cancelada</option>
            </select>
          </Field>
          {(() => {
            const contasFiltradas = contasPagar
              .filter((c) => filtroStatusConta === "todas" ? !c.cancelada_em : filtroStatusConta === "cancelado" ? !!c.cancelada_em || c.status === "cancelado" : !c.cancelada_em && c.status === filtroStatusConta)
              .sort((a, b) => a.data_vencimento.localeCompare(b.data_vencimento));
            return (
              <details className="mt-3 rounded-xl border px-3">
                <summary className="cursor-pointer py-3 text-sm font-medium">Detalhar contas ({contasFiltradas.length})</summary>
                {contasFiltradas.length === 0 ? <p className="pb-3 text-sm text-muted-foreground">Nenhuma conta encontrada para essa situação.</p> : (
                  <div className="divide-y">
                    {contasFiltradas.map((c) => {
                      const statusExibido = c.cancelada_em || c.status === "cancelado" ? "Cancelada"
                        : c.status === "parcial" ? "Parcialmente paga"
                        : c.status === "pago" ? "Paga"
                        : c.status === "pendente" ? "Pendente" : c.status;
                      return (
                        <div key={c.id} className="flex items-start justify-between gap-3 py-3 text-sm">
                          <div className="min-w-0"><p className="font-medium">{c.descricao}</p><p className="text-xs text-muted-foreground">{c.fornecedor || "Fornecedor não informado"} · Vencimento {dataBR(c.data_vencimento)} · {statusExibido}</p><p className="text-xs text-muted-foreground">Pago: {brl(Number(c.valor_pago) || 0)} · Saldo: {brl(Math.max(0, Number(c.valor) - Number(c.valor_pago)))}</p></div>
                          <b className="shrink-0">{brl(Number(c.valor) || 0)}</b>
                        </div>
                      );
                    })}
                  </div>
                )}
              </details>
            );
          })()}
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          Valores atuais, independentemente do período de entrega selecionado. Esses compromissos não são descontados novamente do resultado estimado; registre despesas pagas uma única vez para evitar duplicidade.
        </p>
      </section>}

      {categoriaRelatorio === "vendas" && <section className="mb-6">
        <h2 className="mb-3 text-lg font-semibold">Rentabilidade estimada por produto</h2>
        <p className="mb-3 text-xs text-muted-foreground">Somente pedidos entregues no período. A venda e as taxas/impostos do pedido são rateados proporcionalmente entre os itens para considerar descontos e entrega. Os custos usam a receita e os preços atuais cadastrados; embalagens precisam estar cadastradas como insumos da receita.</p>
        {!porProduto.length ? <Empty>Nenhuma venda entregue no período.</Empty> : (
          <div className="divide-y">
            {porProduto.map((p, i) => (
              <div key={i} className="py-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="break-words font-medium">{i + 1}. {p.nome}</p>
                    <p className="text-xs text-muted-foreground">{num(p.qtd)} unidades · Venda considerada {brl(p.venda)}</p>
                  </div>
                  <b className={p.lucro >= 0 ? "whitespace-nowrap text-success" : "whitespace-nowrap text-destructive"}>{brl(p.lucro)}</b>
                </div>
                <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-muted-foreground">
                  <span>Custo total: {brl(p.custo)}</span>
                  <span>Taxas/impostos: {brl(p.taxas)}</span>
                  <span>Margem estimada: {String((p.venda > 0 ? (p.lucro / p.venda) * 100 : 0).toLocaleString("pt-BR", { maximumFractionDigits: 1 }))}%</span>
                </div>
              </div>
            ))}
          </div>
        )}
        <p className="mt-3 text-xs text-muted-foreground">É uma margem de contribuição estimada, não o lucro contábil final: despesas gerais não são rateadas automaticamente. Gás, energia e mão de obra entram quando cadastrados no custo da receita; evite lançá-los novamente como despesas se já estiverem incluídos.</p>
      </section>}

      {categoriaRelatorio === "vendas" && <section className="mb-5">
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
      </section>}

      {categoriaRelatorio === "vendas" && <>
      <p className="mb-2 text-xs text-muted-foreground">
        Valores recebidos e saldo são estimativas dos pedidos com entrega no período, não um extrato por data de pagamento. O sistema ainda não registra cada pagamento parcial com sua própria data.
      </p>
      <p className="text-xs text-muted-foreground">
        Para itens avulsos sem produto/receita cadastrada, o relatório mantém o custo salvo no pedido. Taxas e impostos são estimativas conforme as configurações atuais.
      </p>
      </>}
    </>
  );
}
