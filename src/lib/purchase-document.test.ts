import { describe, expect, it } from "vitest";
import { DOCUMENT_MAX_BYTES, normalizeInvoice, parseInvoiceXml, possibleDuplicate, reviewDocument, safeIngredientMatch, validateDocumentFile, validateVisualBytes, type InvoiceExtraction } from "./purchase-document";

const ingredients = [{ id: "sugar", nome: "Açúcar", unidade: "kg" }];
const input: InvoiceExtraction = { fornecedor: "Loja", data: "2026-10-17", documento: "123", chave: null, total: 18, desconto: 2, despesas: null, duvidas: [], itens: [{ descricao: "Açúcar", codigo: null, quantidade: 2, unidade: "kg", valor_unitario: 10, valor_total: 18, desconto: 2, duvidas: [] }] };
describe("documentos de compra", () => {
  it("aceita XML, PDF e JPG/JPEG/PNG/WEBP até 10 MB", () => {
    for (const [name, type] of [["n.xml", "text/xml"], ["n.pdf", "application/pdf"], ["n.jpg", "image/jpeg"], ["n.jpeg", "image/jpeg"], ["n.png", "image/png"], ["n.webp", "image/webp"]]) expect(validateDocumentFile({ name: name ?? "", type: type ?? "", size: DOCUMENT_MAX_BYTES })).toBeTruthy();
    expect(() => validateDocumentFile({ name: "n.pdf", type: "application/pdf", size: DOCUMENT_MAX_BYTES + 1 })).toThrow("10 MB");
  });
  it("rejeita arquivo vazio, extensão indevida e MIME inconsistente", () => {
    expect(() => validateDocumentFile({ name: "n.pdf", type: "application/pdf", size: 0 })).toThrow("vazio");
    expect(() => validateDocumentFile({ name: "n.svg", type: "image/svg+xml", size: 12 })).toThrow("Formato");
    expect(() => validateDocumentFile({ name: "n.png", type: "application/pdf", size: 12 })).toThrow("Formato");
  });
  it("valida assinatura real do arquivo", () => {
    expect(() => validateVisualBytes(new TextEncoder().encode("%PDF-1.4"), "application/pdf")).not.toThrow();
    expect(() => validateVisualBytes(new TextEncoder().encode("texto"), "image/png")).toThrow("conteúdo");
  });
  it("não inventa campos ausentes ou datas ambíguas", () => {
    const doc = normalizeInvoice({ ...input, data: "2026-02-30", total: null, itens: [{ ...input.itens[0], descricao: null, codigo: null, quantidade: null, unidade: null, valor_unitario: null, valor_total: null, desconto: null, duvidas: [] }] }, ingredients);
    expect(doc.data).toBe(""); expect(doc.total).toBeNull(); expect(doc.linhas[0]?.quantidade).toBeNull(); expect(doc.linhas[0]?.total).toBeNull(); expect(reviewDocument(doc, ingredients).errors.length).toBeGreaterThan(0);
  });
  it("associa apenas nome exato normalizado e dimensão compatível únicos", () => {
    expect(safeIngredientMatch("acucar", "g", ingredients)).toBe("sugar");
    expect(safeIngredientMatch("Açúcar refinado", "kg", ingredients)).toBe("");
    expect(safeIngredientMatch("Açúcar", "L", ingredients)).toBe("");
    expect(safeIngredientMatch("Açúcar", "kg", [...ingredients, { id: "other", nome: "Açúcar", unidade: "kg" }])).toBe("");
  });
  it("preserva desconto e total líquido sem arredondar intermediários", () => {
    const doc = normalizeInvoice(input, ingredients); const review = reviewDocument(doc, ingredients);
    expect(review.sum).toBe(18); expect(review.divergence).toBe(false); expect(review.itemDivergences).toHaveLength(0);
    expect(normalizeInvoice({ ...input, itens: [{ ...input.itens[0], descricao: "Açúcar", codigo: null, quantidade: 1.234567, unidade: "kg", valor_unitario: 3.456789, valor_total: 4.267640625363, desconto: 0, duvidas: [] }] }, ingredients).linhas[0]?.quantidade).toBe(1.234567);
  });
  it("avisa divergência e exclui itens ignorados da compra", () => {
    const doc = normalizeInvoice({ ...input, total: 20 }, ingredients);
    expect(reviewDocument(doc, ingredients).divergence).toBe(true);
    const line = doc.linhas[0]; if (!line) throw new Error("Missing fixture"); line.ignorar = true;
    expect(reviewDocument(doc, ingredients).sum).toBe(0); expect(reviewDocument(doc, ingredients).errors).toContain("Selecione pelo menos um item.");
  });
  it("bloqueia vínculo com unidade incompatível e exige seleção explícita para novo cadastro", () => {
    const doc = normalizeInvoice(input, ingredients); const line = doc.linhas[0]; if (!line) throw new Error("Missing fixture");
    line.unidade = "L"; expect(reviewDocument(doc, ingredients).errors.some((e) => e.includes("incompatível"))).toBe(true);
    line.insumoId = ""; expect(reviewDocument(doc, ingredients).errors.length).toBeGreaterThan(0);
    line.insumoId = "__novo__"; expect(reviewDocument(doc, ingredients).errors).toHaveLength(0);
  });
  it("sinaliza compra existente de mesmo fornecedor/data/valor", () => {
    expect(possibleDuplicate(normalizeInvoice(input, ingredients), [{ id: "purchase", data_compra: "2026-10-17", local_compra: "loja", total: 18, cancelada_em: null }])?.id).toBe("purchase");
  });
  it("mantém XML NF-e com namespace, desconto e vínculo existentes", () => {
    const doc = parseInvoiceXml('<nfeProc xmlns="http://www.portalfiscal.inf.br/nfe"><NFe><infNFe Id="NFe123"><ide><nNF>7</nNF><dhEmi>2026-10-17T10:00:00-03:00</dhEmi></ide><emit><xNome>Loja</xNome></emit><det><prod><cProd>1</cProd><xProd>Açúcar</xProd><qCom>2</qCom><uCom>kg</uCom><vUnCom>10</vUnCom><vProd>20</vProd><vDesc>2</vDesc></prod></det><total><ICMSTot><vNF>18</vNF><vDesc>2</vDesc></ICMSTot></total></infNFe></NFe></nfeProc>', ingredients);
    expect(doc.numero).toBe("7"); expect(doc.chave).toBe("123"); expect(doc.linhas[0]?.insumoId).toBe("sugar"); expect(doc.linhas[0]?.total).toBe(18); expect(reviewDocument(doc, ingredients).errors).toHaveLength(0);
  });
  it("rejeita XML inválido ou sem produtos", () => {
    expect(() => parseInvoiceXml("<nfe>", ingredients)).toThrow("válido");
    expect(() => parseInvoiceXml("<nfe/>", ingredients)).toThrow("produtos");
  });
});