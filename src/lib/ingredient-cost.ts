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
/**
 * Strict numeric input for quantities. A single comma or period is treated as
 * the decimal separator (so "3.396" means 3.396, not 3396). When both
 * separators are present, the last one is decimal and the other is grouping.
 */
export function numeroIngrediente(s: string): number {
  const text = s.trim().replace(/\s/g, "");
  if (!text || !/^[\d.,]+$/.test(text) || !/\d/.test(text)) return NaN;

  const lastDot = text.lastIndexOf(".");
  const lastComma = text.lastIndexOf(",");
  if (lastDot >= 0 && lastComma >= 0) {
    const decimalSeparator = lastDot > lastComma ? "." : ",";
    const groupingSeparator = decimalSeparator === "." ? "," : ".";
    const normalized = text.split(groupingSeparator).join("").replace(decimalSeparator, ".");
    return /^\d+(?:\.\d+)?$/.test(normalized) ? Number(normalized) : NaN;
  }

  const separator = lastDot >= 0 ? "." : lastComma >= 0 ? "," : null;
  if (!separator) return /^\d+$/.test(text) ? Number(text) : NaN;
  const pieces = text.split(separator);
  if (pieces.length !== 2 || !pieces[0] || !pieces[1]) return NaN;
  const normalized = pieces[0] + "." + pieces[1];
  return /^\d+(?:\.\d+)?$/.test(normalized) ? Number(normalized) : NaN;
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