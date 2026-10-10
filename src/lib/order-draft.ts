import { z } from 'zod';

// Required nullable fields keep the emitted AI schema strict-compatible.
export const orderMessageSchema = z.object({
  itens: z.array(z.object({
    produto_id: z.string().nullable(),
    produto: z.string(),
    quantidade: z.number().nullable(),
    personalizacao: z.string().nullable(),
  }).strict()),
  data_desejada: z.string().nullable(),
  horario: z.string().nullable(),
  observacoes: z.string().nullable(),
  duvidas: z.array(z.string()),
}).strict();
export type OrderMessage = z.infer<typeof orderMessageSchema>;
export function normalizeOrderDraft(raw: OrderMessage, catalog: { id: string; nome: string }[]) {
  const duvidas = raw.duvidas.map(s => s.slice(0, 300)).slice(0, 20);
  const data = raw.data_desejada;
  const validDate = data && /^\d{4}-\d{2}-\d{2}$/.test(data) && !Number.isNaN(Date.parse(data)) && new Date(data).toISOString().slice(0, 10) === data;
  if (!validDate) duvidas.push('Confirme a data de entrega.');
  const horario = raw.horario && /^([01]\d|2[0-3]):[0-5]\d$/.test(raw.horario) ? raw.horario : null;
  return {
    itens: raw.itens.slice(0, 100).map(item => {
      const product = catalog.find(p => p.id === item.produto_id);
      const quantidade = typeof item.quantidade === 'number' && Number.isFinite(item.quantidade) && item.quantidade > 0 && item.quantidade <= 100000 ? item.quantidade : null;
      if (!product) duvidas.push(`Confira o produto e o preço: ${item.produto.slice(0, 120)}.`);
      if (!quantidade) duvidas.push(`Confirme a quantidade de ${item.produto.slice(0, 120)}.`);
      return { produto_id: product?.id ?? null, produto: product?.nome ?? item.produto.slice(0, 200), quantidade, personalizacao: item.personalizacao?.slice(0, 1000) ?? null };
    }),
    data_desejada: validDate ? data : null,
    horario,
    observacoes: raw.observacoes?.slice(0, 3000) ?? null,
    duvidas: [...new Set(duvidas)],
  };
}
export type OrderDraft = ReturnType<typeof normalizeOrderDraft>;
