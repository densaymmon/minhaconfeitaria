// Alertas da faixa do topo do Financeiro: o que precisa de atenção agora. Funções puras,
// testadas em alertas-financeiros.test.ts. Só lê dados; nenhuma ação altera o banco.

import { alertaMargem } from "./calc";
import { contaEmAberto, saldoConta, type ContaFinanceira } from "./financeiro";

const n = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const r2 = (v: number) => Math.round(v * 100) / 100;
const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export type AlertaFinanceiro = {
  id: "contas_vencidas" | "contas_hoje" | "pedidos_a_receber" | "estoque_negativo" | "margem_baixa";
  nivel: "erro" | "aviso";
  texto: string;
};

export type QuantidadeValor = { quantidade: number; valor: number };

/** Contas em aberto com vencimento anterior a hoje. */
export function contasVencidas(contas: ContaFinanceira[], hoje: string): QuantidadeValor {
  const lista = contas.filter((c) => contaEmAberto(c) && c.data_vencimento < hoje);
  return { quantidade: lista.length, valor: r2(lista.reduce((s, c) => s + saldoConta(c), 0)) };
}

/** Contas em aberto que vencem hoje. */
export function contasQueVencemHoje(contas: ContaFinanceira[], hoje: string): QuantidadeValor {
  const lista = contas.filter((c) => contaEmAberto(c) && c.data_vencimento === hoje);
  return { quantidade: lista.length, valor: r2(lista.reduce((s, c) => s + saldoConta(c), 0)) };
}

/** Pedidos já entregues que ainda têm saldo a receber (cobrança atrasada). */
export function entreguesComSaldo(pedidos: { status: string; t: { saldo: number } }[]): QuantidadeValor {
  const lista = pedidos.filter((p) => ["entregue", "finalizado"].includes(p.status) && n(p.t.saldo) > 0.009);
  return { quantidade: lista.length, valor: r2(lista.reduce((s, p) => s + n(p.t.saldo), 0)) };
}

/** Quantos insumos estão com saldo negativo no controle de estoque. */
export function insumosComSaldoNegativo(saldos: { saldo: number | string }[]): number {
  return saldos.filter((s) => n(s.saldo) < 0).length;
}

export type ProdutoMargem = { id: string; ativo?: boolean | null; preco_venda: number | string; margem_desejada: number | string };

/** Produtos ativos com preço abaixo da margem desejada (e quantos abaixo do custo = prejuízo). */
export function produtosComMargemBaixa(produtos: ProdutoMargem[], custoPorProduto: Map<string, number>): { total: number; prejuizo: number } {
  let total = 0;
  let prejuizo = 0;
  for (const p of produtos) {
    if (p.ativo === false) continue;
    const a = alertaMargem(custoPorProduto.get(p.id) ?? 0, n(p.preco_venda), n(p.margem_desejada));
    if (a.abaixoDoCusto) { total += 1; prejuizo += 1; } else if (a.abaixoDaMargem) total += 1;
  }
  return { total, prejuizo };
}

export type EntradaAlertas = {
  vencidas: QuantidadeValor;
  hoje: QuantidadeValor;
  aReceber: QuantidadeValor;
  insumosNegativos: number;
  margem: { total: number; prejuizo: number };
};

const conta = (q: number, singular: string, plural: string) => `${q} ${q === 1 ? singular : plural}`;

/** Alertas em ordem de urgência: dinheiro que já devia ter saído/entrado primeiro. */
export function alertasFinanceiros(e: EntradaAlertas): AlertaFinanceiro[] {
  const alertas: AlertaFinanceiro[] = [];
  if (e.vencidas.quantidade > 0) {
    alertas.push({ id: "contas_vencidas", nivel: "erro", texto: `${conta(e.vencidas.quantidade, "conta vencida", "contas vencidas")}: ${brl(e.vencidas.valor)} para pagar` });
  }
  if (e.hoje.quantidade > 0) {
    alertas.push({ id: "contas_hoje", nivel: "aviso", texto: `${conta(e.hoje.quantidade, "conta vence", "contas vencem")} hoje: ${brl(e.hoje.valor)}` });
  }
  if (e.aReceber.quantidade > 0) {
    alertas.push({ id: "pedidos_a_receber", nivel: "aviso", texto: `${conta(e.aReceber.quantidade, "pedido entregue com saldo", "pedidos entregues com saldo")} a receber: ${brl(e.aReceber.valor)}` });
  }
  if (e.insumosNegativos > 0) {
    alertas.push({ id: "estoque_negativo", nivel: "aviso", texto: `${conta(e.insumosNegativos, "insumo com saldo negativo", "insumos com saldo negativo")} no estoque: confira a contagem` });
  }
  if (e.margem.total > 0) {
    const prejuizo = e.margem.prejuizo > 0 ? ` (${e.margem.prejuizo} com prejuízo)` : "";
    alertas.push({ id: "margem_baixa", nivel: e.margem.prejuizo > 0 ? "erro" : "aviso", texto: `${conta(e.margem.total, "produto com margem baixa", "produtos com margem baixa")}${prejuizo}` });
  }
  return alertas;
}
