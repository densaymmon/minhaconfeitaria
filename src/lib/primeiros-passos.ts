// Roteiro de primeiros passos da confeitaria nova (regras puras, testadas em primeiros-passos.test.ts).

export type DadosPassos = {
  nome: string | null | undefined;
  whatsapp: string | null | undefined;
  pix: string | null | undefined;
  insumos: number;
  produtosComReceita: number;
  catalogoNoAr: boolean;
  pedidos: number;
  equipe?: number;
};

export type Passo = { id: string; titulo: string; descricao: string; feito: boolean; link: string };

export function primeirosPassos(d: DadosPassos): Passo[] {
  return [
    { id: "loja", titulo: "Dados da confeitaria", descricao: "Nome e WhatsApp que aparecem para os clientes.", feito: Boolean(d.nome && d.nome !== "Minha confeitaria" && d.whatsapp), link: "/configuracoes" },
    { id: "pix", titulo: "Chave Pix", descricao: "Para os clientes pagarem e as mensagens saírem com o Pix.", feito: Boolean(d.pix?.trim()), link: "/configuracoes" },
    { id: "insumos", titulo: "Ingredientes", descricao: "Cadastre o que você compra (preço e tamanho da embalagem).", feito: d.insumos > 0, link: "/produtos" },
    { id: "produto", titulo: "Primeiro produto com receita", descricao: "Com a ficha técnica o sistema calcula custo, preço sugerido e lucro.", feito: d.produtosComReceita > 0, link: "/produtos" },
    { id: "pedido", titulo: "Primeiro pedido", descricao: "Registre uma encomenda para ver a produção e o financeiro funcionando.", feito: d.pedidos > 0, link: "/pedidos/novo" },
    { id: "catalogo", titulo: "Catálogo no ar", descricao: "Seu link de pedidos com Pix para mandar aos clientes.", feito: d.catalogoNoAr, link: "/catalogo" },
  ];
}

export function progressoPassos(passos: Passo[]) {
  const feitos = passos.filter((p) => p.feito).length;
  return { feitos, total: passos.length, completo: feitos === passos.length, proximo: passos.find((p) => !p.feito) ?? null };
}
