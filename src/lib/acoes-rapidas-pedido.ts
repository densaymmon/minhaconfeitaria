// Regras puras das ações rápidas na lista de pedidos: trocar o status e registrar recebimento
// sem abrir o pedido. O servidor continua sendo quem valida (saldo, data, pedido cancelado);
// aqui só evitamos chamadas que já sabemos que seriam recusadas. Testadas em acoes-rapidas-pedido.test.ts.

export type StatusRapido = "recebido" | "em_producao" | "pronto" | "entregue";

export const STATUS_RAPIDOS: { valor: StatusRapido; rotulo: string }[] = [
  { valor: "recebido", rotulo: "Recebido" },
  { valor: "em_producao", rotulo: "Em produção" },
  { valor: "pronto", rotulo: "Pronto" },
  { valor: "entregue", rotulo: "Entregue" },
];

export type ItemProducao = { quantidade: number | string; quantidade_produzida: number | string };

export type EscolhaStatus = {
  valor: StatusRapido;
  rotulo: string;
  /** É o status em que o pedido está agora. */
  atual: boolean;
  /** Motivo de não poder escolher agora (null = liberado). */
  bloqueio: string | null;
};

const num = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const arredondar = (v: number, casas: number) => {
  const f = 10 ** casas;
  return Math.round(v * f) / f;
};

/** "confirmado" aparece como Recebido e "finalizado" como Entregue (valores antigos no banco). */
export function statusEquivalente(status: string): string {
  if (status === "confirmado") return "recebido";
  if (status === "finalizado") return "entregue";
  return status;
}

/** Pedido cancelado não muda de status pela lista; os demais sim. */
export function podeAlterarStatus(status: string): boolean {
  return status !== "cancelado";
}

/** Unidades que ainda faltam produzir somando todos os itens. */
export function unidadesPendentes(itens: ItemProducao[]): number {
  return arredondar(itens.reduce((total, i) => total + Math.max(0, num(i.quantidade) - num(i.quantidade_produzida)), 0), 3);
}

/**
 * Opções de status do pedido. Mesma regra da tela Produção: "Pronto" só depois que todos os
 * itens foram produzidos (a produção real é registrada lá, para baixar os insumos certos).
 */
export function escolhasDeStatus(status: string, itens: ItemProducao[]): EscolhaStatus[] {
  const atual = statusEquivalente(status);
  const pendentes = unidadesPendentes(itens);
  return STATUS_RAPIDOS.map(({ valor, rotulo }) => ({
    valor,
    rotulo,
    atual: valor === atual,
    bloqueio: valor === "pronto" && valor !== atual && pendentes > 0
      ? `Faltam ${pendentes.toLocaleString("pt-BR", { maximumFractionDigits: 3 })} unidade(s) para produzir. Registre a produção na tela Produção.`
      : null,
  }));
}

/** Saldo a receber arredondado em centavos; 0 quando não há o que cobrar. */
export function saldoParaReceber(saldo: number): number {
  const v = arredondar(Math.max(0, num(saldo)), 2);
  return v >= 0.01 ? v : 0;
}

/** Depois de marcar como entregue, pergunta pelo recebimento se ainda há saldo. */
export function deveOferecerRecebimento(novoStatus: string, saldo: number): boolean {
  return novoStatus === "entregue" && saldoParaReceber(saldo) > 0;
}

export type DadosRecebimento = { valor: number; saldo: number; data: string; hoje: string };

/** Mensagem de erro do recebimento, ou null se estiver tudo certo (espelha o servidor). */
export function validarRecebimento({ valor, saldo, data, hoje }: DadosRecebimento): string | null {
  const disponivel = saldoParaReceber(saldo);
  if (disponivel <= 0) return "Este pedido não tem saldo a receber.";
  if (!Number.isFinite(valor) || valor <= 0) return "Informe um valor maior que zero.";
  if (arredondar(valor, 2) > disponivel) {
    return `O valor não pode passar do saldo (${disponivel.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}).`;
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) return "Informe a data do recebimento.";
  if (data > hoje) return "A data do recebimento não pode ser no futuro.";
  return null;
}

const FORMAS_ACEITAS = ["pix", "dinheiro", "debito", "credito", "outros"];

/** Forma de pagamento sugerida: a do pedido, se for uma das opções da tela; senão Pix. */
export function formaPadrao(formaDoPedido: string | null | undefined): string {
  return formaDoPedido && FORMAS_ACEITAS.includes(formaDoPedido) ? formaDoPedido : "pix";
}
