export const MEDIDAS = ["kg", "g", "L", "ml", "un"];
export const medidaLabel = (u: string) => u === "un" ? "unidade" : u;
export function medida(u: string) {
  if (u === "kg" || u === "g") return { base: "g", fator: u === "kg" ? 1000 : 1 };
  if (u === "L" || u === "ml") return { base: "ml", fator: u === "L" ? 1000 : 1 };
  if (["un", "unidade", "dúzia"].includes(u)) return { base: "un", fator: u === "dúzia" ? 12 : 1 };
  if (u === "pacote") return { base: "pacote", fator: 1 };
  return null;
}
export function medidasCompativeis(u: string) {
  const base = medida(u)?.base;
  return [...MEDIDAS, ...(u === "dúzia" || u === "pacote" ? [u] : [])].filter((v) => medida(v)?.base === base);
}
/** Strict numeric input; unlike parseFloat, rejects trailing text and empty values. */
export function numeroIngrediente(s: string): number {
  const text = s.trim();
  if (!/^(?:\d+(?:\.\d+)?|\d{1,3}(?:\.\d{3})*)(?:,\d+)?$/.test(text)) return NaN;
  return Number(text.includes(",") ? text.replaceAll(".", "").replace(",", ".") : text);
}
export type Embalagem = { preco_embalagem?: number | null; quantidade_embalagem?: number | null; unidade_embalagem?: string | null; preco_unidade: number; unidade?: string };
export function custoProporcional(i: Embalagem, quantidade: number, unidade: string) {
  const compra = medida(i.unidade_embalagem ?? i.unidade ?? "un");
  const consumo = medida(unidade);
  const preco = i.preco_embalagem ?? i.preco_unidade;
  const total = i.quantidade_embalagem ?? 1;
  if (!compra || !consumo || compra.base !== consumo.base) throw new Error("Unidades incompatíveis: peso, volume e contagem não podem ser misturados.");
  if (!Number.isFinite(preco) || preco < 0 || !Number.isFinite(total) || total <= 0 || !Number.isFinite(quantidade) || quantidade < 0) throw new Error("Confira o preço e as quantidades. A embalagem deve ter quantidade maior que zero.");
  return (preco / (total * compra.fator)) * (quantidade * consumo.fator);
}
export function custoPorMedida(i: Embalagem) {
  const unidade = i.unidade_embalagem ?? i.unidade ?? "un";
  // Show per kg/L rather than a two-decimal base cost that may display as zero.
  const u = medida(unidade)?.base === "g" ? "kg" : medida(unidade)?.base === "ml" ? "L" : unidade === "dúzia" ? "un" : unidade;
  return { unidade: u, custo: custoProporcional(i, 1, u) };
}