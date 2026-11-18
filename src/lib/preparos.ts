// Preparos (recheios, coberturas, caldas...): receitas de base usadas em várias receitas (migração 0053).
// No banco, o preparo é um insumo com tipo = "preparo": o "pacote" é o rendimento (ex.: 500 g) e o
// preço é o custo dos ingredientes, calculado no servidor. Aqui ficam as regras puras da tela.
import { custoItemReceita, type InsumoLite } from "./calc";
import { medida, numeroIngrediente } from "./ingredient-cost";

export const TIPO_PREPARO = "preparo";
export const MEDIDAS_RENDIMENTO = ["g", "kg", "ml", "L", "un"] as const;
export const MAX_ITENS_PREPARO = 50;

export const ehPreparo = (i: { tipo?: string | null } | null | undefined) => i?.tipo === TIPO_PREPARO;

export type LinhaPreparo = { insumo_id: string; quantidade: string; unidade: string };
export type PreparoEditavel = { nome: string; rendimento: string; unidade: string; itens: LinhaPreparo[] };
export type PreparoParaSalvar = { nome: string; rendimento: number; unidade: string; itens: { insumo_id: string; quantidade: number; unidade: string }[] };

/** Custo total dos ingredientes (o lote inteiro). Lança erro em medida incompatível. */
export function custoDoLote(itens: { insumo_id: string; quantidade: number; unidade: string }[], insumos: Map<string, InsumoLite>): number {
  return itens.reduce((s, i) => s + custoItemReceita({ insumo_id: i.insumo_id, quantidade: i.quantidade, quantidade_utilizada: i.quantidade, unidade_receita: i.unidade }, insumos.get(i.insumo_id)), 0);
}

/**
 * Custo de uma porção de referência, para mostrar na tela: 100 g, 100 ml ou 1 unidade.
 * Ex.: rende 500 g e custa R$ 10 → R$ 2,00 a cada 100 g.
 */
export function custoPorPorcao(custoLote: number, rendimento: number, unidade: string): { porcao: string; custo: number } | null {
  const m = medida(unidade);
  if (!m || !(rendimento > 0)) return null;
  const total = rendimento * m.fator; // em g, ml ou un
  if (m.base === "un") return { porcao: "1 unidade", custo: custoLote / total };
  return { porcao: `100 ${m.base}`, custo: (custoLote / total) * 100 };
}

/** Valida o formulário e converte para o formato de salvar_preparo; devolve o erro em português. */
export function preparoParaSalvar(p: PreparoEditavel, insumos: Map<string, InsumoLite & { nome?: string; tipo?: string | null }>):
  { ok: true; valor: PreparoParaSalvar } | { ok: false; erro: string } {
  const nome = p.nome.trim();
  if (!nome) return { ok: false, erro: "Dê um nome ao preparo (ex.: Cobertura de chocolate)." };
  if (nome.length > 120) return { ok: false, erro: "O nome do preparo é longo demais." };
  const rendimento = numeroIngrediente(p.rendimento);
  if (!Number.isFinite(rendimento) || rendimento <= 0) return { ok: false, erro: "Informe quanto a receita rende (ex.: 500 g)." };
  if (!(MEDIDAS_RENDIMENTO as readonly string[]).includes(p.unidade)) return { ok: false, erro: "Escolha a medida do rendimento." };
  const linhas = p.itens.filter((i) => i.insumo_id);
  if (linhas.length === 0) return { ok: false, erro: "Adicione pelo menos um ingrediente." };
  if (linhas.length > MAX_ITENS_PREPARO) return { ok: false, erro: `Use no máximo ${MAX_ITENS_PREPARO} ingredientes.` };
  const itens: PreparoParaSalvar["itens"] = [];
  for (const l of linhas) {
    const ins = insumos.get(l.insumo_id);
    const nomeIns = ins?.nome ?? "ingrediente";
    if (ehPreparo(ins)) return { ok: false, erro: `"${nomeIns}" já é um preparo; use os ingredientes dele.` };
    const quantidade = numeroIngrediente(l.quantidade);
    if (!Number.isFinite(quantidade) || quantidade <= 0) return { ok: false, erro: `Informe a quantidade de "${nomeIns}".` };
    itens.push({ insumo_id: l.insumo_id, quantidade, unidade: l.unidade });
  }
  try {
    custoDoLote(itens, insumos);
  } catch (e) {
    return { ok: false, erro: e instanceof Error ? e.message : "Confira as medidas dos ingredientes." };
  }
  return { ok: true, valor: { nome, rendimento, unidade: p.unidade, itens } };
}
