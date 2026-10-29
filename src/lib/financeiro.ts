/**
 * Fórmulas de contas a pagar usadas pelo Financeiro, Contas a pagar, Relatórios e Fluxo de caixa.
 * Funções puras: uma única definição de "conta ativa", "em aberto", "saldo" e "vencida".
 *
 * Definições (valores em reais, arredondados a centavos):
 * - Conta ativa: não cancelada (`cancelada_em` vazio e status diferente de "cancelado").
 * - Conta em aberto: ativa e com status "pendente" ou "parcial".
 * - Saldo da conta: max(0, valor − valor_pago). `valor_pago` já é o líquido de estornos
 *   (pagamentos − estornos), mantido pelas funções do banco.
 * - Conta vencida: em aberto e com vencimento anterior a hoje (vence hoje ainda não é vencida).
 * - Total pago: soma de `valor_pago` das contas ativas.
 */

type Numero = number | string | null | undefined;

export type ContaFinanceira = {
  valor: Numero;
  valor_pago: Numero;
  status: string;
  cancelada_em?: string | null;
  data_vencimento: string;
};

const num = (v: Numero): number => {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
};

const centavos = (v: number): number => Math.round(v * 100) / 100;

/** Saldo devedor de uma conta: nunca negativo. */
export function saldoConta(conta: { valor: Numero; valor_pago: Numero }): number {
  return centavos(Math.max(0, num(conta.valor) - num(conta.valor_pago)));
}

export function contaAtiva(conta: Pick<ContaFinanceira, "status" | "cancelada_em">): boolean {
  return !conta.cancelada_em && conta.status !== "cancelado";
}

export function contaEmAberto(conta: Pick<ContaFinanceira, "status" | "cancelada_em">): boolean {
  return contaAtiva(conta) && (conta.status === "pendente" || conta.status === "parcial");
}

export function contaVencida(conta: ContaFinanceira, hoje: string): boolean {
  return contaEmAberto(conta) && conta.data_vencimento < hoje;
}

/** Soma dos saldos devedores das contas informadas. */
export function somaSaldos(contas: { valor: Numero; valor_pago: Numero }[]): number {
  return centavos(contas.reduce((total, conta) => total + saldoConta(conta), 0));
}

/** Total já pago das contas ativas (líquido de estornos). */
export function totalPagoContas(contas: ContaFinanceira[]): number {
  return centavos(contas.filter(contaAtiva).reduce((total, conta) => total + Math.max(0, num(conta.valor_pago)), 0));
}

export type ResumoContas = {
  /** Saldo de todas as contas em aberto. */
  aberto: number;
  /** Saldo das contas em aberto com vencimento anterior a hoje. */
  vencido: number;
  /** Total já pago das contas ativas. */
  pago: number;
};

export function resumoContas(contas: ContaFinanceira[], hoje: string): ResumoContas {
  const abertas = contas.filter(contaEmAberto);
  return {
    aberto: somaSaldos(abertas),
    vencido: somaSaldos(abertas.filter((conta) => conta.data_vencimento < hoje)),
    pago: totalPagoContas(contas),
  };
}
