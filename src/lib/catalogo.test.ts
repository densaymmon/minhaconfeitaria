import { describe, expect, it } from "vitest";
import {
  miniaturaDaFoto,
  URL_SISTEMA,
  origemPublica,
  alterarQuantidade,
  chaveCarrinho,
  descricaoComOpcoes,
  escolhaCompleta,
  lerChaveCarrinho,
  precoComOpcoes,
  precoMinimo,
  capaDoProduto,
  linkCatalogo,
  linkPedido,
  mensagemConfirmacaoPedido,
  mensagemPedidoParaLoja,
  mensagemPedidoPronto,
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

describe("aviso de pedido pronto e Pix copia e cola", () => {
  const base = {
    loja: "O Casal do Bolo",
    cliente: "Maria Souza",
    numero: 45,
    itens: [{ descricao: "Bolo de laranja", quantidade: 1, preco: 25 }],
    taxaEntrega: 0,
    desconto: 0,
    total: 25,
    pago: 10,
    dataEntrega: "2026-10-30",
    horaEntrega: "15:00",
    tipoEntrega: "retirada" as const,
    endereco: "Rua A, 1",
    pix: "pix@loja.com",
    pixCopiaECola: "00020126CODIGO6304ABCD",
    link: "https://doce.app/p/abcdefgh23",
  };
  it("avisa que está pronto, com retirada, saldo e Pix copia e cola", () => {
    const m = mensagemPedidoPronto(base);
    expect(m).toMatch(/^Olá, Maria! Seu pedido #45 da O Casal do Bolo está pronto!/);
    expect(m).toContain("Pode retirar a partir das 15:00 em: Rua A, 1.");
    expect(m).toContain("Pagamento por Pix: R$\u00a015,00");
    expect(m).toContain("Pix copia e cola (já com o valor):\n00020126CODIGO6304ABCD");
    expect(m).toContain("Acompanhe: https://doce.app/p/abcdefgh23");
  });
  it("sem saldo não fala de pagamento; entrega avisa a saída", () => {
    const m = mensagemPedidoPronto({ ...base, pago: 25, tipoEntrega: "entrega", endereco: "Rua B, 2" });
    expect(m).toContain("Já vamos sair para a entrega em: Rua B, 2.");
    expect(m).not.toContain("Pix");
  });
  it("a confirmação também leva o Pix copia e cola", () => {
    expect(mensagemConfirmacaoPedido(base)).toContain("Pix copia e cola (já com o valor):\n00020126CODIGO6304ABCD");
  });
});

describe("variações de produto no carrinho", () => {
  const boloOpcoes: ProdutoCatalogo = {
    ...bolo,
    preco: 30,
    opcoes: [
      { grupo: "Tamanho", itens: [{ nome: "P", preco: -5 }, { nome: "M", preco: 0 }, { nome: "G", preco: 20 }] },
      { grupo: "Sabor", itens: [{ nome: "Chocolate", preco: 0 }, { nome: "Morango", preco: 5 }] },
    ],
  };
  it("gera a mesma chave independente da ordem e lê de volta", () => {
    const a = chaveCarrinho("bolo", { Tamanho: "G", Sabor: "Morango" });
    expect(a).toBe(chaveCarrinho("bolo", { Sabor: "Morango", Tamanho: "G" }));
    expect(lerChaveCarrinho(a)).toEqual({ produtoId: "bolo", escolha: { Sabor: "Morango", Tamanho: "G" } });
    expect(chaveCarrinho("pao")).toBe("pao");
  });
  it("calcula preço, preço mínimo e descrição", () => {
    expect(precoComOpcoes(boloOpcoes, { Tamanho: "G", Sabor: "Morango" })).toBe(55);
    expect(precoMinimo(boloOpcoes)).toBe(25);
    expect(descricaoComOpcoes(boloOpcoes, { Sabor: "Morango", Tamanho: "G" })).toBe("Bolo (Tamanho: G, Sabor: Morango)");
  });
  it("exige uma opção válida em cada grupo", () => {
    expect(escolhaCompleta(boloOpcoes, { Tamanho: "G" })).toBe(false);
    expect(escolhaCompleta(boloOpcoes, { Tamanho: "GG", Sabor: "Chocolate" })).toBe(false);
    expect(escolhaCompleta(boloOpcoes, { Tamanho: "G", Sabor: "Chocolate", Extra: "x" })).toBe(false);
    expect(escolhaCompleta(boloOpcoes, { Tamanho: "G", Sabor: "Chocolate" })).toBe(true);
    expect(escolhaCompleta(bolo, {})).toBe(true);
  });
  it("monta linhas separadas por opção e descarta escolhas que deixaram de existir", () => {
    const g = chaveCarrinho("bolo", { Tamanho: "G", Sabor: "Morango" });
    const p = chaveCarrinho("bolo", { Tamanho: "P", Sabor: "Chocolate" });
    const velho = chaveCarrinho("bolo", { Tamanho: "GG", Sabor: "Chocolate" });
    const carrinho = limparCarrinho({ [g]: 2, [p]: 1, [velho]: 1 }, [boloOpcoes]);
    expect(Object.keys(carrinho).sort()).toEqual([g, p].sort());
    const r = resumoCarrinho(carrinho, [boloOpcoes], { entrega: false, taxaEntrega: 0, hoje: "2026-10-31" });
    expect(r.itens).toBe(3);
    expect(r.subtotal).toBe(135);
    expect(r.linhas.find((l) => l.chave === g)?.descricao).toBe("Bolo (Tamanho: G, Sabor: Morango)");
  });
});

describe("endereço público dos links", () => {
  it("troca prévias do Lovable e o ambiente local pelo endereço publicado", () => {
    expect(origemPublica("https://id-preview--c2b2cdb7-59d4-4ac1-afc0-f3b8cdffb2cc.lovable.app")).toBe(URL_SISTEMA);
    expect(origemPublica("https://c2b2cdb7-59d4-4ac1-afc0-f3b8cdffb2cc.lovableproject.com")).toBe(URL_SISTEMA);
    expect(origemPublica("https://preview--minhaconfeitaria.lovable.app")).toBe(URL_SISTEMA);
    expect(origemPublica("http://localhost:8080")).toBe(URL_SISTEMA);
    expect(origemPublica("lixo")).toBe(URL_SISTEMA);
  });
  it("mantém o endereço publicado e domínios próprios", () => {
    expect(origemPublica("https://minhaconfeitaria.lovable.app")).toBe("https://minhaconfeitaria.lovable.app");
    expect(origemPublica("https://app.docegestao.com.br/")).toBe("https://app.docegestao.com.br");
  });
});

describe("miniatura das fotos", () => {
  it("usa a miniatura das fotos novas e a própria foto nas antigas", () => {
    expect(miniaturaDaFoto("https://x.supabase.co/storage/v1/object/public/catalogo/u/p-1-abc-g.jpg")).toBe("https://x.supabase.co/storage/v1/object/public/catalogo/u/p-1-abc-p.jpg");
    expect(miniaturaDaFoto("https://x/catalogo/u/p-1-abc-g.jpg?v=2")).toBe("https://x/catalogo/u/p-1-abc-p.jpg?v=2");
    expect(miniaturaDaFoto("https://x/catalogo/u/p-1-abc.jpg")).toBe("https://x/catalogo/u/p-1-abc.jpg");
    expect(miniaturaDaFoto("https://x/catalogo/u/video-g.jpg.mp4")).toBe("https://x/catalogo/u/video-g.jpg.mp4");
  });
});
