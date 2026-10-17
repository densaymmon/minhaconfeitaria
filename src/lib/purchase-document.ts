import { z } from "zod";
import { medidasCompativeis } from "./ingredient-cost";

export const DOCUMENT_MAX_BYTES = 10 * 1024 * 1024;
export const DOCUMENT_ACCEPT = ".xml,.pdf,.jpg,.jpeg,.png,.webp,text/xml,application/xml,application/pdf,image/jpeg,image/png,image/webp";
const mimeByExtension: Record<string, string> = { xml: "application/xml", pdf: "application/pdf", jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp" };

export function validateDocumentFile(file: { name: string; type: string; size: number }) {
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  const mime = mimeByExtension[ext];
  if (!mime || (file.type && file.type !== mime && !(ext === "xml" && file.type === "text/xml"))) throw new Error("Formato não aceito. Envie XML, PDF, JPG, JPEG, PNG ou WEBP.");
  if (file.size <= 0) throw new Error("O arquivo está vazio.");
  if (file.size > DOCUMENT_MAX_BYTES) throw new Error("O documento deve ter no máximo 10 MB.");
  return mime;
}

export function validateVisualBytes(bytes: Uint8Array, mime: string) {
  const starts = (...values: number[]) => values.every((value, i) => bytes[i] === value);
  const ascii = (start: number, end: number) => String.fromCharCode(...bytes.slice(start, end));
  const valid = mime === "application/pdf" ? ascii(0, 5) === "%PDF-"
    : mime === "image/jpeg" ? starts(255, 216, 255)
    : mime === "image/png" ? starts(137, 80, 78, 71, 13, 10, 26, 10)
    : mime === "image/webp" ? ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP" : false;
  if (!valid) throw new Error("O conteúdo não corresponde ao formato informado ou o arquivo está danificado.");
}

// All fields required-but-nullable: no guessed defaults in visual extraction.
const money = z.number().nullable();
export const invoiceSchema = z.object({
  fornecedor: z.string().nullable(), data: z.string().nullable(), documento: z.string().nullable(), chave: z.string().nullable(),
  desconto: money, despesas: money, total: money, duvidas: z.array(z.string()),
  itens: z.array(z.object({ descricao: z.string().nullable(), codigo: z.string().nullable(), quantidade: money,
    unidade: z.string().nullable(), valor_unitario: money, valor_total: money, desconto: money, duvidas: z.array(z.string()) }).strict()),
}).strict();
export type InvoiceExtraction = z.infer<typeof invoiceSchema>;
export type DocumentLine = { id: string; nome: string; codigo: string; quantidade: number | null; unidade: string; total: number | null; unitario: number | null; desconto: number | null; insumoId: string; ignorar: boolean; duvidas: string[] };
export type PurchaseDocument = { fornecedor: string; data: string; numero: string; chave: string; total: number | null; desconto: number | null; despesas: number | null; linhas: DocumentLine[]; duvidas: string[] };
export type IngredientMatch = { id: string; nome: string; unidade?: string | null; unidade_embalagem?: string | null };
const normalize = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLocaleLowerCase("pt-BR").replace(/\s+/g, " ");
export function documentUnit(value: string) {
  const u = normalize(value);
  if (["kg", "quilo", "quilos"].includes(u)) return "kg";
  if (["g", "gr", "grama", "gramas"].includes(u)) return "g";
  if (["l", "lt", "litro", "litros"].includes(u)) return "L";
  if (["ml", "mililitro", "mililitros"].includes(u)) return "ml";
  if (["un", "und", "unid", "unidade", "unidades", "pc", "peca"].includes(u)) return "un";
  return "";
}
export function safeIngredientMatch(name: string, unit: string, ingredients: IngredientMatch[]) {
  if (!name.trim() || !unit) return "";
  const matches = ingredients.filter((i) => normalize(i.nome) === normalize(name) && medidasCompativeis(i.unidade_embalagem ?? i.unidade ?? "").includes(unit));
  return matches.length === 1 ? matches[0]?.id ?? "" : "";
}
export function validDocumentDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
}
const nonnegative = (value: number | null) => value !== null && Number.isFinite(value) && value >= 0 ? value : null;
export function normalizeInvoice(input: InvoiceExtraction, ingredients: IngredientMatch[]): PurchaseDocument {
  const date = input.data ?? "";
  return {
    fornecedor: (input.fornecedor ?? "").slice(0, 120), data: validDocumentDate(date) ? date : "", numero: (input.documento ?? "").slice(0, 120), chave: (input.chave ?? "").slice(0, 120),
    total: nonnegative(input.total), desconto: nonnegative(input.desconto), despesas: nonnegative(input.despesas),
    duvidas: [...input.duvidas.slice(0, 20), ...(!validDocumentDate(date) ? ["Data ausente ou inválida."] : [])],
    linhas: input.itens.slice(0, 100).map((item, index) => {
      const unidade = documentUnit(item.unidade ?? "");
      const nome = (item.descricao ?? "").slice(0, 120);
      return { id: `linha-${index}`, nome, codigo: (item.codigo ?? "").slice(0, 120), quantidade: nonnegative(item.quantidade), unidade,
        total: nonnegative(item.valor_total), unitario: nonnegative(item.valor_unitario), desconto: nonnegative(item.desconto),
        insumoId: safeIngredientMatch(nome, unidade, ingredients), ignorar: false,
        duvidas: [...item.duvidas.slice(0, 10), ...(!unidade ? ["Unidade não reconhecida; informe a medida real, não o número de embalagens."] : [])] };
    }),
  };
}
function xmlText(element: Element | Document, name: string) {
  return Array.from(element.getElementsByTagName("*")).find((item) => item.localName === name)?.textContent?.trim() ?? "";
}
const xmlNumber = (value: string) => value.trim() && Number.isFinite(Number(value)) ? Number(value) : null;
export function parseInvoiceXml(xml: string, ingredients: IngredientMatch[]): PurchaseDocument {
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  if (doc.getElementsByTagName("parsererror").length) throw new Error("O XML não é válido. Confira se selecionou o XML da nota fiscal.");
  const all = Array.from(doc.documentElement.getElementsByTagName("*"));
  const details = all.filter((el) => el.localName === "det");
  if (!details.length) throw new Error("Não encontrei produtos nesse XML. Envie o XML completo da NF-e ou NFC-e.");
  const totals = all.find((el) => el.localName === "ICMSTot");
  const issuer = all.find((el) => el.localName === "emit");
  const inf = all.find((el) => el.localName === "infNFe");
  const result = normalizeInvoice({ fornecedor: issuer ? xmlText(issuer, "xNome") : null,
    data: (xmlText(doc, "dhEmi") || xmlText(doc, "dEmi")).slice(0, 10) || null,
    documento: xmlText(doc, "nNF") || null, chave: (inf?.getAttribute("Id") ?? "").replace(/^NFe/, "") || null,
    total: totals ? xmlNumber(xmlText(totals, "vNF")) : xmlNumber(xmlText(doc, "vNF")),
    desconto: totals ? xmlNumber(xmlText(totals, "vDesc")) : null,
    despesas: totals ? ["vFrete", "vSeg", "vOutro"].reduce((sum, name) => sum + (xmlNumber(xmlText(totals, name)) ?? 0), 0) : null,
    duvidas: [], itens: details.map((detail) => {
      const q = xmlNumber(xmlText(detail, "qCom"));
      const unit = xmlNumber(xmlText(detail, "vUnCom"));
      const gross = xmlNumber(xmlText(detail, "vProd")) ?? (q !== null && unit !== null ? q * unit : null);
      const discount = xmlNumber(xmlText(detail, "vDesc")) ?? 0;
      return { descricao: xmlText(detail, "xProd") || null, codigo: xmlText(detail, "cProd") || null,
        quantidade: q, unidade: xmlText(detail, "uCom") || null, valor_unitario: unit,
        valor_total: gross !== null ? gross - discount : null, desconto: discount, duvidas: [] };
    }) }, ingredients);
  return result;
}
export function reviewDocument(doc: PurchaseDocument, ingredients: IngredientMatch[]) {
  const selected = doc.linhas.filter((l) => !l.ignorar);
  const errors: string[] = [];
  if (!validDocumentDate(doc.data)) errors.push("Informe a data da compra.");
  if (!selected.length) errors.push("Selecione pelo menos um item.");
  for (const line of selected) {
    if (!line.nome.trim() || line.quantidade === null || line.quantidade <= 0 || !Number.isFinite(line.quantidade) || line.total === null || line.total < 0 || !Number.isFinite(line.total) || !documentUnit(line.unidade) || !line.insumoId) errors.push(`Revise descrição, quantidade, unidade, total e vínculo do item ${doc.linhas.indexOf(line) + 1}.`);
    const ingredient = ingredients.find((i) => i.id === line.insumoId);
    if (line.insumoId !== "__novo__" && (!ingredient || !medidasCompativeis(ingredient.unidade_embalagem ?? ingredient.unidade ?? "").includes(line.unidade))) errors.push(`Unidade incompatível no item ${doc.linhas.indexOf(line) + 1}.`);
  }
  const sum = selected.reduce((s, l) => s + (l.total ?? 0), 0);
  if (sum <= 0) errors.push("O total da compra precisa ser maior que zero.");
  const divergence = doc.total === null || Math.abs(sum - doc.total) > 0.02;
  const itemDivergences = selected.filter((l) => l.unitario !== null && l.quantidade !== null && l.total !== null && Math.abs(l.quantidade * l.unitario - (l.desconto ?? 0) - l.total) > 0.02);
  return { errors, sum, divergence, itemDivergences };
}

export function possibleDuplicate(doc: PurchaseDocument, purchases: { id: string; data_compra: string; local_compra: string | null; total: number; cancelada_em: string | null }[]) {
  const sum = doc.linhas.filter((l) => !l.ignorar).reduce((s, l) => s + (l.total ?? 0), 0);
  return purchases.find((p) => !p.cancelada_em && doc.fornecedor.trim() && normalize(p.local_compra ?? "") === normalize(doc.fornecedor) && p.data_compra === doc.data && Math.abs(Number(p.total) - sum) < 0.005);
}