import { describe, expect, it } from "vitest";
import {
  contaAtiva,
  contaEmAberto,
  contaVencida,
  resumoContas,
  saldoConta,
  somaSaldos,
  totalPagoContas,
  type ContaFinanceira,
} from "./financeiro";

const HOJE = "2026-10-29";

function conta(parcial: Partial<ContaFinanceira> = {}): ContaFinanceira {
  return { valor: 100, valor_pago: 0, status: "pendente", cancelada_em: null, data_vencimento: "2026-11-10", ...parcial };
}

describe("saldoConta", () => {
  it("é valor menos valor pago, nunca negativo", () => {
    expect(saldoConta({ valor: 100, valor_pago: 30 })).toBe(70);
    expect(saldoConta({ valor: 100, valor_pago: 100 })).toBe(0);
    expect(saldoConta({ valor: 50, valor_pago: 80 })).toBe(0);
  });

  it("aceita números em texto e ignora valores inválidos", () => {
    expect(saldoConta({ valor: "444.33", valor_pago: "0" })).toBe(444.33);
    expect(saldoConta({ valor: null, valor_pago: undefined })).toBe(0);
  });

  it("arredonda a centavos sem ruído de ponto flutuante", () => {
    expect(saldoConta({ valor: 0.3, valor_pago: 0.1 })).toBe(0.2);
  });
});

describe("estado da conta", () => {
  it("conta cancelada não é ativa, por status ou por data de cancelamento", () => {
    expect(contaAtiva(conta())).toBe(true);
    expect(contaAtiva(conta({ status: "cancelado" }))).toBe(false);
    expect(contaAtiva(conta({ cancelada_em: "2026-10-20T10:00:00Z" }))).toBe(false);
  });

  it("só pendente e parcial estão em aberto", () => {
    expect(contaEmAberto(conta({ status: "pendente" }))).toBe(true);
    expect(contaEmAberto(conta({ status: "parcial", valor_pago: 40 }))).toBe(true);
    expect(contaEmAberto(conta({ status: "pago", valor_pago: 100 }))).toBe(false);
    expect(contaEmAberto(conta({ status: "cancelado" }))).toBe(false);
    expect(contaEmAberto(conta({ cancelada_em: "2026-10-20T10:00:00Z" }))).toBe(false);
  });

  it("vence hoje ainda não é vencida; vencida só com data anterior", () => {
    expect(contaVencida(conta({ data_vencimento: HOJE }), HOJE)).toBe(false);
    expect(contaVencida(conta({ data_vencimento: "2026-10-28" }), HOJE)).toBe(true);
    expect(contaVencida(conta({ data_vencimento: "2026-10-01", status: "pago", valor_pago: 100 }), HOJE)).toBe(false);
  });
});

describe("resumoContas", () => {
  const contas: ContaFinanceira[] = [
    conta({ valor: 100, data_vencimento: "2026-10-20" }), // vencida
    conta({ valor: 200, valor_pago: 50, status: "parcial", data_vencimento: "2026-10-25" }), // vencida, saldo 150
    conta({ valor: 300, data_vencimento: "2026-11-15" }), // a vencer
    conta({ valor: 80, valor_pago: 80, status: "pago", data_vencimento: "2026-10-10" }),
    conta({ valor: 999, status: "cancelado", cancelada_em: "2026-10-01T00:00:00Z", data_vencimento: "2026-10-01" }),
  ];

  it("separa aberto, vencido e pago ignorando contas canceladas", () => {
    expect(resumoContas(contas, HOJE)).toEqual({ aberto: 550, vencido: 250, pago: 130 });
  });

  it("lista vazia dá zero", () => {
    expect(resumoContas([], HOJE)).toEqual({ aberto: 0, vencido: 0, pago: 0 });
  });

  it("somaSaldos e totalPagoContas são consistentes com o resumo", () => {
    expect(somaSaldos(contas.filter(contaEmAberto))).toBe(550);
    expect(totalPagoContas(contas)).toBe(130);
  });

  it("conta paga e depois estornada volta a ter saldo (valor_pago já é líquido)", () => {
    const estornada = conta({ valor: 468.3, valor_pago: 0, status: "pendente" });
    expect(resumoContas([estornada], HOJE).aberto).toBe(468.3);
    expect(resumoContas([estornada], HOJE).pago).toBe(0);
  });
});
