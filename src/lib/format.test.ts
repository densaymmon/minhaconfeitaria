import { describe, expect, it } from "vitest";
import { brl, dataBR, formaLabel, num, parseNum, pct, statusLabel } from "./format";

// O Intl usa espaço não separável entre "R$" e o valor; normaliza para comparar.
const semNbsp = (s: string) => s.replace(/\s/g, " ");

describe("moeda e números", () => {
  it("formata reais no padrão brasileiro", () => {
    expect(semNbsp(brl(1234.5))).toBe("R$ 1.234,50");
    expect(semNbsp(brl(0))).toBe("R$ 0,00");
    expect(semNbsp(brl(15.4110))).toBe("R$ 15,41");
  });

  it("valor inválido vira zero em vez de NaN na tela", () => {
    expect(semNbsp(brl(Number.NaN))).toBe("R$ 0,00");
    expect(semNbsp(brl(Number.POSITIVE_INFINITY))).toBe("R$ 0,00");
    expect(num(Number.NaN)).toBe("0");
  });

  it("num e pct usam vírgula decimal e limitam as casas", () => {
    expect(num(1234.567)).toBe("1.234,57");
    expect(num(2.5, 0)).toBe("3");
    expect(pct(12.34)).toBe("12,3%");
  });
});

describe("parseNum (campos digitados)", () => {
  it("aceita vírgula ou ponto decimal", () => {
    expect(parseNum("12,50")).toBe(12.5);
    expect(parseNum("12.50")).toBe(12.5);
    expect(parseNum(7)).toBe(7);
  });

  it("com vírgula, o ponto é separador de milhar", () => {
    expect(parseNum("1.234,56")).toBe(1234.56);
  });

  it("sem vírgula o ponto é decimal (1.234 vale 1,234)", () => {
    expect(parseNum("1.234")).toBe(1.234);
  });

  it("texto vazio ou inválido vira zero", () => {
    expect(parseNum("")).toBe(0);
    expect(parseNum("abc")).toBe(0);
    expect(parseNum("R$ 10")).toBe(0);
  });
});

describe("rótulos", () => {
  it("status persistidos têm rótulo em português", () => {
    expect(statusLabel("recebido")).toBe("Recebido");
    expect(statusLabel("em_producao")).toBe("Em produção");
    expect(statusLabel("pronto")).toBe("Pronto");
    expect(statusLabel("entregue")).toBe("Entregue");
    expect(statusLabel("cancelado")).toBe("Cancelado");
  });

  it("finalizado aparece como Entregue e confirmado como Recebido", () => {
    expect(statusLabel("finalizado")).toBe("Entregue");
    expect(statusLabel("confirmado")).toBe("Recebido");
  });

  it("status desconhecido é mostrado como veio", () => {
    expect(statusLabel("outro")).toBe("outro");
  });

  it("formas de pagamento", () => {
    expect(formaLabel("pix")).toBe("Pix");
    expect(formaLabel("debito")).toBe("Cartão de débito");
    expect(formaLabel("desconhecida")).toBe("desconhecida");
  });
});

describe("datas", () => {
  it("dataBR não muda o dia por causa do fuso", () => {
    expect(dataBR("2026-10-29")).toBe("29/10/2026");
    expect(dataBR("2026-01-01")).toBe("01/01/2026");
  });
});
