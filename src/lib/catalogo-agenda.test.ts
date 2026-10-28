import { describe, expect, it } from "vitest";
import { corDoTexto, diaDaSemana, fotosDeReferencia, motivoDataIndisponivel, normalizarCupom, normalizarHorarios, proximaDataDisponivel, taxaDeEntrega, validarBairros } from "./catalogo";

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
