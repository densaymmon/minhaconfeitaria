// Clientes para reativar: quem já comprou e não compra há um tempo. Funções puras (reativar.test.ts).

export type ClienteBase = { id: string; nome: string; telefone: string | null };
export type PedidoReativar = { cliente_id: string | null; status: string; data_entrega: string; t: { venda: number } };

export type ClienteSumido<C extends ClienteBase> = { cliente: C; ultimaCompra: string; dias: number; pedidos: number; total: number };

const diasEntre = (de: string, ate: string) => {
  const d = (s: string) => Date.UTC(Number(s.slice(0, 4)), Number(s.slice(5, 7)) - 1, Number(s.slice(8, 10)));
  return Math.round((d(ate) - d(de)) / 86_400_000);
};

/**
 * Clientes cuja última compra (não cancelada) foi há pelo menos `dias` dias, do que sumiu
 * há menos tempo para o que sumiu há mais (os mais fáceis de reconquistar primeiro).
 * Quem tem pedido futuro em aberto não entra.
 */
export function clientesSumidos<C extends ClienteBase>(clientes: C[], pedidos: PedidoReativar[], hoje: string, dias: number): ClienteSumido<C>[] {
  const porCliente = new Map<string, { ultima: string; n: number; total: number }>();
  for (const p of pedidos) {
    if (!p.cliente_id || p.status === "cancelado") continue;
    const s = porCliente.get(p.cliente_id) ?? { ultima: p.data_entrega, n: 0, total: 0 };
    if (p.data_entrega > s.ultima) s.ultima = p.data_entrega;
    s.n += 1;
    s.total += Number(p.t.venda) || 0;
    porCliente.set(p.cliente_id, s);
  }
  return clientes
    .flatMap((c) => {
      const s = porCliente.get(c.id);
      if (!s) return [];
      const d = diasEntre(s.ultima, hoje);
      return d >= dias ? [{ cliente: c, ultimaCompra: s.ultima, dias: d, pedidos: s.n, total: Math.round(s.total * 100) / 100 }] : [];
    })
    .sort((a, b) => a.dias - b.dias || b.total - a.total);
}

/** Mensagem de reaproximação, com o link do catálogo quando houver. */
export function mensagemReativar(nome: string, loja: string, linkCatalogo?: string | null) {
  const primeiro = nome.trim().split(/\s+/)[0] ?? "";
  return [
    `Oi ${primeiro}! Tudo bem? Aqui é da ${loja} 😊`,
    "Faz um tempinho que você não pede com a gente e lembramos de você!",
    linkCatalogo ? `Dá uma olhada nas novidades e encomende por aqui: ${linkCatalogo}` : "Quer que eu te mande as opções desta semana?",
    "",
    "Vai ser um prazer adoçar seu dia de novo 💛",
  ].join("\n");
}
