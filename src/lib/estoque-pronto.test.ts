import { describe, expect, it } from "vitest";
import { disponivelParaLinha, lerQuantidade, mensagemErroEstoque, mapaProntos, planejarUsoEstoque, previaInsumosProducao, quantidadeValida, rotuloMovimentoPronto } from "./estoque-pronto";

describe("mapa de prontos", () => {
  it("soma saldos e ignora zero, negativos e inválidos", () => {
    const m = mapaProntos([
      { produto_id: "bolo", quantidade: "3" },
      { produto_id: "pao", quantidade: 0 },
      { produto_id: "torta", quantidade: -1 },
      { produto_id: "x", quantidade: "abc" },
    ]);
    expect([...m.entries()]).toEqual([["bolo", 3]]);
    expect(mapaProntos(undefined).size).toBe(0);
  });
});

describe("planejar uso do estoque no pedido", () => {
  const saldos = new Map([["bolo", 3], ["pao", 2]]);

  it("só usa os itens marcados e nunca mais do que existe", () => {
    expect(planejarUsoEstoque([
      { produto_id: "bolo", quantidade: 2, usar_estoque: true },
      { produto_id: "pao", quantidade: 5, usar_estoque: true },
      { produto_id: "bolo", quantidade: 1 },
      { produto_id: null, quantidade: 1, usar_estoque: true },
      { produto_id: "torta", quantidade: 1, usar_estoque: true },
    ], saldos)).toEqual([2, 2, 0, 0, 0]);
  });

  it("divide o saldo entre linhas do mesmo produto, na ordem", () => {
    expect(planejarUsoEstoque([
      { produto_id: "bolo", quantidade: 2, usar_estoque: true },
      { produto_id: "bolo", quantidade: 4, usar_estoque: true },
    ], saldos)).toEqual([2, 1]);
  });

  it("não altera o mapa original", () => {
    planejarUsoEstoque([{ produto_id: "bolo", quantidade: 3, usar_estoque: true }], saldos);
    expect(saldos.get("bolo")).toBe(3);
  });

  it("calcula o que ainda está disponível para cada linha", () => {
    const itens = [
      { produto_id: "bolo", quantidade: 2, usar_estoque: true },
      { produto_id: "bolo", quantidade: 4, usar_estoque: false },
    ];
    expect(disponivelParaLinha(itens, 0, saldos)).toBe(3);
    expect(disponivelParaLinha(itens, 1, saldos)).toBe(1);
    expect(disponivelParaLinha([{ produto_id: null, quantidade: 1 }], 0, saldos)).toBe(0);
  });
});

describe("prévia de insumos da produção para estoque", () => {
  const insumos = [{ id: "farinha", nome: "Farinha", unidade_embalagem: "g" }];
  const bolo = { id: "bolo", nome: "Bolo", rendimento: 1, receita_itens: [{ insumo_id: "farinha", quantidade: 10, quantidade_utilizada: 10, unidade_receita: "g" }] };

  it("multiplica a receita pela quantidade e compara com o saldo", () => {
    const r = previaInsumosProducao(bolo, 3, insumos, [{ insumo_id: "farinha", saldo: 20, unidade_base: "g" }]);
    expect(r.linhas).toHaveLength(1);
    expect(r.linhas[0]).toMatchObject({ necessario: 30, estoque: 20, falta: 10 });
  });

  it("não expande componentes de kit (o servidor usa só a ficha do próprio produto)", () => {
    const kit = { id: "kit", nome: "Kit", rendimento: 1, receita_itens: [], componentes: [{ produto_id: "bolo", quantidade: 1 }] };
    const r = previaInsumosProducao(kit, 2, insumos, []);
    expect(r.linhas).toHaveLength(0);
    expect(r.semReceita).toEqual(["Kit"]);
  });

  it("sem produto, devolve vazio", () => {
    expect(previaInsumosProducao(undefined, 1, insumos, []).linhas).toHaveLength(0);
  });
});

describe("quantidades digitadas", () => {
  it("aceita vírgula e rejeita lixo", () => {
    expect(lerQuantidade("1,5")).toBe(1.5);
    expect(lerQuantidade(" 3 ")).toBe(3);
    expect(lerQuantidade("0")).toBe(0);
    expect(lerQuantidade("-2")).toBe(0);
    expect(lerQuantidade("abc")).toBe(0);
    expect(lerQuantidade("1,23456")).toBe(1.235);
  });

  it("valida os limites do banco", () => {
    expect(quantidadeValida(1)).toBe(true);
    expect(quantidadeValida(9999)).toBe(true);
    expect(quantidadeValida(10000)).toBe(false);
    expect(quantidadeValida(0)).toBe(false);
    expect(quantidadeValida(1.2345)).toBe(false);
  });
});

describe("rótulos do histórico", () => {
  it("traduz os tipos conhecidos e mantém os desconhecidos", () => {
    expect(rotuloMovimentoPronto("uso_pedido")).toBe("Usado em pedido");
    expect(rotuloMovimentoPronto("novo_tipo")).toBe("novo_tipo");
  });
});

describe("mensagens do servidor", () => {
  it("remove prefixos técnicos", () => {
    expect(mensagemErroEstoque(new Error("ESTOQUE: Bolo tem apenas 2 unidade(s) pronta(s) em estoque."))).toBe("Bolo tem apenas 2 unidade(s) pronta(s) em estoque.");
    expect(mensagemErroEstoque("PLANO: o controle de estoque não está incluído no seu plano.")).toBe("o controle de estoque não está incluído no seu plano.");
    expect(mensagemErroEstoque(null)).toBe("tente novamente.");
  });
});
