// Lista de produção: ingredientes necessários para o que falta produzir, comparados
// com o estoque. Funções puras, testadas em lista-producao.test.ts.
// A conta segue a mesma regra do consumo real em `ajustar_producao`:
// quantidade da receita convertida para a unidade base (g, ml, un) × unidades / rendimento.

import { medida } from "./ingredient-cost";

export type UnidadeBase = "g" | "ml" | "un";

export type ItemPendente = { produto_id: string | null; pendente: number };

export type ProdutoReceita = {
  id: string;
  nome: string;
  rendimento: number | null;
  receita_itens: { insumo_id: string; quantidade: number; quantidade_utilizada?: number | null; unidade_receita?: string | null }[];
  /** Kit: produtos que o compõem (as receitas deles entram na conta). */
  componentes?: unknown;
};

/** Componentes do kit lidos do banco (jsonb), ignorando itens inválidos. */
export function componentesDoKit(valor: unknown): { produto_id: string; quantidade: number }[] {
  if (!Array.isArray(valor)) return [];
  return valor.flatMap((k) => {
    const item = k as { produto_id?: unknown; quantidade?: unknown };
    const quantidade = Number(item?.quantidade);
    return typeof item?.produto_id === "string" && quantidade > 0 ? [{ produto_id: item.produto_id, quantidade }] : [];
  });
}

export type InsumoBase = { id: string; nome: string; unidade?: string | null; unidade_embalagem?: string | null };

export type SaldoEstoque = { insumo_id: string; saldo: number; unidade_base: string | null };

export type Necessidade = {
  insumo_id: string;
  nome: string;
  unidade: UnidadeBase;
  necessario: number;
  /** Saldo em estoque na mesma unidade; null quando o estoque não está configurado para esta medida. */
  estoque: number | null;
  /** Quanto falta comprar (0 quando o estoque cobre ou é desconhecido). */
  falta: number;
};

export type ResultadoIngredientes = {
  linhas: Necessidade[];
  /** Produtos pendentes sem ficha técnica (não entram na conta). */
  semReceita: string[];
  /** Ingredientes cuja medida da receita não pôde ser convertida. */
  semMedida: string[];
  /** Itens avulsos (sem produto cadastrado) que não entram na conta. */
  avulsos: number;
};

const n = (v: unknown) => Number(v ?? 0) || 0;

/** Soma os ingredientes necessários para produzir o que está pendente. */
export function ingredientesNecessarios(
  itens: ItemPendente[],
  produtos: ProdutoReceita[],
  insumos: InsumoBase[],
  saldos: SaldoEstoque[] = [],
): ResultadoIngredientes {
  const porProduto = new Map<string, number>();
  let avulsos = 0;
  for (const item of itens) {
    const pendente = n(item.pendente);
    if (pendente <= 0) continue;
    if (!item.produto_id) { avulsos += 1; continue; }
    porProduto.set(item.produto_id, (porProduto.get(item.produto_id) ?? 0) + pendente);
  }

  const mapaProdutos = new Map(produtos.map((p) => [p.id, p]));
  // Kits viram os produtos que os compõem (um nível, como no banco).
  for (const [produtoId, quantidade] of [...porProduto]) {
    const kit = mapaProdutos.get(produtoId);
    const itensKit = componentesDoKit(kit?.componentes);
    if (!kit || itensKit.length === 0) continue;
    if (kit.receita_itens.length === 0) porProduto.delete(produtoId);
    for (const c of itensKit) porProduto.set(c.produto_id, (porProduto.get(c.produto_id) ?? 0) + c.quantidade * quantidade);
  }
  const mapaInsumos = new Map(insumos.map((i) => [i.id, i]));
  const mapaSaldos = new Map(saldos.map((s) => [s.insumo_id, s]));
  const total = new Map<string, { nome: string; unidade: UnidadeBase; necessario: number }>();
  const semReceita = new Set<string>();
  const semMedida = new Set<string>();

  for (const [produtoId, quantidade] of porProduto) {
    const produto = mapaProdutos.get(produtoId);
    if (!produto) { avulsos += 1; continue; }
    if (produto.receita_itens.length === 0) { semReceita.add(produto.nome); continue; }
    const rendimento = n(produto.rendimento) > 0 ? n(produto.rendimento) : 1;
    for (const ri of produto.receita_itens) {
      const insumo = mapaInsumos.get(ri.insumo_id);
      if (!insumo) continue;
      const m = medida(ri.unidade_receita ?? insumo.unidade_embalagem ?? insumo.unidade ?? "");
      if (!m || (m.base !== "g" && m.base !== "ml" && m.base !== "un")) { semMedida.add(insumo.nome); continue; }
      const porLote = n(ri.quantidade_utilizada ?? ri.quantidade) * m.fator;
      const atual = total.get(insumo.id) ?? { nome: insumo.nome, unidade: m.base, necessario: 0 };
      if (atual.unidade !== m.base) { semMedida.add(insumo.nome); continue; }
      atual.necessario += (porLote * quantidade) / rendimento;
      total.set(insumo.id, atual);
    }
  }

  const linhas = [...total.entries()]
    .map(([insumo_id, t]): Necessidade => {
      const saldo = mapaSaldos.get(insumo_id);
      const estoque = saldo && saldo.unidade_base === t.unidade ? Math.max(0, n(saldo.saldo)) : null;
      const necessario = arredondar(t.necessario);
      return { insumo_id, nome: t.nome, unidade: t.unidade, necessario, estoque, falta: estoque === null ? 0 : arredondar(Math.max(0, necessario - estoque)) };
    })
    .filter((l) => l.necessario > 0)
    .sort((a, b) => Number(b.falta > 0) - Number(a.falta > 0) || a.nome.localeCompare(b.nome, "pt-BR"));

  return {
    linhas,
    semReceita: [...semReceita].sort((a, b) => a.localeCompare(b, "pt-BR")),
    semMedida: [...semMedida].sort((a, b) => a.localeCompare(b, "pt-BR")),
    avulsos,
  };
}

const arredondar = (v: number) => Math.round(v * 1000) / 1000;

/** Mostra 1500 g como "1,5 kg", 250 ml como "250 ml" e unidades como "3 un". */
export function formatarQuantidade(valor: number, unidade: UnidadeBase) {
  const fmt = (v: number, casas: number) => new Intl.NumberFormat("pt-BR", { maximumFractionDigits: casas }).format(v);
  if (unidade === "g") return valor >= 1000 ? `${fmt(valor / 1000, 2)} kg` : `${fmt(valor, 0)} g`;
  if (unidade === "ml") return valor >= 1000 ? `${fmt(valor / 1000, 2)} L` : `${fmt(valor, 0)} ml`;
  return `${fmt(valor, 1)} un`;
}

/** Soma dias a uma data ISO (yyyy-MM-dd), sem depender do fuso horário. */
export function somarDias(iso: string, dias: number) {
  const [a, m, d] = iso.split("-").map(Number);
  const data = new Date(Date.UTC(a ?? 1970, (m ?? 1) - 1, d ?? 1));
  data.setUTCDate(data.getUTCDate() + dias);
  return data.toISOString().slice(0, 10);
}

export type PeriodoRapido = "hoje" | "amanha" | "semana" | "tudo";

/**
 * Datas de cada atalho. "Hoje" e "7 dias" começam sem data inicial para incluir
 * pedidos atrasados que ainda não foram entregues.
 */
export function intervaloPeriodo(periodo: PeriodoRapido, hoje: string): { inicio: string; fim: string } {
  if (periodo === "hoje") return { inicio: "", fim: hoje };
  if (periodo === "amanha") { const amanha = somarDias(hoje, 1); return { inicio: amanha, fim: amanha }; }
  if (periodo === "semana") return { inicio: "", fim: somarDias(hoje, 6) };
  return { inicio: "", fim: "" };
}

export function periodoAtual(inicio: string, fim: string, hoje: string): PeriodoRapido | null {
  for (const p of ["hoje", "amanha", "semana", "tudo"] as const) {
    const i = intervaloPeriodo(p, hoje);
    if (i.inicio === inicio && i.fim === fim) return p;
  }
  return null;
}
