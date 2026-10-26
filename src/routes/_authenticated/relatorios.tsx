import * as appQueries from "@/lib/queries";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { endOfMonth, format } from "date-fns";
import { Download } from "lucide-react";
import { configQ, despesasQ, pedidosQ } from "@/lib/queries";
import { calcularRecebimentoPedido, recebimentoLegadoPendente, ratearVendaETaxas, totaisPedido } from "@/lib/calc";
import { medida } from "@/lib/ingredient-cost";
import { brl, dataBR, hojeISO, mesISO, num } from "@/lib/format";
import { baixarCSV } from "@/lib/csv";
import { PageHeader, Field, Stat, Row, Empty } from "@/components/app/ui";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

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
      typeof valor === "string" && /^\d{4}-\d{2}-\d{2}$/.test(valor);
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
  const initialSearch = Route.useSearch();
  return <RelatoriosConteudo initialSearch={initialSearch} />;
}

type RelatorioSearch = {
  inicio: string;
  fim: string;
  secao: string;
  dataBase: string;
};

export function RelatoriosEmbedded() {
  return <RelatoriosConteudo initialSearch={{ inicio: mesISO() + "-01", fim: hojeISO(), secao: "visao-geral", dataBase: "entrega" as const }} embedded />;
}

function RelatoriosConteudo({ initialSearch, embedded = false }: { initialSearch: RelatorioSearch; embedded?: boolean }) {
  const [search, setSearch] = useState<RelatorioSearch>(initialSearch);
  const { inicio, fim, secao, dataBase } = search;
  const navigate = useNavigate();
  const atualizarBusca = (patch: Partial<RelatorioSearch>) => setSearch((atual) => ({ ...atual, ...patch }));
  const [inicioRecebimentos, setInicioRecebimentos] = useState(inicio);
  const [fimRecebimentos, setFimRecebimentos] = useState(fim);
  const categoriaRelatorio = secao;
  useEffect(() => {
    setInicioRecebimentos(inicio);
    setFimRecebimentos(fim);
  }, [inicio, fim]);
  const [filtroStatusConta, setFiltroStatusConta] = useState("todas");
  const [filtroFormaCompra, setFiltroFormaCompra] = useState("todas");
  const [visaoCompras, setVisaoCompras] = useState("insumo");
  const [ordenacaoCompras, setOrdenacaoCompras] = useState("gasto");
  const [filtroCategoriaDespesa, setFiltroCategoriaDespesa] = useState("todas");
  const [filtroClienteVendas, setFiltroClienteVendas] = useState("todos");
  const [resumoAtivo, setResumoAtivo] = useState<"vendas" | "compras" | "contas" | "lucro" | "futuros" | null>(null);
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
  // O relatório usa o custo gravado no item do pedido no momento da venda.
  // Alterações posteriores na receita ou nos preços dos insumos não reescrevem
  // o resultado histórico; o custo atual fica restrito às telas de cadastro/custeio.
  const pedidosCalculados = useMemo(() => {
    // Indexa o histórico uma vez, evitando percorrer todos os pagamentos para
    // cada pedido quando o relatório reúne muitos pedidos e recebimentos.
    const pagamentosPorPedido = new Map<string, number>();
    for (const pagamento of pagamentosPedidos) {
      pagamentosPorPedido.set(
        pagamento.pedido_id,
        (pagamentosPorPedido.get(pagamento.pedido_id) ?? 0) + Math.max(0, Number(pagamento.valor) || 0),
      );
    }

    return pedidos.map((pedido) => {
      const totais = totaisPedido(pedido, config);
      const recebimento = calcularRecebimentoPedido({
        venda: totais.venda,
        status: pedido.status,
        saldo_quitado: pedido.saldo_quitado,
        valor_entrada: totais.recebido,
        pagamentosDetalhados: pagamentosPorPedido.get(pedido.id) ?? 0,
      });
      return { ...pedido, t: { ...totais, ...recebimento } };
    });
  }, [pedidos, config, pagamentosPedidos]);

  const listaPeriodo = intervaloValido
    ? pedidosCalculados.filter((p) => {
      if (p.status === "cancelado") return false;
      const dataReferencia = dataBase === "criacao"
        ? String(p.created_at ?? "").slice(0, 10)
        : p.data_entrega;
      return dataReferencia >= inicio && dataReferencia <= fim;
    })
    : [];
  const clientesDisponiveis = [...new Map(listaPeriodo.map((p) => [
    p.cliente_id ?? "sem-cliente",
    { id: p.cliente_id ?? "sem-cliente", nome: p.clientes?.nome ?? "Sem cliente" },
  ] as const)).values()].sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
  const lista = listaPeriodo.filter((p) =>
    filtroClienteVendas === "todos" ||
    (p.cliente_id ?? "sem-cliente") === filtroClienteVendas,
  );
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
  const comprasPorId = useMemo(() => new Map(compras.map((compra) => [compra.id, compra])), [compras]);
  const comprasAgrupadasPorLocal = useMemo(() => {
    const grupos = new Map<string, { local: string; total: number; quantidade: number; dataMaisRecente: string }>();
    for (const compra of comprasFiltradasForma) {
      const local = compra.local_compra?.trim() || "Local não informado";
      const atual = grupos.get(local);
      if (atual) {
        atual.total += Math.max(0, Number(compra.total) || 0);
        atual.quantidade += 1;
        if (compra.data_compra > atual.dataMaisRecente) atual.dataMaisRecente = compra.data_compra;
      } else {
        grupos.set(local, { local, total: Math.max(0, Number(compra.total) || 0), quantidade: 1, dataMaisRecente: compra.data_compra });
      }
    }
    return [...grupos.values()].sort((a, b) => ordenacaoCompras === "recente"
      ? b.dataMaisRecente.localeCompare(a.dataMaisRecente)
      : ordenacaoCompras === "quantidade"
        ? b.quantidade - a.quantidade
        : ordenacaoCompras === "preco"
          ? (b.quantidade ? b.total / b.quantidade : 0) - (a.quantidade ? a.total / a.quantidade : 0)
          : b.total - a.total);
  }, [comprasFiltradasForma, ordenacaoCompras]);
  const parcelasComprasNoPeriodo = useMemo(() => {
    // "Parcelas a pagar" lista compromissos ainda abertos, inclusive vencimentos futuros.
    // O filtro geral do relatório limita a data final a hoje; por isso não pode limitar
    // esta visão, que precisa mostrar também parcelas futuras de compras no crédito.
    const contasReais = contasPagar.filter((conta) => {
      if (conta.cancelada_em || conta.status === "cancelado" || !conta.compra_id) return false;
      const compra = comprasPorId.get(conta.compra_id);
      if (!compra || compra.cancelada_em || compra.forma_pagamento_compra !== "credito") return false;
      if (Math.max(0, Number(conta.valor) - Number(conta.valor_pago)) <= 0.009) return false;
      return filtroFormaCompra === "todas" || compra.forma_pagamento_compra === filtroFormaCompra;
    });

    const comprasSemParcelasAtivas = compras.filter((compra) => {
      if (compra.cancelada_em || compra.forma_pagamento_compra !== "credito") return false;
      if (filtroFormaCompra !== "todas" && compra.forma_pagamento_compra !== filtroFormaCompra) return false;
      // Se já existe uma conta não cancelada, usa somente os lançamentos reais.
      // Se só restaram contas canceladas, recupera a visualização sem gravar no banco.
      return !contasPagar.some((conta) =>
        conta.compra_id === compra.id && !conta.cancelada_em && conta.status !== "cancelado"
      );
    });

    const parcelasLegadas = comprasSemParcelasAtivas.flatMap((compra) => {
      const quantidade = Math.min(24, Math.max(1, Math.trunc(Number(compra.numero_parcelas) || 1)));
      const totalCentavos = Math.max(0, Math.round(Number(compra.total || 0) * 100));
      if (totalCentavos <= 0) return [];
      const baseCentavos = Math.floor(totalCentavos / quantidade);
      const primeiroVencimento = compra.primeiro_vencimento || compra.data_compra;
      return Array.from({ length: quantidade }, (_, index) => {
        const data = new Date(`${primeiroVencimento}T12:00:00`);
        data.setMonth(data.getMonth() + index);
        const vencimento = `${data.getFullYear()}-${String(data.getMonth() + 1).padStart(2, "0")}-${String(data.getDate()).padStart(2, "0")}`;
        const centavos = index === quantidade - 1 ? totalCentavos - baseCentavos * (quantidade - 1) : baseCentavos;
        return {
          id: `legada-${compra.id}-${index + 1}`,
          compra_id: compra.id,
          descricao: `Compra no cartão de crédito · Parcela ${index + 1}/${quantidade}`,
          fornecedor: compra.local_compra,
          data_vencimento: vencimento,
          valor: centavos / 100,
          valor_pago: 0,
          status: "pendente",
          cancelada_em: null,
          forma_pagamento: "Cartão de crédito",
          compra_parcela_numero: index + 1,
          compra_parcelas_total: quantidade,
          gerada_automaticamente: true,
        };
      });
    });

    return [...contasReais, ...parcelasLegadas].sort((a, b) => ordenacaoCompras === "recente"
      ? b.data_vencimento.localeCompare(a.data_vencimento)
      : ordenacaoCompras === "quantidade"
        ? (Number(b.valor) || 0) - (Number(a.valor) || 0)
        : (Math.max(0, Number(b.valor) - Number(b.valor_pago))) - (Math.max(0, Number(a.valor) - Number(a.valor_pago))));
  }, [contasPagar, compras, comprasPorId, filtroFormaCompra, ordenacaoCompras]);
  const parcelasFuturasPorMes = useMemo(() => {
    const hoje = hojeISO();
    const abertas = contasPagar.filter((conta) => {
      if (conta.cancelada_em || conta.status === "cancelado" || !conta.compra_id) return false;
      const compra = comprasPorId.get(conta.compra_id);
      if (!compra || compra.cancelada_em) return false;
      // Débito, Pix e dinheiro são pagamentos à vista e não entram em vencimentos futuros.
      if (compra.forma_pagamento_compra !== "credito") return false;
      if (filtroFormaCompra !== "todas" && (compra.forma_pagamento_compra || "não informado") !== filtroFormaCompra) return false;
      return conta.data_vencimento >= hoje && Math.max(0, Number(conta.valor) - Number(conta.valor_pago)) > 0.009;
    });
    const grupos = new Map<string, { mes: string; total: number; parcelas: typeof abertas }>();
    for (const conta of abertas) {
      const mes = conta.data_vencimento.slice(0, 7);
      const saldo = Math.max(0, Number(conta.valor) - Number(conta.valor_pago));
      const grupo = grupos.get(mes);
      if (grupo) { grupo.total += saldo; grupo.parcelas.push(conta); }
      else grupos.set(mes, { mes, total: saldo, parcelas: [conta] });
    }
    return [...grupos.values()].sort((x, y) => x.mes.localeCompare(y.mes)).map((grupo) => ({
      ...grupo,
      titulo: new Date(Number(grupo.mes.slice(0, 4)), Number(grupo.mes.slice(5, 7)) - 1, 1).toLocaleDateString("pt-BR", { month: "long", year: "numeric" }),
      parcelas: grupo.parcelas.sort((x, y) => x.data_vencimento.localeCompare(y.data_vencimento)),
    }));
  }, [contasPagar, comprasPorId, filtroFormaCompra]);
  const parcelasCompraVencidas = useMemo(() => contasPagar.filter((conta) => {
    if (conta.cancelada_em || conta.status === "cancelado" || !conta.compra_id || conta.data_vencimento >= hojeISO()) return false;
    const compra = comprasPorId.get(conta.compra_id);
    if (!compra || compra.cancelada_em) return false;
    if (compra.forma_pagamento_compra !== "credito") return false;
    if (filtroFormaCompra !== "todas" && (compra.forma_pagamento_compra || "não informado") !== filtroFormaCompra) return false;
    return Math.max(0, Number(conta.valor) - Number(conta.valor_pago)) > 0.009;
  }), [contasPagar, comprasPorId, filtroFormaCompra]);
  const totalParcelasFuturas = parcelasFuturasPorMes.reduce((s, grupo) => s + grupo.total, 0);
  const totalParcelasVencidas = parcelasCompraVencidas.reduce((s, conta) => s + Math.max(0, Number(conta.valor) - Number(conta.valor_pago)), 0);
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
  const totalDetalhadoPorPedido = new Map<string, number>();
  for (const pagamento of pagamentosPedidos) {
    totalDetalhadoPorPedido.set(
      pagamento.pedido_id,
      (totalDetalhadoPorPedido.get(pagamento.pedido_id) ?? 0) + Math.max(0, Number(pagamento.valor) || 0),
    );
  }
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
      const detalhado = totalDetalhadoPorPedido.get(pedido.id) ?? 0;
      const faltante = recebimentoLegadoPendente(Number(pedido.t.recebido), detalhado);
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
  // Pedidos futuros são identificados pela data de entrega, sem depender do filtro do relatório.
  const pedidosFuturosComSaldo = pedidosEmAberto.filter(
    (p) => p.data_entrega > hojeISO() && Number(p.t.saldo) > 0,
  );
  const saldoPedidosFuturosAReceber = pedidosFuturosComSaldo.reduce(
    (s, p) => s + Math.max(0, Number(p.t.saldo) || 0),
    0,
  );
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

  function exportar() {
    const sufixo = inicio + "-" + fim;
    if (categoriaRelatorio === "visao-geral") {
      baixarCSV("relatorio-visao-geral-" + sufixo, ["Indicador", "Valor"], [
        ["Vendas totais", contratado.venda],
        ["Compra de insumos", totalComprasInsumos],
        ["Contas a pagar", saldoContasAbertas],
        ["A receber de pedidos futuros", saldoPedidosFuturosAReceber],
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
      {embedded ? (
        <div className="mb-5 flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">Relatório financeiro</h2>
          <Button size="sm" variant="outline" className="h-11" aria-label="Exportar relatório financeiro em CSV" onClick={exportar}>
            <Download className="size-4" /> <span>Exportar CSV</span>
          </Button>
        </div>
      ) : <PageHeader title="Relatórios" back="/mais" action={
        <Button size="sm" variant="outline" className="h-11" aria-label="Exportar relatório financeiro em CSV" onClick={exportar}>
          <Download className="size-4" /> <span>Exportar CSV</span>
        </Button>
      } />}
      <div className="mb-5 grid grid-cols-2 gap-3">
        <Field label="Data inicial">
          <Input type="date" value={inicio} max={fim} onChange={(e) => atualizarBusca({ inicio: e.target.value })} className="h-11 bg-card" />
        </Field>
        <Field label="Data final">
          <Input type="date" value={fim} min={inicio} max={hojeISO()} onChange={(e) => atualizarBusca({ fim: e.target.value })} className="h-11 bg-card" />
        </Field>
      </div>
      {!intervaloValido && <p className="mb-4 text-destructive">A data final deve ser igual ou posterior à data inicial.</p>}

      <div className="mb-6">
        <Field label="Tipo de relatório">
          <select
            aria-label="Tipo de relatório financeiro"
            className="h-11 w-full rounded-md border bg-card px-3 text-sm"
            value={categoriaRelatorio}
            onChange={(e) => atualizarBusca({ secao: e.target.value })}
          >
            <option value="visao-geral">Visão geral</option>
            <option value="vendas">Vendas e lucro</option>
            <option value="compras">Compras e insumos</option>
            <option value="contas">Contas a pagar</option>
            <option value="caixa">Fluxo de caixa</option>
            <option value="despesas">Despesas e custos</option>
          </select>
        </Field>
      </div>

      {categoriaRelatorio === "vendas" && <div className="mb-5">
        <Field label="Filtrar cliente">
          <select className="h-11 w-full rounded-md border bg-card px-3 text-sm" value={filtroClienteVendas} onChange={(e) => setFiltroClienteVendas(e.target.value)}>
            <option value="todos">Todos os clientes</option>
            {clientesDisponiveis.map((cliente) => <option key={cliente.id} value={cliente.id}>{cliente.nome}</option>)}
          </select>
        </Field>
      </div>}

      {categoriaRelatorio === "visao-geral" && <>
      <h2 className="mb-3 text-lg font-semibold">Visão geral do período</h2>
      <div className="mb-6 grid grid-cols-2 gap-3">
        <button type="button" onClick={() => setResumoAtivo("vendas")} aria-label="Ver pedidos que compõem as vendas totais" className="w-full rounded-xl text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <Stat label="Vendas totais" value={brl(contratado.venda)} tone="primary" />
        </button>
        <button type="button" onClick={() => setResumoAtivo("compras")} aria-label="Ver compras de insumos" className="w-full rounded-xl text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <Stat label="Compra de insumos" value={brl(totalComprasInsumos)} />
        </button>
        <button type="button" onClick={() => setResumoAtivo("contas")} aria-label="Ver contas a pagar" className="w-full rounded-xl text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <Stat label="Contas a pagar" value={brl(saldoContasAbertas)} tone={saldoContasAbertas > 0 ? "danger" : "default"} />
        </button>
        <button type="button" onClick={() => setResumoAtivo("lucro")} aria-label="Ver composição do lucro estimado" className="w-full rounded-xl text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <Stat label="Lucro total estimado" value={brl(lucroTotalPeriodo)} tone={lucroTotalPeriodo >= 0 ? "success" : "danger"} />
        </button>
      </div>
      <section className="mb-6 rounded-xl border p-4">
        <h2 className="mb-3 text-lg font-semibold">Pedidos futuros a receber</h2>
        <div className="grid grid-cols-2 gap-3">
          <button type="button" onClick={() => setResumoAtivo("futuros")} aria-label="Ver saldo a receber de pedidos futuros" className="w-full rounded-xl text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <Stat label="Saldo a receber" value={brl(saldoPedidosFuturosAReceber)} tone={saldoPedidosFuturosAReceber > 0 ? "primary" : "default"} />
          </button>
          <button type="button" onClick={() => setResumoAtivo("futuros")} aria-label="Ver pedidos futuros com saldo" className="w-full rounded-xl text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <Stat label="Pedidos com saldo" value={String(pedidosFuturosComSaldo.length)} />
          </button>
        </div>
      </section>
      <Dialog open={resumoAtivo !== null} onOpenChange={(aberto) => { if (!aberto) setResumoAtivo(null); }}>
        <DialogContent className="max-h-[82vh] overflow-hidden p-4 sm:max-w-xl">
          <DialogHeader className="pr-8 text-left">
            <DialogTitle>
              {resumoAtivo === "vendas" ? "Pedidos que compõem as vendas"
                : resumoAtivo === "compras" ? "Compras de insumos"
                : resumoAtivo === "contas" ? "Contas a pagar"
                : resumoAtivo === "lucro" ? "Composição do lucro estimado"
                : "Pedidos futuros a receber"}
            </DialogTitle>
            <DialogDescription className="text-xs">
              {resumoAtivo === "vendas" || resumoAtivo === "lucro" ? `Período: ${dataBR(inicio)} a ${dataBR(fim)}`
                : resumoAtivo === "compras" ? `Compras registradas de ${dataBR(inicio)} a ${dataBR(fim)}`
                : resumoAtivo === "contas" ? "Posição atual das contas não canceladas."
                : "Pedidos com entrega após hoje e saldo pendente, fora do filtro de datas."}
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-[52vh] space-y-2 overflow-y-auto pr-1">
            {resumoAtivo === "vendas" && (lista.length === 0
              ? <Empty>Nenhum pedido encontrado neste período.</Empty>
              : lista.slice().sort((a, b) => b.data_entrega.localeCompare(a.data_entrega)).map((p) => (
                <Link key={p.id} to="/pedidos/$id" params={{ id: p.id }} onClick={() => setResumoAtivo(null)} className="flex items-start justify-between gap-3 rounded-lg border p-3 text-sm hover:bg-muted/50">
                  <div className="min-w-0"><p className="font-medium">Pedido #{p.numero} · {p.clientes?.nome ?? "Sem cliente"}</p><p className="text-xs text-muted-foreground">{dataBR(p.data_entrega)} · {p.status === "em_producao" ? "Em produção" : p.status === "recebido" ? "Recebido" : p.status === "pronto" ? "Pronto" : p.status === "entregue" || p.status === "finalizado" ? "Entregue" : p.status}</p><p className="text-xs text-muted-foreground">Recebido: {brl(p.t.recebido)} · Saldo: {brl(Math.max(0, Number(p.t.saldo) || 0))}</p></div>
                  <b className="shrink-0">{brl(p.t.venda)}</b>
                </Link>
              )))}
            {resumoAtivo === "compras" && (comprasNoPeriodo.length === 0
              ? <Empty>Nenhuma compra encontrada neste período.</Empty>
              : comprasNoPeriodo.slice().sort((a, b) => b.data_compra.localeCompare(a.data_compra)).map((compra) => {
                const itens = itensCompra.filter((item) => item.compra_id === compra.id);
                return <div key={compra.id} className="rounded-lg border p-3 text-sm">
                  <div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="font-medium">{compra.local_compra || "Local não informado"}</p><p className="text-xs text-muted-foreground">{dataBR(compra.data_compra)} · {compra.forma_pagamento_compra || "Forma não informada"}</p></div><b className="shrink-0">{brl(Number(compra.total) || 0)}</b></div>
                  {itens.length > 0 && <div className="mt-2 space-y-1 border-t pt-2">{itens.map((item) => <div key={item.id} className="flex justify-between gap-3 text-xs"><span>{insumosPorId.get(item.insumo_id)?.nome ?? "Insumo removido"} · {num(Number(item.quantidade) || 0)} {item.unidade}</span><span className="shrink-0">{brl(Number(item.total) || 0)}</span></div>)}</div>}
                </div>;
              }))}
            {resumoAtivo === "contas" && (contasAbertas.length === 0
              ? <Empty>Nenhuma conta em aberto.</Empty>
              : contasAbertas.slice().sort((a, b) => a.data_vencimento.localeCompare(b.data_vencimento)).map((conta) => (
                <div key={conta.id} className="flex items-start justify-between gap-3 rounded-lg border p-3 text-sm">
                  <div className="min-w-0"><p className="font-medium">{conta.descricao}</p><p className="text-xs text-muted-foreground">{conta.fornecedor || "Fornecedor não informado"} · Vencimento {dataBR(conta.data_vencimento)}</p><p className="text-xs text-muted-foreground">Pago: {brl(Number(conta.valor_pago) || 0)} · Saldo: {brl(Math.max(0, Number(conta.valor) - Number(conta.valor_pago)))}</p></div>
                  <b className="shrink-0">{brl(Number(conta.valor) || 0)}</b>
                </div>
              )))}
            {resumoAtivo === "lucro" && <>
              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-lg bg-muted/50 p-3"><p className="text-xs text-muted-foreground">Vendas contratadas</p><b>{brl(contratado.venda)}</b></div>
                <div className="rounded-lg bg-muted/50 p-3"><p className="text-xs text-muted-foreground">Custos de produção</p><b>{brl(custosProducaoPeriodo)}</b></div>
                <div className="rounded-lg bg-muted/50 p-3"><p className="text-xs text-muted-foreground">Taxas estimadas</p><b>{brl(taxasPeriodo)}</b></div>
                <div className="rounded-lg bg-muted/50 p-3"><p className="text-xs text-muted-foreground">Despesas</p><b>{brl(gastos)}</b></div>
              </div>
              {lista.length === 0 ? <Empty>Nenhum pedido encontrado neste período.</Empty> : lista.slice().sort((a, b) => b.data_entrega.localeCompare(a.data_entrega)).map((p) => <div key={p.id} className="flex items-start justify-between gap-3 border-b py-2 text-sm"><div className="min-w-0"><p className="font-medium">Pedido #{p.numero} · {p.clientes?.nome ?? "Sem cliente"}</p><p className="text-xs text-muted-foreground">Venda {brl(p.t.venda)} · Custo {brl(p.t.custo)} · Taxas {brl(p.t.taxas)}</p></div><b className="shrink-0">{brl(p.t.lucroLiquido)}</b></div>)}
            </>}
            {resumoAtivo === "futuros" && (pedidosFuturosComSaldo.length === 0
              ? <Empty>Nenhum pedido futuro com saldo pendente.</Empty>
              : pedidosFuturosComSaldo.slice().sort((a, b) => a.data_entrega.localeCompare(b.data_entrega)).map((p) => (
                <Link key={p.id} to="/pedidos/$id" params={{ id: p.id }} onClick={() => setResumoAtivo(null)} className="flex items-start justify-between gap-3 rounded-lg border p-3 text-sm hover:bg-muted/50">
                  <div className="min-w-0"><p className="font-medium">Pedido #{p.numero} · {p.clientes?.nome ?? "Sem cliente"}</p><p className="text-xs text-muted-foreground">Entrega {dataBR(p.data_entrega)} · Saldo pendente {brl(Math.max(0, Number(p.t.saldo) || 0))}</p></div><b className="shrink-0">{brl(p.t.venda)}</b>
                </Link>
              )))}
          </div>
          <DialogFooter className="flex-row gap-2 sm:justify-between sm:space-x-0">
            <Button type="button" variant="outline" onClick={() => setResumoAtivo(null)}>Fechar</Button>
            <Button type="button" onClick={() => {
              const destino = resumoAtivo;
              setResumoAtivo(null);
              if (destino === "compras") navigate({ to: "/compras", search: { secao: "compras" } });
              else if (destino === "contas") navigate({ to: "/contas-pagar" });
              else if (destino === "vendas" || destino === "lucro") atualizarBusca({ secao: "vendas" });
              else navigate({ to: "/pedidos", search: { filtro: "a_receber", dataInicial: undefined, dataFinal: undefined } });
            }}>Ver mais detalhes</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
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
        <p className="mt-3 text-xs text-muted-foreground">
          
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
        <h2 className="mb-1 text-lg font-semibold">Compras e insumos</h2>
        <p className="mb-3 text-sm text-muted-foreground">Período pela data da compra, exceto na visão de parcelas, que usa o vencimento. Compras canceladas não entram nos totais.</p>
        <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Mostrar por">
            <select className="h-11 w-full rounded-md border bg-card px-3 text-sm" value={visaoCompras} onChange={(e) => setVisaoCompras(e.target.value)}>
              <option value="insumo">Insumo</option>
              <option value="compra">Compra individual</option>
              <option value="local">Local de compra</option>
              <option value="parcelas">Parcelas a pagar</option>
              <option value="vencimentos">Vencimentos por mês</option>
            </select>
          </Field>
          <Field label="Forma de pagamento">
            <select className="h-11 w-full rounded-md border bg-card px-3 text-sm" value={filtroFormaCompra} onChange={(e) => setFiltroFormaCompra(e.target.value)}>
              <option value="todas">Todas as formas</option>
              {[...new Set(compras.filter((c) => !c.cancelada_em).map((c) => c.forma_pagamento_compra || "não informado"))].sort().map((forma) => <option key={forma} value={forma}>{forma.replaceAll("_", " ")}</option>)}
            </select>
          </Field>
          <Field label="Ordenar por">
            <select className="h-11 w-full rounded-md border bg-card px-3 text-sm" value={ordenacaoCompras} onChange={(e) => setOrdenacaoCompras(e.target.value)}>
              <option value="gasto">Maior gasto / saldo pendente</option>
              <option value="quantidade">Maior quantidade / valor</option>
              <option value="preco">Maior valor médio</option>
              <option value="recente">Mais recente</option>
            </select>
          </Field>
        </div>
        <div className="mb-3 grid grid-cols-2 gap-3">
          <Stat label="Total comprado no período" value={brl(totalComprasFiltradas)} />
          <Stat label={visaoCompras === "insumo" ? "Insumos comprados" : visaoCompras === "compra" ? "Compras registradas" : visaoCompras === "local" ? "Locais de compra" : visaoCompras === "vencimentos" ? "Meses com vencimentos" : "Parcelas no período"} value={String(visaoCompras === "insumo" ? gastosPorInsumo.length : visaoCompras === "compra" ? comprasFiltradasForma.length : visaoCompras === "local" ? comprasAgrupadasPorLocal.length : visaoCompras === "vencimentos" ? parcelasFuturasPorMes.length : parcelasComprasNoPeriodo.length)} />
        </div>
        {visaoCompras === "insumo" && <>
          {!gastosPorInsumo.length ? <Empty>Nenhuma compra com itens registrada no período.</Empty> : (
            <div className="divide-y">
              {[...gastosPorInsumo].sort((a, b) => {
                if (ordenacaoCompras === "quantidade") return (b.quantidade ?? -1) - (a.quantidade ?? -1);
                if (ordenacaoCompras === "preco") {
                  const preco = (item: typeof a) => item.quantidade && item.quantidade > 0 ? item.total / item.quantidade : -1;
                  return preco(b) - preco(a);
                }
                if (ordenacaoCompras === "recente") {
                  const dataMaisRecente = (id: string) => comprasFiltradasForma.filter((c) => itensCompra.some((i) => i.compra_id === c.id && i.insumo_id === id)).reduce((mais, c) => c.data_compra > mais ? c.data_compra : mais, "");
                  return dataMaisRecente(b.id).localeCompare(dataMaisRecente(a.id));
                }
                return b.total - a.total;
              }).map((item) => (
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
                  <p className="mt-1 text-right text-xs text-muted-foreground">{(totalComprasFiltradas > 0 ? (item.total / totalComprasFiltradas) * 100 : 0).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}% dos gastos dos itens</p>
                </div>
              ))}
            </div>
          )}
        </>}
        {visaoCompras === "compra" && <>
          {!comprasFiltradasForma.length ? <Empty>Nenhuma compra encontrada para os filtros selecionados.</Empty> : <div className="divide-y">
            {[...comprasFiltradasForma].sort((a, b) => ordenacaoCompras === "recente" ? b.data_compra.localeCompare(a.data_compra) : ordenacaoCompras === "quantidade" ? (Number(b.total) || 0) - (Number(a.total) || 0) : ordenacaoCompras === "preco" ? (Number(b.total) || 0) - (Number(a.total) || 0) : (Number(b.total) || 0) - (Number(a.total) || 0)).map((compra) => {
              const itensDaCompra = itensCompra.filter((item) => item.compra_id === compra.id);
              return <details key={compra.id} className="py-3">
                <summary className="flex cursor-pointer list-none items-start justify-between gap-3">
                  <span className="min-w-0"><span className="block font-medium">{compra.local_compra?.trim() || "Local não informado"}</span><span className="block text-xs text-muted-foreground">{dataBR(compra.data_compra)} · {(compra.forma_pagamento_compra || "não informado").replaceAll("_", " ")} · {itensDaCompra.length} item(ns)</span></span>
                  <b className="shrink-0">{brl(Number(compra.total) || 0)}</b>
                </summary>
                <div className="mt-2 space-y-2 border-t pt-2">
                  {itensDaCompra.length ? itensDaCompra.map((item) => <div key={item.id} className="flex justify-between gap-3 text-sm"><span>{insumosPorId.get(item.insumo_id)?.nome ?? "Insumo removido"} · {num(Number(item.quantidade) || 0)} {item.unidade}</span><span className="shrink-0">{brl(Number(item.total) || 0)}</span></div>) : <p className="text-xs text-muted-foreground">Esta compra não possui itens vinculados.</p>}
                  <p className="text-xs text-muted-foreground">Total registrado da compra: {brl(Number(compra.total) || 0)}</p>
                </div>
              </details>;
            })}
          </div>}
        </>}
        {visaoCompras === "local" && <>
          {!comprasAgrupadasPorLocal.length ? <Empty>Nenhuma compra encontrada para os filtros selecionados.</Empty> : <div className="divide-y">
            {comprasAgrupadasPorLocal.map((grupo) => <div key={grupo.local} className="py-3"><div className="flex items-start justify-between gap-3"><div><p className="font-medium">{grupo.local}</p><p className="text-xs text-muted-foreground">{grupo.quantidade} compra(s) · última em {dataBR(grupo.dataMaisRecente)}</p></div><b>{brl(grupo.total)}</b></div></div>)}
          </div>}
        </>}
        {visaoCompras === "vencimentos" && <>
          <p className="mb-3 text-xs text-muted-foreground">Compromissos ainda em aberto, agrupados pelo mês de vencimento. O saldo considera somente a parte não paga de cada parcela e não é somado novamente ao total comprado. Este resumo considera todos os vencimentos futuros, independentemente do período de compra selecionado.</p>
          <div className="mb-4 grid grid-cols-2 gap-3">
            <Stat label="Total a vencer" value={brl(totalParcelasFuturas)} />
            <Stat label="Parcelas vencidas" value={brl(totalParcelasVencidas)} tone={totalParcelasVencidas > 0 ? "danger" : "default"} />
          </div>
          {parcelasCompraVencidas.length > 0 && <details className="mb-3 rounded-lg border border-destructive/30 px-3">
            <summary className="cursor-pointer py-3 text-sm font-medium">Ver parcelas vencidas ({parcelasCompraVencidas.length})</summary>
            <div className="divide-y">
              {[...parcelasCompraVencidas].sort((a, b) => a.data_vencimento.localeCompare(b.data_vencimento)).map((conta) => {
                const compra = conta.compra_id ? comprasPorId.get(conta.compra_id) : undefined;
                const saldo = Math.max(0, Number(conta.valor) - Number(conta.valor_pago));
                return <div key={conta.id} className="flex items-start justify-between gap-3 py-3 text-sm"><div className="min-w-0"><p className="font-medium">{conta.descricao}</p><p className="text-xs text-muted-foreground">{compra?.local_compra?.trim() || conta.fornecedor || "Local não informado"} · Venceu em {dataBR(conta.data_vencimento)}</p><p className="text-xs text-muted-foreground">Pago: {brl(Number(conta.valor_pago) || 0)} · Pendente: {brl(saldo)}</p></div><b className="shrink-0">{brl(saldo)}</b></div>;
              })}
            </div>
          </details>}
          {!parcelasFuturasPorMes.length ? <Empty>Nenhum vencimento futuro em aberto para os filtros selecionados.</Empty> : <div className="space-y-3">
            {parcelasFuturasPorMes.map((grupo, index) => <details key={grupo.mes} className="rounded-lg border px-3" open={index === 0}>
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 py-3"><span className="font-medium capitalize">{grupo.titulo} · {grupo.parcelas.length} parcela(s)</span><b>{brl(grupo.total)}</b></summary>
              <div className="divide-y border-t">
                {grupo.parcelas.map((conta) => {
                  const compra = conta.compra_id ? comprasPorId.get(conta.compra_id) : undefined;
                  const saldo = Math.max(0, Number(conta.valor) - Number(conta.valor_pago));
                  return <div key={conta.id} className="flex items-start justify-between gap-3 py-3 text-sm"><div className="min-w-0"><p className="font-medium">{conta.descricao}</p><p className="text-xs text-muted-foreground">{compra?.local_compra?.trim() || conta.fornecedor || "Local não informado"} · Vencimento {dataBR(conta.data_vencimento)}</p><p className="text-xs text-muted-foreground">Valor original: {brl(Number(conta.valor) || 0)} · Pago: {brl(Number(conta.valor_pago) || 0)}</p></div><b className="shrink-0">{brl(saldo)}</b></div>;
                })}
              </div>
            </details>)}
          </div>}
        </>}
        {visaoCompras === "parcelas" && <>
          <p className="mb-3 text-xs text-muted-foreground">Esta visão mostra somente parcelas de compras pagas no cartão de crédito. Débito, Pix e dinheiro são pagamentos à vista e não geram cobranças futuras. O valor pendente não é somado novamente ao total comprado.</p>
          {!parcelasComprasNoPeriodo.length ? <Empty>Nenhuma parcela de compra encontrada no período de vencimento.</Empty> : <div className="divide-y">
            {parcelasComprasNoPeriodo.map((conta) => {
              const compra = conta.compra_id ? comprasPorId.get(conta.compra_id) : undefined;
              const saldo = Math.max(0, Number(conta.valor) - Number(conta.valor_pago));
              return <div key={conta.id} className="py-3"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="font-medium">{conta.descricao}</p><p className="text-xs text-muted-foreground">{compra?.local_compra?.trim() || conta.fornecedor || "Local não informado"} · Vencimento {dataBR(conta.data_vencimento)}</p><p className="text-xs text-muted-foreground">Pago: {brl(Number(conta.valor_pago) || 0)} · Pendente: {brl(saldo)} · {conta.status}</p></div><b className="shrink-0">{brl(Number(conta.valor) || 0)}</b></div></div>;
            })}
          </div>}
        </>}
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

    </>
  );
}