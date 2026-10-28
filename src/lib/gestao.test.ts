import { describe, expect, it } from "vitest";
import { agendaDaSemana, entregasDoDia, etiquetasDoDia, fluxoDeCaixa, linkMapa, linkRota, listaDeCompras, mensagemSaiuParaEntrega, progressoMeta, semanaDe, textoListaCompras } from "./gestao";

describe("agenda da semana", () => {
  it("vai de segunda a domingo", () => {
    expect(semanaDe("2026-10-28")).toEqual(["2026-10-26", "2026-10-27", "2026-10-28", "2026-10-29", "2026-10-30", "2026-10-31", "2026-11-01"]);
    expect(semanaDe("2026-11-01")[0]).toBe("2026-10-26"); // domingo fica na semana anterior
    expect(semanaDe("2026-10-26")[0]).toBe("2026-10-26");
  });
  it("agrupa pedidos, itens e pendências por dia", () => {
    const pedidos = [
      { id: "1", data_entrega: "2026-10-27", status: "recebido", pedido_itens: [{ quantidade: 2, quantidade_produzida: 1 }] },
      { id: "2", data_entrega: "2026-10-27", status: "cancelado", pedido_itens: [{ quantidade: 5 }] },
      { id: "3", data_entrega: "2026-10-27", status: "confirmado", pedido_itens: [{ quantidade: 3 }] },
    ];
    const [seg, ter] = agendaDaSemana(pedidos, semanaDe("2026-10-28"), 2);
    expect(seg?.pedidos.length).toBe(0);
    expect(ter?.pedidos.map((p) => p.id)).toEqual(["1", "3"]);
    expect([ter?.itens, ter?.pendente, ter?.cheio]).toEqual([5, 4, true]);
  });
});

describe("lista de compras", () => {
  const necessidades = [
    { insumo_id: "f", nome: "Farinha", unidade: "g" as const, necessario: 2500, estoque: 1000, falta: 1500 },
    { insumo_id: "o", nome: "Ovos", unidade: "un" as const, necessario: 30, estoque: 40, falta: 0 },
    { insumo_id: "c", nome: "Chocolate", unidade: "g" as const, necessario: 300, estoque: null, falta: 0 },
  ];
  const insumos = [
    { id: "f", nome: "Farinha", preco_embalagem: 6.5, quantidade_embalagem: 1, unidade_embalagem: "kg" },
    { id: "c", nome: "Chocolate", preco_embalagem: 12, quantidade_embalagem: 200, unidade_embalagem: "g" },
  ];
  it("arredonda para embalagens e estima o custo", () => {
    expect(listaDeCompras(necessidades, insumos)).toEqual([
      { insumo_id: "f", nome: "Farinha", unidade: "g", falta: 1500, embalagens: 2, embalagem: "1 kg", custo: 13 },
    ]);
    const tudo = listaDeCompras(necessidades, insumos, "tudo");
    expect(tudo.map((i) => [i.nome, i.embalagens, i.custo])).toEqual([["Chocolate", 2, 24], ["Farinha", 2, 13]]);
    expect(textoListaCompras(tudo, "28/10 a 03/11")).toContain("• Farinha: 1,5 kg → 2× 1 kg");
    expect(textoListaCompras(tudo, "x")).toContain("Estimativa: R$");
  });
});

describe("entregas do dia", () => {
  it("ordena por horário e monta links", () => {
    const pedidos = [
      { id: "a", data_entrega: "2026-10-28", status: "pronto", tipo_entrega: "entrega", hora_entrega: "15:00" },
      { id: "b", data_entrega: "2026-10-28", status: "pronto", tipo_entrega: "entrega", hora_entrega: null },
      { id: "c", data_entrega: "2026-10-28", status: "confirmado", tipo_entrega: "entrega", hora_entrega: "09:30" },
      { id: "d", data_entrega: "2026-10-28", status: "entregue", tipo_entrega: "entrega", hora_entrega: "08:00" },
      { id: "e", data_entrega: "2026-10-28", status: "pronto", tipo_entrega: "retirada", hora_entrega: "08:00" },
    ];
    expect(entregasDoDia(pedidos, "2026-10-28").map((p) => p.id)).toEqual(["c", "a", "b"]);
    expect(linkMapa("Rua A, 10", "Sumaré")).toBe("https://www.google.com/maps/search/?api=1&query=Rua%20A%2C%2010%2C%20Sumar%C3%A9");
    expect(linkRota(["Rua A, 1", "Rua B, 2"])).toBe("https://www.google.com/maps/dir/?api=1&travelmode=driving&destination=Rua%20B%2C%202&waypoints=Rua%20A%2C%201");
    expect(linkRota([])).toBeNull();
    expect(mensagemSaiuParaEntrega({ cliente: "Ana Souza", numero: 12, loja: "Doces", falta: 30 })).toContain("Olá, Ana! Seu pedido #12 da Doces saiu para entrega");
  });
});

describe("fluxo de caixa", () => {
  it("soma por semana com atrasados na primeira e saldo acumulado", () => {
    const semanas = fluxoDeCaixa(
      [{ data: "2026-10-20", valor: 50 }, { data: "2026-10-29", valor: 100 }, { data: "2026-11-04", valor: 200 }],
      [{ data: "2026-10-30", valor: 30 }, { data: "2026-11-02", valor: 500 }],
      "2026-10-28", 3,
    );
    expect(semanas.map((s) => [s.rotulo, s.entradas, s.saidas, s.saldo, s.acumulado])).toEqual([
      ["Esta semana", 150, 30, 120, 120],
      ["02/11 a 08/11", 200, 500, -300, -180],
      ["09/11 a 15/11", 0, 0, 0, -180],
    ]);
  });
});

describe("meta do mês", () => {
  it("calcula percentual, projeção e ritmo necessário", () => {
    expect(progressoMeta(3000, 6000, "2026-10-10")).toEqual({ pct: 50, falta: 3000, projecao: 9300, porDia: 136.36, diasRestantes: 22, batida: false });
    expect(progressoMeta(7000, 6000, "2026-10-31").batida).toBe(true);
    expect(progressoMeta(100, 0, "2026-10-31").pct).toBe(0);
  });
});

describe("etiquetas", () => {
  it("uma por unidade, com validade, ingredientes e alergênicos (inclusive de kits)", () => {
    const produtos = [
      { id: "bolo", nome: "Bolo", validade_dias: 3, receita_itens: [{ insumo_id: "farinha" }, { insumo_id: "leite" }, { insumo_id: "caixa" }] },
      { id: "kit", nome: "Kit", validade_dias: 2, receita_itens: [], componentes: [{ produto_id: "bolo", quantidade: 1 }] },
    ];
    const insumos = [
      { id: "farinha", nome: "Farinha de trigo", alergenos: "Glúten" },
      { id: "leite", nome: "Leite", alergenos: "leite; lactose" },
      { id: "caixa", nome: "Caixa", tipo: "embalagem" },
    ];
    const pedidos = [
      { id: "p1", numero: 7, data_entrega: "2026-10-28", status: "pronto", clientes: { nome: "Ana" }, pedido_itens: [{ produto_id: "bolo", descricao: "Bolo (G)", quantidade: 2 }, { produto_id: "kit", descricao: "Kit", quantidade: 1 }, { produto_id: null, descricao: "Avulso", quantidade: 1 }] },
      { id: "p2", numero: 8, data_entrega: "2026-10-28", status: "cancelado", clientes: null, pedido_itens: [{ produto_id: "bolo", descricao: "Bolo", quantidade: 5 }] },
    ];
    const e = etiquetasDoDia(pedidos, produtos, insumos, "2026-10-28", "2026-10-27");
    expect(e.length).toBe(4);
    expect(e[0]).toMatchObject({ cliente: "Ana", numero: 7, descricao: "Bolo (G)", validade: "2026-10-30", ingredientes: ["Farinha de trigo", "Leite"], alergenos: ["glúten", "lactose", "leite"] });
    expect(e[2]?.validade).toBe("2026-10-29");
    expect(e[2]?.ingredientes).toEqual(["Farinha de trigo", "Leite"]);
    expect(e[3]).toMatchObject({ descricao: "Avulso", validade: null, ingredientes: [] });
  });
});
