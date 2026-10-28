import { describe, expect, it } from "vitest";
import { corDoTexto, descontoFidelidade, diaDaSemana, excessoNoLimite, fotosDeReferencia, restanteNoDia, sinalDoPedido, textoComponentes, textoFidelidade, motivoDataIndisponivel, normalizarCupom, normalizarHorarios, proximaDataDisponivel, taxaDeEntrega, validarBairros } from "./catalogo";

describe("agenda do catálogo", () => {
  const cat = { dias_fechados: [0, 1], datas_bloqueadas: ["2026-11-04"] };
  it("sabe o dia da semana sem depender do fuso", () => {
    expect(diaDaSemana("2026-11-01")).toBe(0); // domingo
    expect(diaDaSemana("2026-11-07")).toBe(6);
  });
  it("bloqueia dias fechados e datas bloqueadas", () => {
    expect(motivoDataIndisponivel(cat, "2026-11-01")).toContain("domingos");
    expect(motivoDataIndisponivel(cat, "2026-11-02")).toContain("segundas");
    expect(motivoDataIndisponivel(cat, "2026-11-04")).toContain("nesta data");
    expect(motivoDataIndisponivel(cat, "2026-11-03")).toBeNull();
    expect(motivoDataIndisponivel({}, "2026-11-01")).toBeNull();
    expect(motivoDataIndisponivel(cat, "")).toBeNull();
  });
  it("encontra a próxima data aberta", () => {
    expect(proximaDataDisponivel(cat, "2026-11-01")).toBe("2026-11-03");
    expect(proximaDataDisponivel(cat, "2026-11-04")).toBe("2026-11-05");
    expect(proximaDataDisponivel({ dias_fechados: [0, 1, 2, 3, 4, 5, 6] }, "2026-11-01")).toBe("2026-11-01");
  });
  it("normaliza horários de retirada", () => {
    expect(normalizarHorarios(["15:00", " 09:30", "15:00", ""])).toEqual(["09:30", "15:00"]);
    expect(normalizarHorarios(["9:30"])).toBeNull();
    expect(normalizarHorarios(["24:00"])).toBeNull();
  });
});

describe("entrega por bairro e cupons", () => {
  it("usa a taxa do bairro ou a taxa única", () => {
    const cat = { taxa_entrega: 10, bairros: [{ bairro: "Centro", taxa: 5 }, { bairro: "Jardim Sul", taxa: 0 }] };
    expect(taxaDeEntrega(cat, " centro ")).toBe(5);
    expect(taxaDeEntrega(cat, "Jardim Sul")).toBe(0);
    expect(taxaDeEntrega(cat, "")).toBeNull();
    expect(taxaDeEntrega(cat, "Outro")).toBeNull();
    expect(taxaDeEntrega({ taxa_entrega: 10 }, null)).toBe(10);
    expect(taxaDeEntrega({ taxa_entrega: 10, bairros: [] }, "x")).toBe(10);
  });
  it("valida a lista de bairros como o banco", () => {
    expect(validarBairros([{ bairro: "Centro", taxa: 5 }])).toBeNull();
    expect(validarBairros([{ bairro: "Centro", taxa: 5 }, { bairro: "centro ", taxa: 6 }])).toContain("duas vezes");
    expect(validarBairros([{ bairro: " ", taxa: 5 }])).toContain("nome");
    expect(validarBairros([{ bairro: "A", taxa: -1 }])).toContain("Taxa inválida");
  });
  it("normaliza o código do cupom", () => {
    expect(normalizarCupom(" promo-10 ")).toBe("PROMO10");
    expect(normalizarCupom("natal ção")).toBe("NATALCAO");
    expect(normalizarCupom("A".repeat(30)).length).toBe(20);
  });
  it("escolhe texto legível sobre a cor da marca", () => {
    expect(corDoTexto("#ffffff")).toBe("#1f1a17");
    expect(corDoTexto("#7a2e3b")).toBe("#ffffff");
    expect(corDoTexto("inválida")).toBe("#ffffff");
  });
});

describe("fotos de referência da encomenda", () => {
  it("extrai as fotos das observações", () => {
    const obs = "ENCOMENDA\nFotos de referência: https://x.lovable.cloud/storage/v1/object/public/catalogo/encomendas/loja/1-a.jpg https://x.lovable.cloud/storage/v1/object/public/catalogo/encomendas/loja/2-b.png\nRetirada.";
    expect(fotosDeReferencia(obs)).toEqual([
      "https://x.lovable.cloud/storage/v1/object/public/catalogo/encomendas/loja/1-a.jpg",
      "https://x.lovable.cloud/storage/v1/object/public/catalogo/encomendas/loja/2-b.png",
    ]);
    expect(fotosDeReferencia("https://site.com/foto.jpg")).toEqual([]);
    expect(fotosDeReferencia(null)).toEqual([]);
  });
});

describe("limites, sinal, fidelidade e kits", () => {
  const bolo = { id: "b", nome: "Bolo", descricao: null, categoria: "", preco: 20, imagem_url: null, antecedencia_dias: 0, limite_dia: 3, reservas: { "2026-11-02": 2 } };
  const brig = { ...bolo, id: "g", nome: "Brigadeiro", limite_dia: null, reservas: null };
  it("calcula o que resta no dia e o excesso do carrinho", () => {
    expect(restanteNoDia(bolo, "2026-11-02")).toBe(1);
    expect(restanteNoDia(bolo, "2026-11-03")).toBe(3);
    expect(restanteNoDia(brig, "2026-11-02")).toBeNull();
    expect(excessoNoLimite([{ produto: bolo, quantidade: 1 }, { produto: bolo, quantidade: 1 }, { produto: brig, quantidade: 50 }], "2026-11-02"))
      .toEqual([{ nome: "Bolo", pedido: 2, restante: 1 }]);
    expect(excessoNoLimite([{ produto: bolo, quantidade: 3 }], "2026-11-03")).toEqual([]);
  });
  it("calcula sinal e fidelidade como o servidor", () => {
    expect(sinalDoPedido(120, { sinal_percentual: 50, sinal_a_partir_de: 100 })).toBe(60);
    expect(sinalDoPedido(99.99, { sinal_percentual: 50, sinal_a_partir_de: 100 })).toBe(0);
    expect(sinalDoPedido(80, {})).toBe(0);
    expect(descontoFidelidade(60, { a_cada: 2, tipo: "percentual", valor: 10 })).toBe(6);
    expect(descontoFidelidade(15, { a_cada: 5, tipo: "valor", valor: 20 })).toBe(15);
    expect(descontoFidelidade(15, null)).toBe(0);
    expect(textoFidelidade({ a_cada: 5, tipo: "percentual", valor: 10 })).toBe("A cada 5 pedidos, o próximo ganha 10% de desconto.");
    expect(textoComponentes([{ nome: "Bolo", quantidade: 2 }, { nome: "Brigadeiro", quantidade: 10 }])).toBe("Inclui: 2× Bolo, 10× Brigadeiro");
    expect(textoComponentes([])).toBeNull();
  });
});
