import { describe, expect, it } from "vitest";
import { crc16, normalizarChavePix, pixCopiaECola } from "./pix";

describe("Pix copia e cola", () => {
  it("reproduz o exemplo do manual do BR Code do Banco Central", () => {
    expect(pixCopiaECola({ chave: "123e4567-e12b-12d1-a456-426655440000", nome: "Fulano de Tal", cidade: "BRASILIA" }))
      .toBe("00020126580014br.gov.bcb.pix0136123e4567-e12b-12d1-a456-4266554400005204000053039865802BR5913Fulano de Tal6008BRASILIA62070503***63041D3D");
  });
  it("calcula o CRC16 de verificação", () => {
    expect(crc16("123456789")).toBe("29B1");
  });
  it("inclui valor, identificador do pedido e remove acentos do nome e da cidade", () => {
    const codigo = pixCopiaECola({ chave: "pix@casaldobolo.com", nome: "O Casal do Bolo — Confeitaria Artesanal", cidade: "Hortolândia", valor: 60, identificador: "PEDIDO-44" });
    expect(codigo).toContain("0119pix@casaldobolo.com");
    expect(codigo).toContain("540560.00");
    expect(codigo).toContain("5925O Casal do Bolo Confeita");
    expect(codigo).toContain("6011Hortolandia");
    expect(codigo).toContain("62120508PEDIDO44");
    expect(codigo?.slice(-8, -4)).toBe("6304");
    expect(codigo?.slice(-4)).toBe(crc16(codigo!.slice(0, -4)));
  });
  it("não gera código sem chave válida", () => {
    expect(pixCopiaECola({ chave: "", nome: "X" })).toBeNull();
    expect(pixCopiaECola({ chave: "abc", nome: "X" })).toBeNull();
  });
});

describe("tipo da chave Pix", () => {
  it("reconhece e-mail, chave aleatória, CPF, CNPJ e celular", () => {
    expect(normalizarChavePix("Pix@Loja.com")).toEqual({ tipo: "email", valor: "pix@loja.com" });
    expect(normalizarChavePix("123E4567-E12B-12D1-A456-426655440000")?.tipo).toBe("aleatoria");
    expect(normalizarChavePix("529.982.247-25")).toEqual({ tipo: "cpf", valor: "52998224725" });
    expect(normalizarChavePix("52998224725")).toEqual({ tipo: "cpf", valor: "52998224725" });
    expect(normalizarChavePix("11.222.333/0001-81")).toEqual({ tipo: "cnpj", valor: "11222333000181" });
    expect(normalizarChavePix("(19) 99283-1019")).toEqual({ tipo: "telefone", valor: "+5519992831019" });
    expect(normalizarChavePix("+55 19 99283-1019")).toEqual({ tipo: "telefone", valor: "+5519992831019" });
    // Onze dígitos que não formam um CPF válido são tratados como celular.
    expect(normalizarChavePix("19992831019")).toEqual({ tipo: "telefone", valor: "+5519992831019" });
  });
  it("respeita o tipo escolhido nas configurações", () => {
    expect(normalizarChavePix("52998224725", "telefone")).toEqual({ tipo: "telefone", valor: "+5552998224725" });
    expect(normalizarChavePix("19992831019", "cpf")).toEqual({ tipo: "cpf", valor: "19992831019" });
    expect(normalizarChavePix("123", "cpf")).toBeNull();
    expect(pixCopiaECola({ chave: "52998224725", tipoChave: "telefone", nome: "X" })).toContain("0114+5552998224725");
  });
});
