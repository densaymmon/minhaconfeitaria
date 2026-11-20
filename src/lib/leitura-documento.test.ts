import { describe, expect, it } from "vitest";
import {
  chaveDeAcesso,
  conteudoDaEmbalagem,
  itensDaConsultaNfce,
  itensDaDanfeEmTexto,
  itensDaTabelaDanfe,
  itensDoCupom,
  lerCabecalho,
  lerDocumento,
  linhasDaPagina,
  montarItem,
  numeroBr,
  unidadeDoDocumento,
  type LinhaPdf,
} from "./leitura-documento";

const CHAVE_VALIDA = "3526 1112 3456 7800 0190 5500 1000 0123 4510 0001 2344";

describe("números, chave e unidades", () => {
  it("lê números no formato brasileiro", () => {
    expect(numeroBr("1.234,56")).toBe(1234.56);
    expect(numeroBr("4,0000")).toBe(4);
    expect(numeroBr("0,512")).toBe(0.512);
    expect(numeroBr("R$ 70,00")).toBe(70);
    expect(numeroBr("abc")).toBeNull();
    expect(numeroBr("")).toBeNull();
  });

  it("aceita só chave de acesso com dígito verificador certo e tira dela o número da nota", () => {
    expect(chaveDeAcesso(`Chave: ${CHAVE_VALIDA}`)).toBe(CHAVE_VALIDA.replace(/\s/g, ""));
    expect(chaveDeAcesso(CHAVE_VALIDA.replace(/4$/, "5"))).toBeNull();
    expect(lerCabecalho([`CHAVE DE ACESSO ${CHAVE_VALIDA}`]).documento).toBe("12345");
  });

  it("traduz as unidades do documento", () => {
    expect(unidadeDoDocumento("UN001UN")).toEqual({ unidade: "un", contagem: true, duzia: false });
    expect(unidadeDoDocumento("LT001LT").unidade).toBe("L");
    expect(unidadeDoDocumento("KG").contagem).toBe(false);
    expect(unidadeDoDocumento("DZ").duzia).toBe(true);
    expect(unidadeDoDocumento("??").unidade).toBeNull();
  });
});

describe("embalagem", () => {
  it("lê o conteúdo da embalagem na descrição", () => {
    expect(conteudoDaEmbalagem("LEITE CONDENSADO 395G")).toEqual({ quantidade: 395, unidade: "g" });
    expect(conteudoDaEmbalagem("CHOCOLATE BARRA 1,01KG")).toEqual({ quantidade: 1.01, unidade: "kg" });
    expect(conteudoDaEmbalagem("LEITE CX 12X1L")).toEqual({ quantidade: 12, unidade: "L" });
    expect(conteudoDaEmbalagem("OVOS CARTELA COM 30 UNIDADES")).toEqual({ quantidade: 30, unidade: "un" });
    expect(conteudoDaEmbalagem("FARINHA TIPO 1")).toBeNull();
  });

  it("converte unidades de contagem para a medida real, mantendo a conta do item", () => {
    const item = montarItem({ descricao: "LEITE CONDENSADO 395G", codigo: null, quantidade: 24, unidadeBruta: "UN", unitario: 5.49, total: 131.76, desconto: 0 }, "origem");
    expect(item.quantidade).toBe(9480);
    expect(item.unidade).toBe("g");
    expect((item.quantidade ?? 0) * (item.valor_unitario ?? 0)).toBeCloseTo(131.76, 2);
    expect(item.duvidas.join(" ")).toContain("24 × 395 g");
    // Peso já em kg não é convertido; dúzia vira 12 unidades.
    expect(montarItem({ descricao: "QUEIJO 1KG", codigo: null, quantidade: 0.512, unidadeBruta: "KG", unitario: 42.9, total: 21.96, desconto: null }, "o").quantidade).toBe(0.512);
    expect(montarItem({ descricao: "OVOS", codigo: null, quantidade: 2, unidadeBruta: "DZ", unitario: 10, total: 20, desconto: null }, "o").quantidade).toBe(24);
  });
});

describe("itens", () => {
  it("DANFE em texto: aceita desconto antes ou depois do total, pela conta quantidade × unitário", () => {
    const itens = itensDaDanfeEmTexto([
      "966092 ACUCAR REF SELECT 1KG 17019900 020 5102 UN001UN 5 2,79 0,00 13,95 5,43 0,98 18.00 0.00",
      "5050 CHOCOLATE AO LEITE 1,01KG 18063210 0102 5102 UN 1,0000 29,9000 29,90 2,00 0,00 0,00",
      "4040 MANTEIGA 500G 04051000 0102 5102 UN 2,0000 18,9000 35,80 2,00 0,00",
    ]);
    expect(itens.map((i) => [i.valor_total, i.desconto])).toEqual([[13.95, 0], [29.9, 0], [35.8, 2]]);
    expect(itens[0]?.quantidade).toBe(5);
    expect(itens[0]?.unidade).toBe("kg");
  });

  it("DANFE com posições: usa as colunas do cabeçalho, desconto à parte e descrição em duas linhas", () => {
    const p = (texto: string, x: number, largura = 20) => ({ texto, x, largura });
    const linhas: LinhaPdf[] = [
      { y: 500, partes: [p("CÓDIGO", 20), p("DESCRIÇÃO DO PRODUTO", 60, 80), p("NCM/SH", 200), p("UN", 285, 8), p("QUANT", 305), p("VALOR UNIT", 340), p("VALOR TOTAL", 380), p("V.DESC", 420)] },
      { y: 490, partes: [p("4040", 20), p("MANTEIGA SEM SAL 500G", 60, 70), p("04051000", 200), p("UN", 285, 8), p("2,0000", 305), p("18,9000", 340), p("37,80", 380), p("2,00", 420)] },
      { y: 480, partes: [p("6060", 20), p("OVOS BRANCOS CARTELA", 60, 70), p("04072100", 200), p("CX", 285, 8), p("1,0000", 305), p("3,6600", 340), p("3,66", 380), p("0,00", 420)] },
      { y: 473, partes: [p("COM 30 UNIDADES", 60, 50)] },
      { y: 450, partes: [p("DADOS ADICIONAIS", 20, 60)] },
    ];
    const itens = itensDaTabelaDanfe(linhas);
    expect(itens).toHaveLength(2);
    expect(itens[0]).toMatchObject({ quantidade: 1000, unidade: "g", valor_total: 35.8, desconto: 2 });
    expect(itens[1]).toMatchObject({ descricao: "OVOS BRANCOS CARTELA COM 30 UNIDADES", quantidade: 30, unidade: "un", valor_total: 3.66 });
  });

  it("NFC-e da consulta da SEFAZ e cupom compacto", () => {
    const consulta = itensDaConsultaNfce([
      "AÇÚCAR REFINADO UNIÃO 1KG (Código: 7891910000197 )",
      "Qtde.:3 UN: UN Vl. Unit.: 4,99 Vl. Total 14,97",
      "CHOCOLATE GRANULADO (Código: 2000000000456 )",
      "Qtde.:0,350 UN: KG Vl. Unit.: 39,90 Vl. Total 13,97",
    ]);
    expect(consulta.map((i) => [i.descricao, i.quantidade, i.unidade, i.valor_total])).toEqual([
      ["AÇÚCAR REFINADO UNIÃO 1KG", 3, "kg", 14.97],
      ["CHOCOLATE GRANULADO", 0.35, "kg", 13.97],
    ]);
    const cupom = itensDoCupom([
      "001 7891000100103 LEITE INTEGRAL 1L 6 UN 4,89 29,34",
      "003 2000000000789 QUEIJO MUSSARELA 0,512 KG 42,90 21,96",
      "VALOR A PAGAR R$ 58,28",
    ]);
    expect(cupom.map((i) => [i.quantidade, i.unidade, i.valor_total])).toEqual([[6, "L", 29.34], [0.512, "kg", 21.96]]);
  });
});

describe("cabeçalho e documento", () => {
  it("fornecedor da DANFE sem nome fixo no código, data de emissão e totais nas caixas", () => {
    const p = (texto: string, x: number) => ({ texto, x, largura: 40 });
    const linhas: LinhaPdf[] = [
      { y: 100, partes: [p("VALOR DO FRETE", 20), p("DESCONTO", 240), p("VALOR TOTAL DA NOTA", 460)] },
      { y: 91, partes: [p("15,00", 20), p("4,00", 240), p("340,00", 460)] },
    ];
    const cab = lerCabecalho([
      "RECEBEMOS DE DISTRIBUIDORA DOCE EXEMPLO LTDA OS PRODUTOS E/OU SERVIÇOS CONSTANTES",
      "DATA DA EMISSÃO", "CONFEITARIA DA CLIENTE ME 18/11/2026", "DATA DA SAÍDA/ENTRADA 19/11/2026",
      "VALOR DO FRETE DESCONTO VALOR TOTAL DA NOTA", "15,00 4,00 340,00",
    ], linhas);
    expect(cab).toMatchObject({ fornecedor: "DISTRIBUIDORA DOCE EXEMPLO LTDA", data: "2026-11-18", total: 340, desconto: 4, despesas: 15 });
  });

  it("NFC-e: prefere o valor pago ao total bruto e explica a diferença do desconto geral", () => {
    const doc = lerDocumento([
      "MERCADO BOM PRECO LTDA", "CNPJ: 23.456.789/0001-01",
      "AÇÚCAR 1KG (Código: 1 )", "Qtde.:3 UN: UN Vl. Unit.: 4,99 Vl. Total 14,97",
      "MORANGO 250G (Código: 2 )", "Qtde.:4 UN: UN Vl. Unit.: 7,99 Vl. Total 31,96",
      "Valor total R$: 46,93", "Descontos R$: 0,93", "Valor a pagar R$: 46,00",
      "Número: 456789 Série: 2 Emissão: 19/11/2026 15:32:10",
    ].join("\n"));
    expect(doc).toMatchObject({ fornecedor: "MERCADO BOM PRECO LTDA", data: "2026-11-19", documento: "456789", total: 46, desconto: 0.93 });
    expect(doc.itens.map((i) => [i.quantidade, i.unidade])).toEqual([[3, "kg"], [1000, "g"]]);
    expect(doc.duvidas.some((d) => d.includes("desconto geral"))).toBe(true);
  });

  it("não transforma linhas de total, pagamento ou imposto em item", () => {
    const doc = lerDocumento(["Bolo de pote 2 un x 8,00 16,00", "TOTAL 16,00", "VALOR A PAGAR 16,00", "PIX 16,00", "Tributos aprox 1,20"].join("\n"));
    expect(doc.itens.map((i) => i.descricao)).toEqual(["Bolo de pote"]);
  });

  it("agrupa os fragmentos do PDF em linhas pela altura", () => {
    const linhas = linhasDaPagina([
      { str: "B", transform: [1, 0, 0, 1, 50, 700] },
      { str: "A", transform: [1, 0, 0, 1, 10, 701] },
      { str: "C", transform: [1, 0, 0, 1, 10, 680] },
      { str: " ", transform: [1, 0, 0, 1, 10, 600] },
    ]);
    expect(linhas.map((l) => l.partes.map((p) => p.texto).join(" "))).toEqual(["A B", "C"]);
  });
});
