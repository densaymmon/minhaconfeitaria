import { CATEGORIAS } from "@/lib/format";

/** Tamanho máximo do nome de uma categoria criada pelo usuário. */
export const CATEGORIA_MAX = 40;

type ProdutoComCategoria = { categoria: string | null; oculto?: boolean | null };

/** Limpa o nome digitado: tira espaços sobrando e limita o tamanho. */
export function normalizarCategoria(nome: string): string {
  return nome.replace(/\s+/g, " ").trim().slice(0, CATEGORIA_MAX);
}

const chave = (nome: string) => nome.toLocaleLowerCase("pt-BR");

/**
 * Categorias para escolher no cadastro: as sugeridas e as já usadas nos produtos,
 * sem repetir (maiúsculas/minúsculas contam como a mesma), em ordem alfabética.
 */
export function categoriasDisponiveis(produtos: ProdutoComCategoria[], extras: string[] = []): string[] {
  const vistas = new Map<string, string>();
  for (const nome of [...produtos.map((p) => p.categoria ?? ""), ...extras, ...CATEGORIAS]) {
    const limpo = normalizarCategoria(nome);
    if (limpo && !vistas.has(chave(limpo))) vistas.set(chave(limpo), limpo);
  }
  return [...vistas.values()].sort((a, b) => a.localeCompare(b, "pt-BR"));
}

/** Usa a grafia de uma categoria existente quando o nome novo só muda maiúsculas/minúsculas. */
export function categoriaExistenteOuNova(nome: string, existentes: string[]): string {
  const limpo = normalizarCategoria(nome);
  return existentes.find((c) => chave(c) === chave(limpo)) ?? limpo;
}

/** Categorias usadas pelos produtos visíveis, com a quantidade de cada uma (para o filtro). */
export function contarPorCategoria(produtos: ProdutoComCategoria[]): { categoria: string; total: number }[] {
  const contagem = new Map<string, { categoria: string; total: number }>();
  for (const p of produtos) {
    const nome = normalizarCategoria(p.categoria ?? "") || "Sem categoria";
    const atual = contagem.get(chave(nome));
    if (atual) atual.total += 1;
    else contagem.set(chave(nome), { categoria: nome, total: 1 });
  }
  return [...contagem.values()].sort((a, b) => a.categoria.localeCompare(b.categoria, "pt-BR"));
}

/** Confere se o produto é da categoria escolhida no filtro (null = todas). */
export function daCategoria(p: ProdutoComCategoria, categoria: string | null): boolean {
  if (categoria === null) return true;
  const nome = normalizarCategoria(p.categoria ?? "") || "Sem categoria";
  return chave(nome) === chave(categoria);
}
