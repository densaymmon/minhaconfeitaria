import { describe, expect, it } from "vitest";
import { deveOferecerRecebimento, escolhasDeStatus, formaPadrao, podeAlterarStatus, saldoParaReceber, statusEquivalente, unidadesPendentes, validarRecebimento } from "./acoes-rapidas-pedido";

const feitos = [{ quantidade: 2, quantidade_produzida: 2 }, { quantidade: "3", quantidade_produzida: "3" }];
const faltando = [{ quantidade: 2, quantidade_produzida: 2 }, { quantidade: 3, quantidade_produzida: 1 }];

describe("status do pedido na lista", () => {
  it("normaliza valores antigos", () => {
    expect(statusEquivalente("confirmado")).toBe("recebido");
    expect(statusEquivalente("finalizado")).toBe("entregue");
    expect(statusEquivalente("pronto")).toBe("pronto");
  });

  it("cancelado não muda pela lista", () => {
    expect(podeAlterarStatus("cancelado")).toBe(false);
    expect(podeAlterarStatus("entregue")).toBe(true);
  });

  it("conta só o que falta produzir e ignora excesso", () => {
    expect(unidadesPendentes(faltando)).toBe(2);
    expect(unidadesPendentes(feitos)).toBe(0);
    expect(unidadesPendentes([{ quantidade: 1, quantidade_produzida: 5 }])).toBe(0);
    expect(unidadesPendentes([])).toBe(0);
  });

  it("marca o status atual e libera tudo quando a produção está completa", () => {
    const r = escolhasDeStatus("em_producao", feitos);
    expect(r.map((e) => [e.valor, e.atual, e.bloqueio])).toEqual([
      ["recebido", false, null], ["em_producao", true, null], ["pronto", false, null], ["entregue", false, null],
    ]);
  });

  it("bloqueia Pronto enquanto houver itens por produzir, como na tela Produção", () => {
    const r = escolhasDeStatus("em_producao", faltando);
    const pronto = r.find((e) => e.valor === "pronto");
    expect(pronto?.bloqueio).toContain("Faltam 2 unidade(s)");
    // As demais opções continuam livres.
    expect(r.filter((e) => e.valor !== "pronto").every((e) => e.bloqueio === null)).toBe(true);
  });

  it("não bloqueia o status em que o pedido já está", () => {
    const r = escolhasDeStatus("pronto", faltando);
    expect(r.find((e) => e.valor === "pronto")).toMatchObject({ atual: true, bloqueio: null });
  });

  it("pedido sem itens pode ir para Pronto", () => {
    expect(escolhasDeStatus("recebido", []).find((e) => e.valor === "pronto")?.bloqueio).toBeNull();
  });

  it("status antigos aparecem como o equivalente", () => {
    expect(escolhasDeStatus("confirmado", feitos).find((e) => e.atual)?.valor).toBe("recebido");
    expect(escolhasDeStatus("finalizado", feitos).find((e) => e.atual)?.valor).toBe("entregue");
  });
});

describe("recebimento rápido", () => {
  const hoje = "2026-10-30";

  it("arredonda o saldo em centavos e zera valores desprezíveis", () => {
    expect(saldoParaReceber(35)).toBe(35);
    expect(saldoParaReceber(12.3456)).toBe(12.35);
    expect(saldoParaReceber(0.004)).toBe(0);
    expect(saldoParaReceber(-5)).toBe(0);
    expect(saldoParaReceber(Number.NaN)).toBe(0);
  });

  it("aceita o saldo inteiro ou um valor parcial", () => {
    expect(validarRecebimento({ valor: 35, saldo: 35, data: hoje, hoje })).toBeNull();
    expect(validarRecebimento({ valor: 10.5, saldo: 35, data: "2026-10-18", hoje })).toBeNull();
  });

  it("recusa valor zero, negativo, inválido ou acima do saldo", () => {
    expect(validarRecebimento({ valor: 0, saldo: 35, data: hoje, hoje })).toMatch(/maior que zero/);
    expect(validarRecebimento({ valor: -1, saldo: 35, data: hoje, hoje })).toMatch(/maior que zero/);
    expect(validarRecebimento({ valor: Number.NaN, saldo: 35, data: hoje, hoje })).toMatch(/maior que zero/);
    expect(validarRecebimento({ valor: 35.01, saldo: 35, data: hoje, hoje })).toMatch(/passar do saldo/);
  });

  it("recusa pedido sem saldo e datas inválidas ou futuras", () => {
    expect(validarRecebimento({ valor: 1, saldo: 0, data: hoje, hoje })).toMatch(/não tem saldo/);
    expect(validarRecebimento({ valor: 1, saldo: 10, data: "", hoje })).toMatch(/data/);
    expect(validarRecebimento({ valor: 1, saldo: 10, data: "2026-10-31", hoje })).toMatch(/futuro/);
  });

  it("oferece o recebimento só ao entregar com saldo", () => {
    expect(deveOferecerRecebimento("entregue", 39)).toBe(true);
    expect(deveOferecerRecebimento("entregue", 0)).toBe(false);
    expect(deveOferecerRecebimento("entregue", 0.004)).toBe(false);
    expect(deveOferecerRecebimento("pronto", 39)).toBe(false);
  });

  it("sugere a forma do pedido quando a tela a oferece", () => {
    expect(formaPadrao("dinheiro")).toBe("dinheiro");
    expect(formaPadrao("credito")).toBe("credito");
    expect(formaPadrao("transferencia")).toBe("pix");
    expect(formaPadrao(null)).toBe("pix");
  });
});
