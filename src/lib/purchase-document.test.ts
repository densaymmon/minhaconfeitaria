import { describe, expect, it } from "vitest";
import { parseOcrText } from "./purchase-document-ocr";
import { DOCUMENT_MAX_BYTES, lembrarVinculos, normalizeInvoice, palavrasDoNome, sugerirInsumo, sugerirVinculos, parseInvoiceXml, possibleDuplicate, reviewDocument, safeIngredientMatch, validateDocumentFile, validateVisualBytes, type InvoiceExtraction } from "./purchase-document";

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

  it("extrai fornecedor, total e linhas de produto do texto de uma DANFE", () => {
    const doc = normalizeInvoice(parseOcrText([
      "TENDA ATACADO SA DANFE",
      "HORTOLANDIA - SP",
      "DATA DA EMISSÃO 15.10.2026",
      "VALOR TOTAL DA NOTA 487,29",
      "DADOS DO PRODUTO/SERVIÇO",
      "966092 ACUCAR REF SELECT 1KG 17019900 020 5102 UN001UN 5 2,79 0,00 13,95 5,43 0,98 18.00 0.00",
      "262510 LEITE INTEGRAL LIDER 1L 04012010 060 5405 LT001LT 12 4,89 0,00 58,68 0,00 0,00 0.00 0.00",
    ].join("\n")), ingredients);
    expect(doc.fornecedor).toBe("TENDA ATACADO SA");
    expect(doc.data).toBe("2026-10-15");
    expect(doc.total).toBe(487.29);
    expect(doc.linhas).toHaveLength(2);
    expect(doc.linhas[0]?.nome).toContain("ACUCAR REF SELECT 1KG");
    expect(doc.linhas[0]?.quantidade).toBe(5);
    expect(doc.linhas[0]?.unitario).toBe(2.79);
    expect(doc.linhas[0]?.total).toBe(13.95);
    expect(doc.linhas[1]?.total).toBe(58.68);
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
describe("vínculo dos itens com os insumos", () => {
  const cadastro = [
    { id: "condensado", nome: "Leite condensado", unidade: "g", unidade_embalagem: "g" },
    { id: "leite", nome: "Leite integral", unidade: "L", unidade_embalagem: "L" },
    { id: "choc", nome: "Chocolate ao leite", unidade: "kg", unidade_embalagem: "kg" },
    { id: "granulado", nome: "Chocolate granulado", unidade: "kg", unidade_embalagem: "kg" },
    { id: "ovos", nome: "Ovos", unidade: "un" },
  ];

  it("separa as palavras que identificam o produto", () => {
    expect(palavrasDoNome("LEITE CONDENSADO INTEGRAL 395G")).toEqual(["leite", "condensado", "integral"]);
    expect(palavrasDoNome("Ovos brancos cx 30 un")).toEqual(["ovo", "branco"]);
  });

  it("sugere o insumo cujo nome aparece inteiro na descrição e tem unidade compatível", () => {
    expect(sugerirInsumo("LEITE CONDENSADO INTEGRAL 395G", "g", cadastro)?.id).toBe("condensado");
    expect(sugerirInsumo("LEITE INTEGRAL 1L", "L", cadastro)?.id).toBe("leite");
    expect(sugerirInsumo("CHOCOLATE AO LEITE BARRA", "kg", cadastro)?.id).toBe("choc");
    expect(sugerirInsumo("OVOS BRANCOS GRANDES", "un", cadastro)?.id).toBe("ovos");
  });

  it("não sugere com unidade incompatível, sem unidade ou com empate", () => {
    expect(sugerirInsumo("LEITE CONDENSADO 395G", "L", cadastro)).toBeNull();
    expect(sugerirInsumo("LEITE CONDENSADO 395G", "", cadastro)).toBeNull();
    expect(sugerirInsumo("CHOCOLATE GRANULADO AO LEITE", "kg", cadastro)).toBeNull();
    expect(sugerirInsumo("QUEIJO MUSSARELA", "kg", cadastro)).toBeNull();
  });

  it("usa primeiro o vínculo lembrado e marca a sugestão por nome para conferência", () => {
    const doc = normalizeInvoice({ ...input, itens: [
      { descricao: "CHOCOLATE GRANULADO AO LEITE", codigo: null, quantidade: 1, unidade: "kg", valor_unitario: null, valor_total: 30, desconto: null, duvidas: [] },
      { descricao: "LEITE INTEGRAL 1L", codigo: null, quantidade: 6, unidade: "L", valor_unitario: null, valor_total: 29.34, desconto: null, duvidas: [] },
    ] }, cadastro);
    const memoria = lembrarVinculos({}, [{ nome: "Chocolate granulado ao leite", insumoId: "granulado" }]);
    const sugerido = sugerirVinculos(doc, cadastro, memoria);
    expect(sugerido.linhas.map((l) => l.insumoId)).toEqual(["granulado", "leite"]);
    expect(sugerido.linhas[0]?.duvidas.some((d) => d.includes("sugerido"))).toBe(false);
    expect(sugerido.linhas[1]?.duvidas.some((d) => d.includes("Leite integral"))).toBe(true);
    // Vínculo lembrado com unidade que não bate é ignorado.
    expect(sugerirVinculos(doc, cadastro, { "chocolate granulado ao leite": "leite" }).linhas[0]?.insumoId).toBe("");
  });

  it("guarda até 500 vínculos, os mais recentes, sem novos cadastros pendentes", () => {
    let memoria: Record<string, string> = {};
    for (let i = 0; i < 510; i++) memoria = lembrarVinculos(memoria, [{ nome: `Produto ${i}`, insumoId: `i${i}` }]);
    expect(Object.keys(memoria)).toHaveLength(500);
    expect(memoria["produto 509"]).toBe("i509");
    expect(memoria["produto 0"]).toBeUndefined();
    expect(lembrarVinculos({}, [{ nome: "Novo", insumoId: "__novo__" }])).toEqual({});
  });
});
