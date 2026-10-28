// Variações de produto: conversão entre o editor e produtos.opcoes (testado em opcoes-produto.test.ts).
import { parseNum } from "./format";

/** Grupo de opções em edição (valores como texto, para digitar "5,50"). */
export type GrupoEditavel = { grupo: string; itens: { nome: string; preco: string; custo: string }[] };
export type GrupoSalvo = { grupo: string; itens: { nome: string; preco: number; custo: number }[] };

export const MAX_GRUPOS = 5;
export const MAX_OPCOES = 15;

/** Lê produtos.opcoes (JSON do banco) para o editor. */
export function opcoesParaEdicao(valor: unknown): GrupoEditavel[] {
  if (!Array.isArray(valor)) return [];
  return valor.flatMap((g) => {
    if (!g || typeof g !== "object") return [];
    const grupo = String((g as { grupo?: unknown }).grupo ?? "");
    const itens = (g as { itens?: unknown }).itens;
    return [{
      grupo,
      itens: Array.isArray(itens)
        ? itens.map((i: { nome?: unknown; preco?: unknown; custo?: unknown }) => ({ nome: String(i?.nome ?? ""), preco: String(i?.preco ?? 0).replace(".", ","), custo: String(i?.custo ?? 0).replace(".", ",") }))
        : [],
    }];
  });
}

/** Valida e converte para o formato salvo no banco; devolve o erro em português quando houver. */
export function opcoesParaSalvar(grupos: GrupoEditavel[]): { ok: true; valor: GrupoSalvo[] } | { ok: false; erro: string } {
  const valor: GrupoSalvo[] = [];
  const nomesGrupos = new Set<string>();
  for (const g of grupos) {
    const grupo = g.grupo.trim();
    const itens = g.itens.filter((i) => i.nome.trim());
    if (!grupo && itens.length === 0) continue;
    if (!grupo) return { ok: false, erro: "Dê um nome a cada grupo de opções (ex.: Tamanho)." };
    if (grupo.length > 40) return { ok: false, erro: `O nome do grupo "${grupo}" é longo demais.` };
    if (nomesGrupos.has(grupo.toLowerCase())) return { ok: false, erro: `O grupo "${grupo}" aparece duas vezes.` };
    nomesGrupos.add(grupo.toLowerCase());
    if (itens.length === 0) return { ok: false, erro: `Adicione pelo menos uma opção em "${grupo}".` };
    if (itens.length > MAX_OPCOES) return { ok: false, erro: `"${grupo}" pode ter até ${MAX_OPCOES} opções.` };
    const nomes = new Set<string>();
    const convertidos: GrupoSalvo["itens"] = [];
    for (const i of itens) {
      const nome = i.nome.trim();
      if (nome.length > 40) return { ok: false, erro: `A opção "${nome}" é longa demais.` };
      if (nomes.has(nome.toLowerCase())) return { ok: false, erro: `A opção "${nome}" aparece duas vezes em "${grupo}".` };
      nomes.add(nome.toLowerCase());
      const preco = Math.round(parseNum(i.preco || "0") * 100) / 100;
      const custo = Math.round(parseNum(i.custo || "0") * 100) / 100;
      if (Math.abs(preco) > 10000 || Math.abs(custo) > 10000) return { ok: false, erro: `Confira os valores da opção "${nome}".` };
      convertidos.push({ nome, preco, custo });
    }
    valor.push({ grupo, itens: convertidos });
  }
  if (valor.length > MAX_GRUPOS) return { ok: false, erro: `Use no máximo ${MAX_GRUPOS} grupos de opções.` };
  return { ok: true, valor };
}

