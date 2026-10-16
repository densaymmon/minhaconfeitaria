// Cálculos de custo, preço e lucro — funções puras (testadas em calc.test.ts).

import { custoProporcional, type Embalagem } from "./ingredient-cost";
export type InsumoLite = Embalagem & { id: string };
export type ReceitaItemLite = { insumo_id: string; quantidade: number; quantidade_utilizada?: number | null; unidade_receita?: string | null };
export function custoItemReceita(item: ReceitaItemLite, ins: InsumoLite | undefined) {
  if (!ins) return 0;
  if (!ins.unidade && !ins.unidade_embalagem) return item.quantidade * ins.preco_unidade;
  return custoProporcional(ins, item.quantidade_utilizada ?? item.quantidade, item.unidade_receita ?? ins.unidade ?? ins.unidade_embalagem ?? "un");
}
export type ProdutoLite = {
  rendimento: number;
  custo_gas: number;
  custo_energia: number;
  custo_mao_obra: number;
};

const n = (v: unknown) => Number(v ?? 0) || 0;
export const round2 = (v: number) => Math.round(v * 100) / 100;

/** Custo total de uma receita (lote inteiro). */
export function custoReceita(
  produto: ProdutoLite,
  itens: ReceitaItemLite[],
  insumos: Map<string, InsumoLite>,
) {
  const ingredientes = itens.reduce(
    (s, i) => s + custoItemReceita(i, insumos.get(i.insumo_id)),
    0,
  );
  const operacionais = n(produto.custo_gas) + n(produto.custo_energia) + n(produto.custo_mao_obra);
  return { ingredientes, operacionais, total: ingredientes + operacionais };
}

/** Custo de uma unidade do produto (receita / rendimento). */
export function custoUnitario(
  produto: ProdutoLite,
  itens: ReceitaItemLite[],
  insumos: Map<string, InsumoLite>,
) {
  const rend = n(produto.rendimento) > 0 ? n(produto.rendimento) : 1;
  return custoReceita(produto, itens, insumos).total / rend;
}

export function precoSugerido(custoUnit: number, margemPct: number) {
  return custoUnit * (1 + n(margemPct) / 100);
}

/** Margem real sobre o custo (markup) em %. */
export function margemReal(custoUnit: number, preco: number) {
  if (custoUnit <= 0) return preco > 0 ? 100 : 0;
  return ((preco - custoUnit) / custoUnit) * 100;
}

/** Distribui a venda total e as taxas do pedido proporcionalmente ao valor bruto de cada item. */
export function ratearVendaETaxas(valorItem: number, subtotalItens: number, vendaPedido: number, taxasPedido: number) {
  const proporcao = subtotalItens > 0 ? Math.max(0, valorItem) / subtotalItens : 0;
  return { venda: Math.max(0, vendaPedido) * proporcao, taxas: Math.max(0, taxasPedido) * proporcao };
}

export type Config = {
  taxa_pix: number;
  taxa_dinheiro: number;
  taxa_debito: number;
  taxa_credito: number;
  taxa_outros: number;
  imposto_pct: number;
};

export const CONFIG_PADRAO: Config = {
  taxa_pix: 0,
  taxa_dinheiro: 0,
  taxa_debito: 1.99,
  taxa_credito: 4.99,
  taxa_outros: 0,
  imposto_pct: 0,
};

export function taxaDaForma(forma: string, c: Config) {
  switch (forma) {
    case "pix":
      return n(c.taxa_pix);
    case "dinheiro":
      return n(c.taxa_dinheiro);
    case "debito":
      return n(c.taxa_debito);
    case "credito":
      return n(c.taxa_credito);
    default:
      return n(c.taxa_outros);
  }
}

export type PedidoLite = {
  status: string;
  forma_pagamento: string;
  valor_entrada: number;
  saldo_quitado: boolean;
  desconto: number;
  taxa_entrega: number;
  pedido_itens: { quantidade: number; preco_unitario: number; custo_unitario: number }[];
};

export function totaisPedido(p: PedidoLite, c: Config) {
  const subtotal = p.pedido_itens.reduce((s, i) => s + n(i.quantidade) * n(i.preco_unitario), 0);
  const venda = Math.max(0, subtotal + n(p.taxa_entrega) - n(p.desconto));
  const custo = p.pedido_itens.reduce((s, i) => s + n(i.quantidade) * n(i.custo_unitario), 0);
  const pctTaxas = taxaDaForma(p.forma_pagamento, c) + n(c.imposto_pct);
  const taxas = (venda * pctTaxas) / 100;
  const lucroBruto = venda - custo;
  const lucroLiquido = lucroBruto - taxas;
  const entrada = Math.min(n(p.valor_entrada), venda);
  const recebido = p.status === "cancelado" ? entrada : p.saldo_quitado ? venda : entrada;
  const saldo = p.status === "cancelado" ? 0 : Math.max(0, venda - recebido);
  return { subtotal, venda, custo, taxas, lucroBruto, lucroLiquido, recebido, saldo };
}
