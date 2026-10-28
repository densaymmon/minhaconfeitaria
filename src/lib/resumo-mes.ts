// Resumo do mês: vendas, custos, despesas, lucro e produtos que mais dão lucro,
// com comparação com o mês anterior. Funções puras (resumo-mes.test.ts).

export type PedidoMes = {
  status: string;
  data_entrega: string;
  pedido_itens: { produto_id?: string | null; descricao: string; quantidade: number; preco_unitario: number; custo_unitario: number }[];
  t: { venda: number; custo: number; taxas: number; subtotal: number };
};

export type DespesaMes = { data: string; valor: number; categoria?: string | null };

export type ProdutoLucro = { nome: string; quantidade: number; receita: number; custo: number; lucro: number };

export type ResumoMes = {
  mes: string;
  pedidos: number;
  vendas: number;
  custoProdutos: number;
  taxas: number;
  lucroBruto: number;
  despesas: number;
  resultado: number;
  ticketMedio: number;
  margem: number;
  produtos: ProdutoLucro[];
  despesasPorCategoria: { categoria: string; valor: number }[];
};

const n = (v: unknown) => Number(v ?? 0) || 0;
const r2 = (v: number) => Math.round(v * 100) / 100;

/** "2026-10" ± meses. */
export function deslocarMes(mes: string, delta: number) {
  const [a, m] = mes.split("-").map(Number);
  const d = new Date(Date.UTC(a ?? 1970, (m ?? 1) - 1 + delta, 1));
  return d.toISOString().slice(0, 7);
}

export function nomeMes(mes: string) {
  const nomes = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
  return `${nomes[Number(mes.slice(5, 7)) - 1] ?? ""} de ${mes.slice(0, 4)}`;
}

/** Nome do produto sem as variações escolhidas ("Bolo (Tamanho: G)" → "Bolo"). */
export function nomeBase(descricao: string) {
  return descricao.replace(/\s*\([^)]*\)\s*$/, "").trim() || descricao;
}

export function resumoDoMes(pedidos: PedidoMes[], despesas: DespesaMes[], mes: string): ResumoMes {
  const doMes = pedidos.filter((p) => p.status !== "cancelado" && p.data_entrega.startsWith(mes));
  const vendas = doMes.reduce((s, p) => s + n(p.t.venda), 0);
  const custoProdutos = doMes.reduce((s, p) => s + n(p.t.custo), 0);
  const taxas = doMes.reduce((s, p) => s + n(p.t.taxas), 0);
  const gastos = despesas.filter((d) => d.data.startsWith(mes));
  const totalDespesas = gastos.reduce((s, d) => s + n(d.valor), 0);

  // Lucro por produto: receita proporcional à venda do pedido (desconto/frete rateados) menos custo.
  const mapa = new Map<string, ProdutoLucro>();
  for (const p of doMes) {
    const bruto = n(p.t.subtotal);
    const fator = bruto > 0 ? n(p.t.venda) / bruto : 0;
    for (const i of p.pedido_itens) {
      const nome = nomeBase(i.descricao);
      const atual = mapa.get(nome) ?? { nome, quantidade: 0, receita: 0, custo: 0, lucro: 0 };
      const receita = n(i.quantidade) * n(i.preco_unitario) * fator;
      const custo = n(i.quantidade) * n(i.custo_unitario);
      atual.quantidade += n(i.quantidade);
      atual.receita += receita;
      atual.custo += custo;
      atual.lucro += receita - custo;
      mapa.set(nome, atual);
    }
  }
  const produtos = [...mapa.values()]
    .map((p) => ({ ...p, receita: r2(p.receita), custo: r2(p.custo), lucro: r2(p.lucro) }))
    .sort((a, b) => b.lucro - a.lucro || b.receita - a.receita);

  const porCategoria = new Map<string, number>();
  for (const d of gastos) porCategoria.set(d.categoria || "Outros", (porCategoria.get(d.categoria || "Outros") ?? 0) + n(d.valor));

  const lucroBruto = vendas - custoProdutos;
  const resultado = lucroBruto - taxas - totalDespesas;
  return {
    mes,
    pedidos: doMes.length,
    vendas: r2(vendas),
    custoProdutos: r2(custoProdutos),
    taxas: r2(taxas),
    lucroBruto: r2(lucroBruto),
    despesas: r2(totalDespesas),
    resultado: r2(resultado),
    ticketMedio: doMes.length ? r2(vendas / doMes.length) : 0,
    margem: vendas > 0 ? Math.round((resultado / vendas) * 1000) / 10 : 0,
    produtos,
    despesasPorCategoria: [...porCategoria.entries()].map(([categoria, valor]) => ({ categoria, valor: r2(valor) })).sort((a, b) => b.valor - a.valor),
  };
}

/** Variação percentual em relação ao mês anterior (null quando não há base de comparação). */
export function variacao(atual: number, anterior: number) {
  if (Math.abs(anterior) < 0.005) return null;
  return Math.round(((atual - anterior) / Math.abs(anterior)) * 1000) / 10;
}
