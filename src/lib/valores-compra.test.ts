import { describe, expect, it } from "vitest";
import {
  formatarValorMonetario,
  numeroCompra,
  textoCampoNumerico,
  valorExistenteEmCentavos,
  valorMonetarioEmCentavos,
  valorTotalEditavel,
} from "./valores-compra";

describe("numeroCompra", () => {
  it("aceita vírgula ou ponto como decimal", () => {
    expect(numeroCompra("1,5")).toBe(1.5);
    expect(numeroCompra("2.25")).toBe(2.25);
    expect(numeroCompra(" 10 ")).toBe(10);
  });

  it("entende ponto com três dígitos finais como milhar (1.800 ml)", () => {
    expect(numeroCompra("1.800")).toBe(1800);
    expect(numeroCompra("1.234.567")).toBe(1234567);
  });

  it("com ponto e vírgula juntos, o último é o decimal", () => {
    expect(numeroCompra("1.234,56")).toBe(1234.56);
    expect(numeroCompra("1,234.56")).toBe(1234.56);
  });

  it("estados de digitação e textos inválidos viram NaN", () => {
    for (const texto of ["", "2,", "2.", ",", "abc", "1,2,3", "1.234,"]) expect(numeroCompra(texto)).toBeNaN();
  });
});

describe("valores monetários em centavos", () => {
  it("formata os dígitos digitados como reais", () => {
    expect(formatarValorMonetario("12345")).toBe("123,45");
    expect(formatarValorMonetario("5")).toBe("0,05");
    expect(formatarValorMonetario("")).toBe("");
  });

  it("converte o texto da máscara de volta para reais", () => {
    expect(valorMonetarioEmCentavos("123,45")).toBe(123.45);
    expect(valorMonetarioEmCentavos("")).toBeNaN();
  });

  it("converte um valor salvo em reais para o estado em centavos", () => {
    expect(valorExistenteEmCentavos("12.3")).toBe("1230");
    expect(valorExistenteEmCentavos("0.1")).toBe("10");
    expect(valorExistenteEmCentavos("-1")).toBe("");
    expect(valorExistenteEmCentavos("x")).toBe("");
  });
});

describe("campos vindos do banco", () => {
  it("nunca mostra NaN ou Infinity no campo", () => {
    expect(textoCampoNumerico(3)).toBe("3");
    expect(textoCampoNumerico(Number.NaN)).toBe("");
    expect(textoCampoNumerico(" NaN ")).toBe("");
    expect(textoCampoNumerico(null)).toBe("");
    expect(textoCampoNumerico(" 2,5 ")).toBe("2,5");
  });

  it("usa o total salvo ou calcula preço × quantidade", () => {
    expect(valorTotalEditavel({ total: 30, preco_unitario: 10, quantidade: 2 })).toBe("30");
    expect(valorTotalEditavel({ total: "abc", preco_unitario: "10", quantidade: "2" })).toBe("20");
    expect(valorTotalEditavel({ total: "abc", preco_unitario: null, quantidade: "x" })).toBe("");
  });
});
