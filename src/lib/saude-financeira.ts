// Regras puras do bloco "Saúde do mês" do Financeiro: vendas, custo de produção, resultado,
// contas a pagar e valor parado em estoque. Reaproveita `resumoDoMes` (mesma conta do Resumo
// do mês: todos os pedidos não cancelados, pela data de entrega) e as regras de contas de
// `financeiro.ts`. Testadas em saude-financeira.test.ts.

import { contaEmAberto, saldoConta, type ContaFinanceira } from "./financeiro";
import { somarDiasISO } from "./gestao";
import { ehRetirada } from "./despesas-recorrentes";
import { custoProporcional, type Embalagem } from "./ingredient-cost";
import { deslocarMes, resumoDoMes, variacao, type DespesaMes, type PedidoMes, type ResumoMes } from "./resumo-mes";

const n = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const r2 = (v: number) => Math.round(v * 100) / 100;

// Recebimento -----------------------------------------------------------------------------

export type PedidoRecebimento = { status: string; data_entrega: string; t: { recebido: number; saldo: number } };

/** Do que foi vendido no mês (não cancelados, pela data de entrega): quanto já entrou e quanto falta. */
export function recebimentoDoMes(pedidos: PedidoRecebimento[], mes: string) {
  const doMes = pedidos.filter((p) => p.status !== "cancelado" && p.data_entrega.startsWith(mes));
  return {
    recebido: r2(doMes.reduce((s, p) => s + Math.max(0, n(p.t.recebido)), 0)),
    aReceber: r2(doMes.reduce((s, p) => s + Math.max(0, n(p.t.saldo)), 0)),
  };
}

/** Lucro bruto sobre as vendas, em % com uma casa (0 quando não há vendas). */
export function margemBruta(vendas: number, custo: number): number {
  return vendas > 0 ? Math.round(((vendas - custo) / vendas) * 1000) / 10 : 0;
}

// Contas a pagar --------------------------------------------------------------------------

export type ResumoContasPagar = {
  /** Saldo de todas as contas em aberto. */
  aberto: number;
  /** Em aberto com vencimento anterior a hoje. */
  vencido: number;
  /** Em aberto que vencem de hoje até daqui a `dias` dias (inclusive). */
  proximos: number;
  /** Quantidade de contas em aberto. */
  quantidade: number;
};

export function contasPagarEmFoco(contas: ContaFinanceira[], hoje: string, dias = 7): ResumoContasPagar {
  const abertas = contas.filter(contaEmAberto);
  const limite = somarDiasISO(hoje, dias);
  const soma = (lista: ContaFinanceira[]) => r2(lista.reduce((s, c) => s + saldoConta(c), 0));
  return {
    aberto: soma(abertas),
    vencido: soma(abertas.filter((c) => c.data_vencimento < hoje)),
    proximos: soma(abertas.filter((c) => c.data_vencimento >= hoje && c.data_vencimento <= limite)),
    quantidade: abertas.length,
  };
}

// Estoque ---------------------------------------------------------------------------------

export type SaldoInsumo = { insumo_id: string; saldo: number | string; unidade_base: string | null };
export type InsumoComPreco = Embalagem & { id: string };

export type ValorEstoqueInsumos = {
  /** Soma de saldo × custo por unidade-base, só dos saldos positivos. */
  total: number;
  /** Insumos com saldo positivo que entraram na conta. */
  itens: number;
  /** Com saldo mas sem unidade conversível ou sem preço utilizável: ficam fora do total. */
  semValor: number;
  /** Saldo negativo (consumo maior que as compras registradas): não reduz o total. */
  negativos: number;
};

/**
 * Valor dos insumos em estoque ao custo da última embalagem cadastrada. O saldo vem do controle
 * de estoque em unidade-base (g, ml ou un); saldo negativo conta como zero e é sinalizado.
 */
export function valorEstoqueInsumos(saldos: SaldoInsumo[], insumos: InsumoComPreco[]): ValorEstoqueInsumos {
  const porId = new Map(insumos.map((i) => [i.id, i]));
  let total = 0;
  let itens = 0;
  let semValor = 0;
  let negativos = 0;
  for (const s of saldos) {
    const saldo = n(s.saldo);
    if (saldo < 0) { negativos += 1; continue; }
    if (saldo === 0) continue;
    const insumo = porId.get(s.insumo_id);
    if (!insumo || !s.unidade_base) { semValor += 1; continue; }
    try {
      const custoBase = custoProporcional(insumo, 1, s.unidade_base);
      if (!Number.isFinite(custoBase)) throw new Error("custo inválido");
      total += saldo * custoBase;
      itens += 1;
    } catch {
      semValor += 1;
    }
  }
  return { total: r2(total), itens, semValor, negativos };
}

export type ValorEstoquePronto = {
  /** Unidades prontas × custo do produto. */
  total: number;
  unidades: number;
  /** Produtos prontos sem custo calculado (sem receita): ficam fora do total. */
  semCusto: number;
};

export function valorEstoquePronto(prontos: { produto_id: string; quantidade: number | string }[], custoPorProduto: Map<string, number>): ValorEstoquePronto {
  let total = 0;
  let unidades = 0;
  let semCusto = 0;
  for (const p of prontos) {
    const q = n(p.quantidade);
    if (q <= 0) continue;
    unidades += q;
    const custo = custoPorProduto.get(p.produto_id);
    if (custo === undefined || !(custo > 0)) { semCusto += 1; continue; }
    total += q * custo;
  }
  return { total: r2(total), unidades: Math.round(unidades * 1000) / 1000, semCusto };
}

// Bloco completo --------------------------------------------------------------------------

export type EntradaSaude = {
  pedidos: (PedidoMes & PedidoRecebimento)[];
  despesas: DespesaMes[];
  contas: ContaFinanceira[];
  mes: string;
  hoje: string;
};

export type SaudeDoMes = {
  mes: string;
  resumo: ResumoMes;
  /** Vendas e resultado do mês anterior para comparar (variação em %; null sem base). */
  variacaoVendas: number | null;
  variacaoResultado: number | null;
  recebido: number;
  aReceber: number;
  margemBruta: number;
  contas: ResumoContasPagar;
  /** Retirada do dono no mês (categoria "Retirada do dono"); já está dentro das despesas do resumo. */
  retiradas: number;
  /** Despesas do mês sem a retirada do dono. */
  despesasOperacionais: number;
  /** Resultado antes da retirada: o que o negócio gerou. O resultado do resumo é o que sobra depois dela. */
  lucroAntesRetirada: number;
};

export function saudeDoMes({ pedidos, despesas, contas, mes, hoje }: EntradaSaude): SaudeDoMes {
  const resumo = resumoDoMes(pedidos, despesas, mes);
  const anterior = resumoDoMes(pedidos, despesas, deslocarMes(mes, -1));
  const { recebido, aReceber } = recebimentoDoMes(pedidos, mes);
  const retiradas = r2(despesas.filter((d) => d.data.startsWith(mes) && ehRetirada(d.categoria)).reduce((s, d) => s + n(d.valor), 0));
  return {
    mes,
    resumo,
    variacaoVendas: variacao(resumo.vendas, anterior.vendas),
    variacaoResultado: variacao(resumo.resultado, anterior.resultado),
    recebido,
    aReceber,
    margemBruta: margemBruta(resumo.vendas, resumo.custoProdutos),
    contas: contasPagarEmFoco(contas, hoje),
    retiradas,
    despesasOperacionais: r2(resumo.despesas - retiradas),
    lucroAntesRetirada: r2(resumo.resultado + retiradas),
  };
}
