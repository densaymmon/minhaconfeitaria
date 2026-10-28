import { describe, expect, it } from "vitest";
import {
  alterarQuantidade,
  capaDoProduto,
  linkCatalogo,
  linkPedido,
  mensagemConfirmacaoPedido,
  mensagemPedidoParaLoja,
  midiasDoProduto,
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
    expect(slugValido("painel")).toBe(false);
    expect(slugValido("pedidos")).toBe(false);
    expect(sugerirSlug("Confeitaria São João")).toBe("confeitaria-sao-joao");
  });
  it("posiciona o status do pedido na linha do tempo", () => {
    expect(etapaAtual("confirmado")).toBe(0);
    expect(etapaAtual("pronto")).toBe(2);
    expect(etapaAtual("finalizado")).toBe(3);
    expect(etapaAtual("cancelado")).toBe(-1);
  });
});

describe("links curtos e mídias", () => {
  it("monta o link do catálogo e do pedido", () => {
    expect(linkCatalogo("https://doce.app/", "casaldobolo")).toBe("https://doce.app/casaldobolo");
    expect(linkPedido("https://doce.app", { curto: "abcdefgh23", longo: "uuid" })).toBe("https://doce.app/p/abcdefgh23");
    expect(linkPedido("https://doce.app", { curto: null, longo: "uuid" })).toBe("https://doce.app/pedido/uuid");
    expect(linkPedido("https://doce.app", {})).toBeNull();
  });
  it("usa a primeira foto como capa, mesmo com vídeo antes", () => {
    const comMidias = { ...bolo, midias: [{ tipo: "video" as const, url: "https://x/v.mp4" }, { tipo: "imagem" as const, url: "https://x/1.jpg" }] };
    expect(capaDoProduto(comMidias)).toEqual({ tipo: "imagem", url: "https://x/1.jpg" });
    expect(capaDoProduto({ ...bolo, midias: [{ tipo: "video", url: "https://x/v.mp4" }] })).toEqual({ tipo: "video", url: "https://x/v.mp4" });
    expect(midiasDoProduto({ ...bolo, imagem_url: "https://x/capa.jpg" })).toEqual([{ tipo: "imagem", url: "https://x/capa.jpg" }]);
    expect(capaDoProduto(bolo)).toBeNull();
  });
});

describe("mensagem de confirmação no WhatsApp", () => {
  const base = {
    loja: "O Casal do Bolo",
    cliente: "Maria Souza",
    numero: 43,
    itens: [{ descricao: "Bolo de cenoura", quantidade: 2, preco: 25 }],
    taxaEntrega: 10,
    desconto: 0,
    total: 60,
    pago: 0,
    dataEntrega: "2026-10-30",
    horaEntrega: "15:00",
    tipoEntrega: "entrega" as const,
    endereco: "Rua das Flores, 10",
    pix: "pix@casaldobolo.com",
    link: "https://doce.app/p/abcdefgh23",
  };
  it("inclui itens, total, data, endereço, Pix e link de acompanhamento", () => {
    const m = mensagemConfirmacaoPedido(base);
    expect(m).toMatch(/^Olá, Maria! Recebemos seu pedido #43 na O Casal do Bolo/);
    expect(m).toContain("• 2× Bolo de cenoura — R$\u00a050,00");
    expect(m).toContain("• Entrega — R$\u00a010,00");
    expect(m).toContain("*Total: R$\u00a060,00*");
    expect(m).toContain("Entrega sexta-feira, 30/10 às 15:00");
    expect(m).toContain("Endereço: Rua das Flores, 10");
    expect(m).toContain("Chave: pix@casaldobolo.com");
    expect(m).toContain("Acompanhe o andamento: https://doce.app/p/abcdefgh23");
  });
  it("mostra pagamento confirmado quando já está pago e omite o que não existe", () => {
    const m = mensagemConfirmacaoPedido({ ...base, pago: 60, cliente: null, tipoEntrega: "retirada", endereco: null, horaEntrega: null, taxaEntrega: 0, total: 50, link: null });
    expect(m).toMatch(/^Olá! Recebemos/);
    expect(m).toContain("Retirada sexta-feira, 30/10");
    expect(m).toContain("Pagamento confirmado");
    expect(m).not.toContain("Chave:");
    expect(m).not.toContain("Acompanhe");
  });
});

describe("mensagem do cliente para a confeitaria", () => {
  it("resume o pedido e inclui o link de acompanhamento", () => {
    const m = mensagemPedidoParaLoja({
      cliente: "Dennys",
      numero: 44,
      itens: [{ descricao: "Baguete calabresa com queijo", quantidade: 2, preco: 35 }],
      taxaEntrega: 0,
      desconto: 0,
      total: 70,
      pago: 0,
      dataEntrega: "2026-10-29",
      horaEntrega: null,
      tipoEntrega: "retirada",
      endereco: null,
      link: "https://doce.app/p/hyknh58ymh",
    });
    expect(m).toMatch(/^Olá! Fiz o pedido #44 pelo catálogo\./);
    expect(m).toContain("• 2× Baguete calabresa com queijo — R$\u00a070,00");
    expect(m).toContain("*Total: R$\u00a070,00*");
    expect(m).toContain("Retirada quinta-feira, 29/10");
    expect(m).toContain("Nome: Dennys");
    expect(m).toContain("Acompanhar o pedido: https://doce.app/p/hyknh58ymh");
    expect(m).not.toContain("(pago)");
  });
});
