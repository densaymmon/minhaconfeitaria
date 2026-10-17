import { normalizeInvoice, type IngredientMatch, type InvoiceExtraction, type PurchaseDocument } from "./purchase-document";

type OcrWorker = {
  recognize(input: unknown): Promise<{ data: { text: string } }>;
  terminate(): Promise<unknown>;
};
type TesseractApi = {
  createWorker(language: string, oem?: number, options?: Record<string, string>): Promise<OcrWorker>;
};
type PdfPage = {
  getTextContent(): Promise<{ items: Array<{ str?: string }> }>;
  getViewport(options: { scale: number }): { width: number; height: number };
  render(options: { canvasContext: CanvasRenderingContext2D; viewport: { width: number; height: number } }): { promise: Promise<void> };
};
type PdfDocument = { numPages: number; getPage(n: number): Promise<PdfPage> };
type PdfApi = { GlobalWorkerOptions: { workerSrc: string }; getDocument(options: { data: Uint8Array }): { promise: Promise<PdfDocument> } };

declare global {
  interface Window {
    Tesseract?: TesseractApi;
    pdfjsLib?: PdfApi;
  }
}

const TESSERACT_URL = "https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js";
const PDFJS_URL = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js";
const PDFJS_WORKER_URL = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
const MAX_PDF_PAGES = 8;

function loadScript(src: string, available: () => boolean): Promise<void> {
  if (available()) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[data-document-ocr="${src}"]`);
    const finish = () => available() ? resolve() : reject(new Error("Não foi possível carregar o mecanismo de leitura. Verifique sua conexão e tente novamente."));
    if (existing) {
      existing.addEventListener("load", finish, { once: true });
      existing.addEventListener("error", () => reject(new Error("Falha ao carregar o mecanismo de leitura.")), { once: true });
      return;
    }
    const script = document.createElement("script");
    script.src = src;
    script.async = true;
    script.dataset.documentOcr = src;
    script.onload = finish;
    script.onerror = () => { script.remove(); reject(new Error("Falha ao carregar o mecanismo de leitura. Verifique sua conexão.")); };
    document.head.appendChild(script);
  });
}

function parseNumber(value: string): number | null {
  const s = value.trim().replace(/R\$\s*/i, "").replace(/\s/g, "");
  if (!s) return null;
  const normalized = s.includes(",") ? s.replace(/\./g, "").replace(",", ".") : s;
  const number = Number(normalized);
  return Number.isFinite(number) && number >= 0 ? number : null;
}

function extractDate(text: string): string | null {
  const iso = text.match(/\b(20\d{2})-(\d{2})-(\d{2})\b/);
  if (iso) return iso[0];
  const br = text.match(/\b(\d{2})[/. -](\d{2})[/. -](20\d{2})\b/);
  if (!br) return null;
  const [, day, month, year] = br;
  const candidate = `${year}-${month}-${day}`;
  const date = new Date(`${candidate}T12:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === candidate ? candidate : null;
}

function parseOcrText(text: string): InvoiceExtraction {
  const lines = text.split(/\r?\n/).map((line) => line.replace(/\s+/g, " ").trim()).filter(Boolean).slice(0, 500);
  const fullText = lines.join("\n");
  const supplier = lines.find((line) => line.length >= 3 && line.length <= 100 && !/\b(CNPJ|CPF|DANFE|CUPOM FISCAL|NOTA FISCAL|DOCUMENTO AUXILIAR|CONSUMIDOR)\b/i.test(line) && !/\d{2}[/.]\d{2}[/.]\d{4}/.test(line)) ?? null;
  const date = extractDate(fullText);
  const totalMatches = [...fullText.matchAll(/(?:VALOR\s+TOTAL|TOTAL\s+A\s+PAGAR|TOTAL\s+GERAL|TOTAL\s+DA\s+NOTA|TOTAL\s+R\$)[^\d]{0,30}(\d{1,7}(?:\.\d{3})*,\d{2})/gi)];
  const total = totalMatches.length ? parseNumber(totalMatches[totalMatches.length - 1]?.[1] ?? "") : null;
  const discountMatch = fullText.match(/(?:DESCONTO|VLR\.?\s*DESC\.?)[^\d]{0,20}(\d{1,7}(?:\.\d{3})*,\d{2})/i);
  const expenseMatch = fullText.match(/(?:FRETE|VALOR\s+DO\s+FRETE)[^\d]{0,20}(\d{1,7}(?:\.\d{3})*,\d{2})/i);

  const items: InvoiceExtraction["itens"] = [];
  for (const line of lines) {
    if (/\b(CNPJ|CPF|TOTAL|SUBTOTAL|DESCONTO|TROCO|DINHEIRO|CR[EÉ]DITO|D[EÉ]BITO|PIX|CART[AÃ]O|FRETE|EMISS[AÃ]O|CONSULTA|CHAVE|PROTOCOLO|OPERADOR|CAIXA)\b/i.test(line)) continue;
    const values = [...line.matchAll(/(?:R\$\s*)?\b(\d{1,7}(?:\.\d{3})*,\d{2})\b/g)];
    if (!values.length) continue;
    const last = values[values.length - 1];
    const totalItem = parseNumber(last?.[1] ?? "");
    if (totalItem === null) continue;
    const prefix = line.slice(0, last?.index ?? line.length).trim().replace(/[|*•]+$/g, "").trim();
    const qtyMatch = prefix.match(/(?:^|\s)(\d+(?:[,.]\d+)?)\s*(kg|g|un|und|unid|unidade|l|lt|ml|pc|pct)?\s*(?:x|×)?\s*(\d{1,7}(?:\.\d{3})*,\d{2})?\s*$/i);
    let description = prefix;
    let quantity: number | null = null;
    let unit: string | null = null;
    let unitPrice: number | null = null;
    if (qtyMatch?.index !== undefined) {
      description = prefix.slice(0, qtyMatch.index).trim();
      quantity = parseNumber(qtyMatch[1] ?? "");
      unit = qtyMatch[2] ?? null;
      unitPrice = parseNumber(qtyMatch[3] ?? "");
    } else if (values.length >= 2) {
      const previous = values[values.length - 2];
      unitPrice = parseNumber(previous?.[1] ?? "");
      description = line.slice(0, previous?.index ?? 0).trim();
    }
    description = description.replace(/^[\d\s.)-]+/, "").replace(/[|*•]+$/g, "").trim();
    if (!description || description.length < 2) continue;
    const u = unit?.toLowerCase();
    const normalizedUnit = u ? ({ kg: "kg", g: "g", un: "un", und: "un", unid: "un", unidade: "un", l: "L", lt: "L", ml: "ml", pc: "un", pct: null } as Record<string, string | null>)[u] ?? null : null;
    items.push({ descricao: description.slice(0, 120), codigo: null, quantidade: quantity, unidade: normalizedUnit,
      valor_unitario: unitPrice, valor_total: totalItem, desconto: null, duvidas: ["Item extraído por OCR heurístico; confira descrição, quantidade, unidade e valores."] });
  }

  const duvidas = ["Leitura local por OCR: os campos extraídos são sugestões e precisam ser conferidos antes de registrar a compra."];
  if (!supplier) duvidas.push("Fornecedor não identificado com segurança.");
  if (!date) duvidas.push("Data não identificada; informe a data correta.");
  if (total === null) duvidas.push("Total do documento não identificado; confira o comprovante.");
  if (!items.length) duvidas.push("Não foi possível separar os itens automaticamente. Cadastre-os manualmente na conferência.");
  return { fornecedor: supplier, data, documento: null, chave: null, desconto: parseNumber(discountMatch?.[1] ?? ""), despesas: parseNumber(expenseMatch?.[1] ?? ""), total, duvidas, itens: items.slice(0, 100) };
}

async function getPdfText(bytes: Uint8Array): Promise<{ text: string; pages: PdfPage[] }> {
  await loadScript(PDFJS_URL, () => Boolean(window.pdfjsLib));
  const pdf = window.pdfjsLib;
  if (!pdf) throw new Error("O leitor de PDF não ficou disponível.");
  pdf.GlobalWorkerOptions.workerSrc = PDFJS_WORKER_URL;
  const doc = await pdf.getDocument({ data: bytes }).promise;
  if (doc.numPages > MAX_PDF_PAGES) throw new Error(`Por segurança, a leitura aceita PDFs de até ${MAX_PDF_PAGES} páginas. Divida o arquivo e tente novamente.`);
  const pages: PdfPage[] = [];
  const texts: string[] = [];
  for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber++) {
    const page = await doc.getPage(pageNumber);
    pages.push(page);
    const content = await page.getTextContent();
    texts.push(content.items.map((item) => item.str ?? "").join(" "));
  }
  return { text: texts.join("\n"), pages };
}

async function recognizeImage(input: unknown): Promise<string> {
  await loadScript(TESSERACT_URL, () => Boolean(window.Tesseract));
  const tesseract = window.Tesseract;
  if (!tesseract) throw new Error("O leitor de imagem não ficou disponível.");
  const worker = await tesseract.createWorker("por", 1);
  try {
    const result = await worker.recognize(input);
    return result.data.text;
  } finally {
    await worker.terminate();
  }
}

export async function readPurchaseDocumentLocally(file: File, ingredients: IngredientMatch[]): Promise<PurchaseDocument> {
  const mime = file.type || (file.name.toLowerCase().endsWith(".pdf") ? "application/pdf" : "");
  let text = "";
  if (mime === "application/pdf") {
    const { text: pdfText, pages } = await getPdfText(new Uint8Array(await file.arrayBuffer()));
    if (pdfText.replace(/\s/g, "").length >= 80) text = pdfText;
    else {
      await loadScript(TESSERACT_URL, () => Boolean(window.Tesseract));
      const tesseract = window.Tesseract;
      if (!tesseract) throw new Error("O leitor de imagem não ficou disponível.");
      const worker = await tesseract.createWorker("por");
      try {
        const chunks: string[] = [];
        for (const page of pages) {
          const viewport = page.getViewport({ scale: 1.5 });
          const canvas = document.createElement("canvas");
          canvas.width = Math.ceil(viewport.width);
          canvas.height = Math.ceil(viewport.height);
          const context = canvas.getContext("2d");
          if (!context) throw new Error("Não foi possível preparar uma página do PDF.");
          await page.render({ canvasContext: context, viewport }).promise;
          chunks.push((await worker.recognize(canvas)).data.text);
          canvas.width = 0;
          canvas.height = 0;
        }
        text = chunks.join("\n");
      } finally {
        await worker.terminate();
      }
    }
  } else {
    text = await recognizeImage(file);
  }
  if (text.trim().length < 10) throw new Error("Não foi possível ler texto suficiente. Tente uma foto mais nítida, com boa iluminação e o documento inteiro visível.");
  return normalizeInvoice(parseOcrText(text), ingredients);
}
