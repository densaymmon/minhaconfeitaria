// Categorias de despesa e lançamento mensal repetido (aluguel, internet, mensalidades).
// Funções puras, testadas em despesas-recorrentes.test.ts.

/** Retirada do dono (pró-labore): sai do resultado, mas aparece separada do lucro do negócio. */
export const CATEGORIA_RETIRADA = "Retirada do dono";

export const CATEGORIAS_DESPESA = ["Aluguel", "Transporte", "Manutenção", "Marketing", "Administrativo", CATEGORIA_RETIRADA, "Outros"] as const;

/** Quantos meses (contando o primeiro) a despesa pode se repetir. */
export const OPCOES_REPETICAO = [1, 3, 6, 12] as const;

export function ehRetirada(categoria: string | null | undefined): boolean {
  return categoria === CATEGORIA_RETIRADA;
}

/**
 * Datas de uma despesa mensal: a primeira é a data informada e as demais caem no mesmo dia dos
 * meses seguintes; se o mês não tem o dia (31 em fevereiro), vale o último dia do mês.
 * Quantidade inválida devolve só a data inicial.
 */
export function datasMensais(dataInicial: string, quantidade: number): string[] {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dataInicial);
  if (!m) return [];
  const total = Number.isInteger(quantidade) ? Math.min(Math.max(quantidade, 1), 24) : 1;
  const ano = Number(m[1]);
  const mes = Number(m[2]) - 1;
  const dia = Number(m[3]);
  return Array.from({ length: total }, (_, i) => {
    const ultimoDia = new Date(Date.UTC(ano, mes + i + 1, 0)).getUTCDate();
    const d = new Date(Date.UTC(ano, mes + i, Math.min(dia, ultimoDia)));
    return d.toISOString().slice(0, 10);
  });
}

// Despesas fixas automáticas (migração 0050) -------------------------------------------------
// O banco é quem lança (gerar_despesas_recorrentes). Estas funções só preparam a tela: quando é
// o próximo lançamento, se a regra já terminou e como encerrá-la.

export type RegraFixa = { inicio: string; fim: string | null; gerado_ate: string | null };

const ultimoDiaDoMes = (ano: number, mes: number) => new Date(Date.UTC(ano, mes, 0)).getUTCDate(); // mes 1-12

function dataDoMes(mes: string, diaDesejado: number): string {
  const ano = Number(mes.slice(0, 4));
  const m = Number(mes.slice(5, 7));
  const dia = Math.min(diaDesejado, ultimoDiaDoMes(ano, m));
  return `${mes.slice(0, 7)}-${String(dia).padStart(2, "0")}`;
}

function somarMeses(mesISO: string, delta: number): string {
  const d = new Date(Date.UTC(Number(mesISO.slice(0, 4)), Number(mesISO.slice(5, 7)) - 1 + delta, 1));
  return d.toISOString().slice(0, 7);
}

/** Dia do mês em que a despesa cai (o dia da primeira data; meses curtos usam o último dia). */
export function diaDaRegra(regra: Pick<RegraFixa, "inicio">): number {
  return Number(regra.inicio.slice(8, 10));
}

/** A regra terminou: o último mês permitido já ficou para trás. */
export function regraEncerrada(regra: RegraFixa, hoje: string): boolean {
  return regra.fim !== null && regra.fim.slice(0, 7) < hoje.slice(0, 7);
}

/** Data do próximo lançamento ainda não feito (null se a regra terminou). */
export function proximoLancamento(regra: RegraFixa): string | null {
  const dia = diaDaRegra(regra);
  const mesInicial = regra.gerado_ate ? somarMeses(regra.gerado_ate, 1) : regra.inicio.slice(0, 7);
  // Se o app ficou fechado, o mês seguinte ao último lançado pode já ter passado: o lançamento fica
  // pendente e acontece na próxima vez que o Financeiro abrir; mostramos a data em que deveria cair.
  if (regra.fim !== null && mesInicial > regra.fim.slice(0, 7)) return null;
  return dataDoMes(mesInicial, dia);
}

export type EncerrarRegra = { acao: "excluir" } | { acao: "definir_fim"; fim: string };

/**
 * Como encerrar uma despesa fixa sem perder o histórico: se nada foi lançado ainda, a regra pode
 * simplesmente sair; senão, a data final impede os meses seguintes. Se o lançamento deste mês
 * ainda não caiu, ele também não será feito (a data final vira o fim do mês passado).
 */
export function encerrarRegra(regra: RegraFixa, hoje: string): EncerrarRegra {
  if (!regra.gerado_ate) return { acao: "excluir" };
  const mesAtual = hoje.slice(0, 7);
  if (regra.gerado_ate.slice(0, 7) >= mesAtual) return { acao: "definir_fim", fim: hoje };
  const mesAnterior = somarMeses(mesAtual, -1);
  const fim = dataDoMes(mesAnterior, 31);
  // Nenhum mês lançado depois do início? Então não há o que preservar.
  return fim < regra.inicio ? { acao: "excluir" } : { acao: "definir_fim", fim };
}
