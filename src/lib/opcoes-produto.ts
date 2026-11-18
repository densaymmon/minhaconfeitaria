// Variações de produto: conversão entre o editor e produtos.opcoes (testado em opcoes-produto.test.ts).
import { parseNum } from "./format";
import { custoItemReceita, type InsumoLite } from "./calc";
import { numeroIngrediente } from "./ingredient-cost";

/**
 * Ingrediente extra de uma opção (ex.: a cobertura de ganache leva 200 g de chocolate),
 * por unidade do produto. Quando a opção tem ingredientes, o "+ Custo" é calculado a partir deles
 * com o preço atual dos insumos; sem ingredientes, vale o custo digitado.
 */
export type IngredienteOpcao = { insumo_id: string; quantidade: number; unidade: string };
export type IngredienteEditavel = { insumo_id: string; quantidade: string; unidade: string };
export type OpcaoEditavel = { nome: string; preco: string; custo: string; ingredientes?: IngredienteEditavel[] };
export type OpcaoSalva = { nome: string; preco: number; custo: number; ingredientes?: IngredienteOpcao[] };

/** Grupo de opções em edição (valores como texto, para digitar "5,50"). */
export type GrupoEditavel = { grupo: string; itens: OpcaoEditavel[] };
export type GrupoSalvo = { grupo: string; itens: OpcaoSalva[] };

export const MAX_GRUPOS = 5;
export const MAX_OPCOES = 15;
export const MAX_INGREDIENTES_OPCAO = 15;

type MapaInsumos = Map<string, InsumoLite>;
const arred2 = (v: number) => Math.round(v * 100) / 100;

/** Custo dos ingredientes extras de uma opção, por unidade do produto. */
export function custoIngredientesOpcao(ingredientes: IngredienteOpcao[], insumos: MapaInsumos): number {
  return ingredientes.reduce((s, i) => s + custoItemReceita({ insumo_id: i.insumo_id, quantidade: i.quantidade, quantidade_utilizada: i.quantidade, unidade_receita: i.unidade }, insumos.get(i.insumo_id)), 0);
}

/** Custo da opção: calculado pelos ingredientes quando houver; senão, o valor digitado. */
export function custoDaOpcao(opcao: OpcaoSalva, insumos: MapaInsumos): number {
  if (!opcao.ingredientes?.length) return Number(opcao.custo) || 0;
  try {
    return custoIngredientesOpcao(opcao.ingredientes, insumos);
  } catch {
    return Number(opcao.custo) || 0; // medida que deixou de combinar com o insumo: usa o último custo salvo
  }
}

function lerIngredientes(valor: unknown): IngredienteOpcao[] {
  if (!Array.isArray(valor)) return [];
  return valor.flatMap((i) => {
    const insumo_id = typeof i?.insumo_id === "string" ? i.insumo_id : "";
    const quantidade = Number(i?.quantidade);
    const unidade = typeof i?.unidade === "string" ? i.unidade : "";
    return insumo_id && quantidade > 0 && unidade ? [{ insumo_id, quantidade, unidade }] : [];
  });
}

/** Lê produtos.opcoes (JSON do banco) já convertido em números, para pedidos e cálculos. */
export function lerGrupos(valor: unknown): GrupoSalvo[] {
  if (!Array.isArray(valor)) return [];
  return valor.flatMap((g) => {
    if (!g || typeof g !== "object" || !Array.isArray(g.itens)) return [];
    const itens = (g.itens as Record<string, unknown>[]).flatMap((i) => {
      const nome = String(i?.nome ?? "").trim();
      if (!nome) return [];
      const ingredientes = lerIngredientes(i?.ingredientes);
      return [{ nome, preco: Number(i?.preco) || 0, custo: Number(i?.custo) || 0, ...(ingredientes.length ? { ingredientes } : {}) }];
    });
    const grupo = String(g.grupo ?? "").trim();
    return grupo && itens.length ? [{ grupo, itens }] : [];
  });
}

export type Escolha = Record<string, string>;

/** Primeira opção de cada grupo (ponto de partida ao adicionar o produto num pedido). */
export function escolhaPadrao(grupos: GrupoSalvo[]): Escolha {
  return Object.fromEntries(grupos.map((g) => [g.grupo, g.itens[0]?.nome ?? ""]));
}

/** Mesmo formato da descrição gravada pelo catálogo: "Bolo (Tamanho: G, Cobertura: Ganache)". */
export function descricaoDaEscolha(nome: string, grupos: GrupoSalvo[], escolha: Escolha): string {
  const partes = grupos.filter((g) => g.itens.some((i) => i.nome === escolha[g.grupo])).map((g) => `${g.grupo}: ${escolha[g.grupo]}`);
  return partes.length ? `${nome} (${partes.join(", ")})` : nome;
}

/** Tenta reconhecer a escolha a partir de uma descrição já gravada (pedidos antigos ou do catálogo). */
export function escolhaDaDescricao(nome: string, grupos: GrupoSalvo[], descricao: string): Escolha | null {
  if (!grupos.length) return null;
  const prefixo = `${nome} (`;
  if (!descricao.startsWith(prefixo) || !descricao.endsWith(")")) return null;
  const escolha: Escolha = {};
  for (const parte of descricao.slice(prefixo.length, -1).split(", ")) {
    const corte = parte.indexOf(": ");
    if (corte < 0) return null;
    const grupo = grupos.find((g) => g.grupo === parte.slice(0, corte));
    const opcao = parte.slice(corte + 2);
    if (!grupo || !grupo.itens.some((i) => i.nome === opcao)) return null;
    escolha[grupo.grupo] = opcao;
  }
  return descricaoDaEscolha(nome, grupos, escolha) === descricao ? escolha : null;
}

/** Preço, custo e descrição de uma unidade do produto com as opções escolhidas. */
export function aplicarEscolha(
  produto: { nome: string; preco: number; custo: number },
  grupos: GrupoSalvo[],
  escolha: Escolha,
  insumos: MapaInsumos,
): { preco: number; custo: number; descricao: string } {
  let preco = produto.preco;
  let custo = produto.custo;
  for (const g of grupos) {
    const opcao = g.itens.find((i) => i.nome === escolha[g.grupo]);
    if (!opcao) continue;
    preco += opcao.preco;
    custo += custoDaOpcao(opcao, insumos);
  }
  return { preco: arred2(Math.max(0, preco)), custo: +Math.max(0, custo).toFixed(4), descricao: descricaoDaEscolha(produto.nome, grupos, escolha) };
}

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
        ? itens.map((i: { nome?: unknown; preco?: unknown; custo?: unknown; ingredientes?: unknown }) => {
            const ingredientes = lerIngredientes(i?.ingredientes);
            return {
              nome: String(i?.nome ?? ""), preco: String(i?.preco ?? 0).replace(".", ","), custo: String(i?.custo ?? 0).replace(".", ","),
              ...(ingredientes.length ? { ingredientes: ingredientes.map((x) => ({ insumo_id: x.insumo_id, quantidade: String(x.quantidade).replace(".", ","), unidade: x.unidade })) } : {}),
            };
          })
        : [],
    }];
  });
}

/** Valida e converte para o formato salvo no banco; devolve o erro em português quando houver. */
export function opcoesParaSalvar(grupos: GrupoEditavel[], insumos?: MapaInsumos): { ok: true; valor: GrupoSalvo[] } | { ok: false; erro: string } {
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
      const linhas = (i.ingredientes ?? []).filter((x) => x.insumo_id);
      if (linhas.length > MAX_INGREDIENTES_OPCAO) return { ok: false, erro: `A opção "${nome}" pode ter até ${MAX_INGREDIENTES_OPCAO} ingredientes.` };
      const ingredientes: IngredienteOpcao[] = [];
      for (const x of linhas) {
        const quantidade = numeroIngrediente(x.quantidade);
        if (!Number.isFinite(quantidade) || quantidade <= 0) return { ok: false, erro: `Informe a quantidade de cada ingrediente da opção "${nome}".` };
        ingredientes.push({ insumo_id: x.insumo_id, quantidade, unidade: x.unidade });
      }
      // Com ingredientes, o custo salvo é o calculado agora (o catálogo usa esse valor no servidor).
      let custo = Math.round(parseNum(i.custo || "0") * 100) / 100;
      if (ingredientes.length && insumos) {
        try {
          custo = arred2(custoIngredientesOpcao(ingredientes, insumos));
        } catch (e) {
          return { ok: false, erro: `Opção "${nome}": ${e instanceof Error ? e.message : "confira as medidas dos ingredientes."}` };
        }
      }
      if (Math.abs(preco) > 10000 || Math.abs(custo) > 10000) return { ok: false, erro: `Confira os valores da opção "${nome}".` };
      convertidos.push({ nome, preco, custo, ...(ingredientes.length ? { ingredientes } : {}) });
    }
    valor.push({ grupo, itens: convertidos });
  }
  if (valor.length > MAX_GRUPOS) return { ok: false, erro: `Use no máximo ${MAX_GRUPOS} grupos de opções.` };
  return { ok: true, valor };
}

