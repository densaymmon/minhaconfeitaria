import { describe, expect, it } from "vitest";
import { toCSV } from "./csv";

describe("toCSV (compatível com Excel em português)", () => {
  it("usa ponto e vírgula, quebra de linha CRLF e vírgula decimal", () => {
    expect(toCSV(["Item", "Valor"], [["Bolo", 12.5], ["Pão", 3]])).toBe("Item;Valor\r\nBolo;12,5\r\nPão;3");
  });

  it("booleanos viram Sim/Não e vazios ficam em branco", () => {
    expect(toCSV(["a", "b", "c"], [[true, false, null], [undefined, "x", ""]])).toBe("a;b;c\r\nSim;Não;\r\n;x;");
  });

  it("protege campos com separador, aspas e quebra de linha", () => {
    expect(toCSV(["t"], [["a;b"]])).toBe('t\r\n"a;b"');
    expect(toCSV(["t"], [['diz "oi"']])).toBe('t\r\n"diz ""oi"""');
    expect(toCSV(["t"], [["linha1\nlinha2"]])).toBe('t\r\n"linha1\nlinha2"');
  });

  it("neutraliza texto que o Excel interpretaria como fórmula", () => {
    expect(toCSV(["t"], [["=SOMA(A1)"]])).toBe("t\r\n'=SOMA(A1)");
    expect(toCSV(["t"], [["+55 19 99999-0000"]])).toBe("t\r\n'+55 19 99999-0000");
    expect(toCSV(["t"], [["@usuario"]])).toBe("t\r\n'@usuario");
    expect(toCSV(["t"], [["-5 caixas"]])).toBe("t\r\n'-5 caixas");
    expect(toCSV(["t"], [["  =1+1"]])).toBe("t\r\n'  =1+1");
  });

  it("números negativos de verdade não são alterados", () => {
    expect(toCSV(["t"], [[-5]])).toBe("t\r\n-5");
  });
});
