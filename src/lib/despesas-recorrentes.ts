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
