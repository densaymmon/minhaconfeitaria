// Regras puras do estoque de produtos prontos (sobras de produção ainda não vendidas).
// O servidor (migração 0049) é quem decide: estas funções só preparam a tela (quanto será
// usado de cada item, o que falta de insumo, rótulos do histórico). Testadas em estoque-pronto.test.ts.

import { mensagemPlano } from "./assinatura";
import { ingredientesNecessarios, type InsumoBase, type ProdutoReceita, type ResultadoIngredientes, type SaldoEstoque } from "./lista-producao";

export type TipoMovimentoPronto = "producao" | "uso_pedido" | "devolucao_pedido" | "descarte" | "estorno_producao";

export const ROTULO_MOVIMENTO_PRONTO: Record<TipoMovimentoPronto, string> = {
  producao: "Produção registrada",
  uso_pedido: "Usado em pedido",
  devolucao_pedido: "Devolvido ao estoque",
  descarte: "Descartado",
  estorno_producao: "Produção desfeita",
};

export function rotuloMovimentoPronto(tipo: string): string {
  return ROTULO_MOVIMENTO_PRONTO[tipo as TipoMovimentoPronto] ?? tipo;
}

const n = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const arredondar = (v: number) => Math.round(v * 1000) / 1000;

export type SaldoPronto = { produto_id: string; quantidade: number | string };

/** Mapa produto → unidades prontas (só saldos positivos). */
export function mapaProntos(saldos: SaldoPronto[] | undefined | null): Map<string, number> {
  const mapa = new Map<string, number>();
  for (const s of saldos ?? []) {
    const q = n(s.quantidade);
    if (q > 0) mapa.set(s.produto_id, (mapa.get(s.produto_id) ?? 0) + q);
  }
  return mapa;
}

export type ItemParaEstoque = { produto_id: string | null; quantidade: number; usar_estoque?: boolean };

/**
 * Quanto cada item do pedido vai tirar do estoque pronto. Segue a ordem das linhas, como o
 * servidor: o primeiro item marcado leva o que existir e o seguinte do mesmo produto fica com o resto.
 */
export function planejarUsoEstoque(itens: ItemParaEstoque[], saldos: Map<string, number>): number[] {
  const restante = new Map(saldos);
  return itens.map((item) => {
    if (!item.usar_estoque || !item.produto_id) return 0;
    const disponivel = restante.get(item.produto_id) ?? 0;
    const usar = Math.max(0, Math.min(n(item.quantidade), disponivel));
    if (usar > 0) restante.set(item.produto_id, arredondar(disponivel - usar));
    return arredondar(usar);
  });
}

/**
 * Unidades prontas que ainda podem ser oferecidas a um item (descontando o que as linhas
 * anteriores do mesmo produto já vão usar).
 */
export function disponivelParaLinha(itens: ItemParaEstoque[], indice: number, saldos: Map<string, number>): number {
  const item = itens[indice];
  if (!item?.produto_id) return 0;
  const antes = planejarUsoEstoque(itens.slice(0, indice), saldos);
  const jaUsado = antes.reduce((total, uso, i) => total + (itens[i]?.produto_id === item.produto_id ? uso : 0), 0);
  return Math.max(0, arredondar((saldos.get(item.produto_id) ?? 0) - jaUsado));
}

/**
 * Insumos que serão gastos ao produzir `quantidade` unidades de um produto para o estoque.
 * O servidor usa só a ficha técnica do próprio produto (kits não expandem componentes),
 * então a prévia também ignora os componentes.
 */
export function previaInsumosProducao(
  produto: ProdutoReceita | undefined,
  quantidade: number,
  insumos: InsumoBase[],
  saldos: SaldoEstoque[],
): ResultadoIngredientes {
  if (!produto) return { linhas: [], semReceita: [], semMedida: [], avulsos: 0 };
  const semKit: ProdutoReceita = { ...produto, componentes: null };
  return ingredientesNecessarios([{ produto_id: produto.id, pendente: quantidade }], [semKit], insumos, saldos);
}

/** Aceita "1,5" ou "1.5"; devolve 0 para valores inválidos. Máximo de 3 casas, como no banco. */
export function lerQuantidade(texto: string): number {
  const v = Number(String(texto).trim().replace(",", "."));
  if (!Number.isFinite(v) || v <= 0) return 0;
  return arredondar(v);
}

/** Quantidade válida para registrar/descartar: maior que zero, até 9.999. */
export function quantidadeValida(v: number): boolean {
  return Number.isFinite(v) && v > 0 && v <= 9999 && arredondar(v) === v;
}

/** Mensagem do servidor sem os prefixos técnicos ("PLANO:", "ESTOQUE:"). */
export function mensagemErroEstoque(erro: unknown): string {
  const texto = erro instanceof Error ? erro.message : typeof erro === "string" ? erro : "";
  const limpa = mensagemPlano(texto).replace(/^.*?ESTOQUE:\s*/, "").trim();
  return limpa || "tente novamente.";
}
