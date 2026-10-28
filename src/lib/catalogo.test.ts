import { describe, expect, it } from "vitest";
import {
  alterarQuantidade,
  etapaAtual,
  limparCarrinho,
  linkWhatsApp,
  mensagemErroCatalogo,
  resumoCarrinho,
  slugValido,
  somarDias,
  sugerirSlug,
  telefoneValido,
  type ProdutoCatalogo,
} from "./catalogo";

const bolo: ProdutoCatalogo = { id: "bolo", nome: "Bolo", descricao: null, categoria: "Bolos", preco: 25, imagem_url: null, antecedencia_dias: 1 };
const baguete: ProdutoCatalogo = { id: "baguete", nome: "Baguete", descricao: null, categoria: "Baguetes", preco: 35.5, imagem_url: null, antecedencia_dias: 2 };

describe("carrinho do catálogo", () => {
  it("soma, limita e remove quantidades", () => {
    let c = alterarQuantidade({}, "bolo", 1);
    c = alterarQuantidade(c, "bolo", 1);
    expect(c).toEqual({ bolo: 2 });
    expect(alterarQuantidade(c, "bolo", -5)).toEqual({});
    expect(alterarQuantidade({ bolo: 98 }, "bolo", 5)).toEqual({ bolo: 99 });
  });
  it("descarta produtos que saíram do catálogo e quantidades inválidas", () => {
    expect(limparCarrinho({ bolo: 2, antigo: 1, baguete: 0 }, [bolo, baguete])).toEqual({ bolo: 2 });
  });
  it("calcula subtotal, taxa de entrega e data mínima pela maior antecedência", () => {
    const r = resumoCarrinho({ bolo: 2, baguete: 1 }, [bolo, baguete], { entrega: true, taxaEntrega: 10, hoje: "2026-10-31" });
    expect(r.itens).toBe(3);
    expect(r.subtotal).toBe(85.5);
    expect(r.taxa).toBe(10);
    expect(r.total).toBe(95.5);
    expect(r.dataMinima).toBe("2026-11-02");
    expect(resumoCarrinho({ bolo: 1 }, [bolo], { entrega: false, taxaEntrega: 10, hoje: "2026-12-31" })).toMatchObject({ taxa: 0, total: 25, dataMinima: "2027-01-01" });
  });
});

describe("utilitários do catálogo", () => {
  it("soma dias atravessando mês e ano", () => {
    expect(somarDias("2026-02-28", 1)).toBe("2026-03-01");
    expect(somarDias("2026-12-31", 0)).toBe("2026-12-31");
  });
  it("valida WhatsApp com DDD, com ou sem 55", () => {
    expect(telefoneValido("(19) 98888-7777")).toBe(true);
    expect(telefoneValido("+55 19 98888-7777")).toBe(true);
    expect(telefoneValido("1933334444")).toBe(true);
    expect(telefoneValido("98888-7777")).toBe(false);
  });
  it("monta link do WhatsApp só com número válido", () => {
    expect(linkWhatsApp("(19) 98715-2050", "Oi")).toBe("https://wa.me/5519987152050?text=Oi");
    expect(linkWhatsApp("123", "Oi")).toBeNull();
    expect(linkWhatsApp(null, "Oi")).toBeNull();
  });
  it("mostra a mensagem do servidor sem o prefixo técnico", () => {
    expect(mensagemErroCatalogo({ message: "CATALOGO: informe seu nome." })).toBe("informe seu nome.");
    expect(mensagemErroCatalogo(new Error("fetch failed"))).toMatch(/Não foi possível enviar/);
  });
  it("gera e valida o endereço do catálogo", () => {
    expect(sugerirSlug("O Casal do Bolo — Amor & Cia")).toBe("o-casal-do-bolo-amor-cia");
    expect(slugValido("o-casal-do-bolo")).toBe(true);
    expect(slugValido("O Casal")).toBe(false);
    expect(slugValido("ab")).toBe(false);
  });
  it("posiciona o status do pedido na linha do tempo", () => {
    expect(etapaAtual("confirmado")).toBe(0);
    expect(etapaAtual("pronto")).toBe(2);
    expect(etapaAtual("finalizado")).toBe(3);
    expect(etapaAtual("cancelado")).toBe(-1);
  });
});
