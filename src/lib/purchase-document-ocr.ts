import { normalizeInvoice, type IngredientMatch, type InvoiceExtraction, type PurchaseDocument } from "./purchase-document";
import { lerDocumento, linhasDaPagina, textoDaLinha, type LinhaPdf } from "./leitura-documento";

type OcrWorker = {
  recognize(input: unknown): Promise<{ data: { text: string } }>;
  terminate(): Promise<unknown>;
};
type TesseractApi = {
  createWorker(language: string, oem?: number, options?: Record<string, string>): Promise<OcrWorker>;
};
type PdfPage = {
  getTextContent(): Promise<{ items: Array<{ str?: string; transform?: number[]; width?: number }> }>;
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
    script.dataset["documentOcr"] = src;
    script.onload = finish;
    script.onerror = () => { script.remove(); reject(new Error("Falha ao carregar o mecanismo de leitura. Verifique sua conexão.")); };
    document.head.appendChild(script);
  });
}

/** Lê o texto (de PDF ou OCR) com as regras de leitura-documento.ts. */
export function parseOcrText(text: string, linhasPdf?: LinhaPdf[]): InvoiceExtraction {
  return lerDocumento(text, linhasPdf);
}

/** Texto de uma página de PDF, uma linha por altura (ver linhasDaPagina). */
export function textoDaPagina(items: Array<{ str?: string; transform?: number[]; width?: number }>): string {
  return linhasDaPagina(items).map(textoDaLinha).join("\n");
}

async function getPdfText(bytes: Uint8Array): Promise<{ text: string; pages: PdfPage[]; linhas: LinhaPdf[] }> {
  await loadScript(PDFJS_URL, () => Boolean(window.pdfjsLib));
  const pdf = window.pdfjsLib;
  if (!pdf) throw new Error("O leitor de PDF não ficou disponível.");
  pdf.GlobalWorkerOptions.workerSrc = PDFJS_WORKER_URL;
  const doc = await pdf.getDocument({ data: bytes }).promise;
  if (doc.numPages > MAX_PDF_PAGES) throw new Error(`Por segurança, a leitura aceita PDFs de até ${MAX_PDF_PAGES} páginas. Divida o arquivo e tente novamente.`);
  const pages: PdfPage[] = [];
  const texts: string[] = [];
  const linhas: LinhaPdf[] = [];
  for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber++) {
    const page = await doc.getPage(pageNumber);
    pages.push(page);
    const content = await page.getTextContent();
    const daPagina = linhasDaPagina(content.items);
    linhas.push(...daPagina);
    texts.push(daPagina.map(textoDaLinha).join("\n"));
  }
  return { text: texts.join("\n"), pages, linhas };
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
  let linhasPdf: LinhaPdf[] | undefined;
  if (mime === "application/pdf") {
    const { text: pdfText, pages, linhas } = await getPdfText(new Uint8Array(await file.arrayBuffer()));
    if (pdfText.replace(/\s/g, "").length >= 80) {
      text = pdfText;
      linhasPdf = linhas;
    }
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
  return normalizeInvoice(parseOcrText(text, linhasPdf), ingredients);
}
