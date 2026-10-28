// Produção e gestão: agenda da semana, lista de compras, entregas do dia, fluxo de caixa,
// meta do mês e etiquetas. Funções puras, testadas em gestao.test.ts.

import { medida } from "./ingredient-cost";
import { componentesDoKit, formatarQuantidade, type Necessidade, type UnidadeBase } from "./lista-producao";

const n = (v: unknown) => Number(v ?? 0) || 0;
const arred = (v: number) => Math.round(v * 100) / 100;
const brl = (v: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number.isFinite(v) ? v : 0);

function data(iso: string) {
  const [a, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(a ?? 1970, (m ?? 1) - 1, d ?? 1));
}
export function somarDiasISO(iso: string, dias: number) {
  const d = data(iso);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}
const dm = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

// Agenda ---------------------------------------------------------------------------------

/** Os 7 dias (segunda a domingo) da semana que contém a data. */
export function semanaDe(iso: string) {
  const dow = data(iso).getUTCDay(); // 0 = domingo
  const segunda = somarDiasISO(iso, dow === 0 ? -6 : 1 - dow);
  return Array.from({ length: 7 }, (_, i) => somarDiasISO(segunda, i));
}

export type PedidoAgenda = { id: string; data_entrega: string; status: string; pedido_itens: { quantidade: number; quantidade_produzida?: number | null }[] };

/** Pedidos (sem cancelados) por dia da semana, com total de itens e o que falta produzir. */
export function agendaDaSemana<T extends PedidoAgenda>(pedidos: T[], dias: string[], limitePorDia?: number | null) {
  return dias.map((dia) => {
    const doDia = pedidos.filter((p) => p.data_entrega === dia && p.status !== "cancelado");
    const itens = doDia.reduce((s, p) => s + p.pedido_itens.reduce((t, i) => t + n(i.quantidade), 0), 0);
    const pendente = doDia.reduce((s, p) => s + p.pedido_itens.reduce((t, i) => t + Math.max(0, n(i.quantidade) - n(i.quantidade_produzida)), 0), 0);
    const cheio = limitePorDia != null && limitePorDia > 0 && doDia.length >= limitePorDia;
    return { dia, pedidos: doDia, itens, pendente, cheio };
  });
}

// Lista de compras -------------------------------------------------------------------------

export type InsumoCompra = { id: string; nome: string; preco_embalagem?: number | null; quantidade_embalagem?: number | null; unidade_embalagem?: string | null; unidade?: string | null; preco_unidade?: number | null };

export type ItemCompra = {
  insumo_id: string;
  nome: string;
  unidade: UnidadeBase;
  /** Quanto falta (na unidade base: g, ml, un). */
  falta: number;
  /** Embalagens a comprar (null quando a embalagem não está cadastrada na mesma medida). */
  embalagens: number | null;
  embalagem: string | null;
  custo: number | null;
};

/** O que comprar: arredonda para embalagens inteiras e estima o custo pelo último preço. */
export function listaDeCompras(necessidades: Necessidade[], insumos: InsumoCompra[], semControle: "ignorar" | "tudo" = "ignorar"): ItemCompra[] {
  const porId = new Map(insumos.map((i) => [i.id, i]));
  return necessidades.flatMap((l) => {
    const falta = l.estoque === null ? (semControle === "tudo" ? l.necessario : 0) : l.falta;
    if (falta <= 0) return [];
    const ins = porId.get(l.insumo_id);
    const m = ins?.unidade_embalagem ? medida(ins.unidade_embalagem) : null;
    const tamanho = m && m.base === l.unidade ? n(ins?.quantidade_embalagem) * m.fator : 0;
    const embalagens = tamanho > 0 ? Math.ceil(falta / tamanho - 1e-9) : null;
    const custo = embalagens !== null && n(ins?.preco_embalagem) > 0 ? arred(embalagens * n(ins?.preco_embalagem)) : null;
    return [{
      insumo_id: l.insumo_id,
      nome: l.nome,
      unidade: l.unidade,
      falta,
      embalagens,
      embalagem: tamanho > 0 && ins?.unidade_embalagem ? `${n(ins.quantidade_embalagem).toLocaleString("pt-BR")} ${ins.unidade_embalagem}` : null,
      custo,
    }];
  }).sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
}

export function textoListaCompras(itens: ItemCompra[], periodo: string) {
  const total = itens.reduce((s, i) => s + (i.custo ?? 0), 0);
  return [
    `🛒 Lista de compras (${periodo})`,
    "",
    ...itens.map((i) => `• ${i.nome}: ${formatarQuantidade(i.falta, i.unidade)}${i.embalagens !== null ? ` → ${i.embalagens}× ${i.embalagem}` : ""}${i.custo !== null ? ` (~${brl(i.custo)})` : ""}`),
    ...(total > 0 ? ["", `Estimativa: ${brl(total)}`] : []),
  ].join("\n");
}

// Entregas do dia ---------------------------------------------------------------------------

export function linkMapa(endereco: string, cidade?: string | null) {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([endereco, cidade].filter(Boolean).join(", "))}`;
}

/** Rota com várias paradas no Google Maps (o celular abre no app; máximo de 10 paradas por link). */
export function linkRota(enderecos: string[], cidade?: string | null) {
  const paradas = enderecos.map((e) => [e, cidade].filter(Boolean).join(", ")).slice(0, 10);
  if (paradas.length === 0) return null;
  const destino = paradas[paradas.length - 1] ?? "";
  const meio = paradas.slice(0, -1);
  return `https://www.google.com/maps/dir/?api=1&travelmode=driving&destination=${encodeURIComponent(destino)}${meio.length ? `&waypoints=${encodeURIComponent(meio.join("|"))}` : ""}`;
}

export function mensagemSaiuParaEntrega(d: { cliente?: string | null | undefined; numero: number; loja: string; falta?: number | undefined }) {
  const nome = d.cliente?.trim().split(/\s+/)[0];
  return [
    `Olá${nome ? `, ${nome}` : ""}! Seu pedido #${d.numero} da ${d.loja} saiu para entrega 🚚`,
    ...(n(d.falta) > 0 ? [`Valor a pagar na entrega: ${brl(n(d.falta))}`] : []),
    "Logo chegamos. Qualquer coisa, é só responder aqui.",
  ].join("\n");
}

/** Entregas do dia (tipo "entrega", sem canceladas/entregues), em ordem de horário. */
export function entregasDoDia<T extends { data_entrega: string; status: string; tipo_entrega?: string | null; hora_entrega?: string | null }>(pedidos: T[], dia: string) {
  return pedidos
    .filter((p) => p.data_entrega === dia && p.tipo_entrega === "entrega" && !["cancelado", "entregue", "finalizado"].includes(p.status))
    .sort((a, b) => (a.hora_entrega || "99:99").localeCompare(b.hora_entrega || "99:99"));
}

// Fluxo de caixa ----------------------------------------------------------------------------

export type Movimento = { data: string; valor: number; descricao?: string };
export type SemanaCaixa = { inicio: string; fim: string; rotulo: string; entradas: number; saidas: number; saldo: number; acumulado: number };

/** Entradas e saídas previstas por semana (a 1ª semana inclui o que está atrasado). */
export function fluxoDeCaixa(entradas: Movimento[], saidas: Movimento[], hoje: string, semanas = 8, saldoInicial = 0): SemanaCaixa[] {
  const inicio = semanaDe(hoje)[0] ?? hoje;
  let acumulado = saldoInicial;
  return Array.from({ length: semanas }, (_, i) => {
    const ini = somarDiasISO(inicio, i * 7);
    const fim = somarDiasISO(ini, 6);
    const dentro = (m: Movimento) => (i === 0 ? m.data <= fim : m.data >= ini && m.data <= fim);
    const e = arred(entradas.filter(dentro).reduce((s, m) => s + n(m.valor), 0));
    const s = arred(saidas.filter(dentro).reduce((t, m) => t + n(m.valor), 0));
    acumulado = arred(acumulado + e - s);
    return { inicio: ini, fim, rotulo: i === 0 ? "Esta semana" : `${dm(ini)} a ${dm(fim)}`, entradas: e, saidas: s, saldo: arred(e - s), acumulado };
  });
}

// Meta do mês -------------------------------------------------------------------------------

/** Progresso da meta: percentual, quanto falta, projeção no ritmo atual e quanto vender por dia. */
export function progressoMeta(vendido: number, meta: number, hoje: string) {
  const d = data(hoje);
  const diasNoMes = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  const dia = d.getUTCDate();
  const diasRestantes = diasNoMes - dia + 1;
  const falta = Math.max(0, arred(meta - vendido));
  return {
    pct: meta > 0 ? Math.min(999, Math.round((vendido / meta) * 100)) : 0,
    falta,
    projecao: arred((vendido / dia) * diasNoMes),
    porDia: diasRestantes > 0 ? arred(falta / diasRestantes) : falta,
    diasRestantes,
    batida: meta > 0 && vendido >= meta,
  };
}

// Etiquetas ---------------------------------------------------------------------------------

export type ProdutoEtiqueta = {
  id: string;
  nome: string;
  validade_dias?: number | null;
  receita_itens: { insumo_id: string }[];
  componentes?: unknown;
};
export type InsumoEtiqueta = { id: string; nome: string; alergenos?: string | null; tipo?: string | null };
export type Etiqueta = { chave: string; cliente: string; numero: number; descricao: string; fabricacao: string; validade: string | null; ingredientes: string[]; alergenos: string[] };

/** Uma etiqueta por unidade de cada item dos pedidos do dia (até 200). */
export function etiquetasDoDia(
  pedidos: { id: string; numero: number; data_entrega: string; status: string; clientes?: { nome: string } | null; pedido_itens: { produto_id: string | null; descricao: string; quantidade: number }[] }[],
  produtos: ProdutoEtiqueta[],
  insumos: InsumoEtiqueta[],
  dia: string,
  fabricacao: string,
): Etiqueta[] {
  const porProduto = new Map(produtos.map((p) => [p.id, p]));
  const porInsumo = new Map(insumos.map((i) => [i.id, i]));
  const ingredientesDe = (p: ProdutoEtiqueta | undefined, visitados = new Set<string>()): InsumoEtiqueta[] => {
    if (!p || visitados.has(p.id)) return [];
    visitados.add(p.id);
    const proprios = p.receita_itens.map((r) => porInsumo.get(r.insumo_id)).filter((i): i is InsumoEtiqueta => Boolean(i) && i?.tipo !== "embalagem");
    const doKit = componentesDoKit(p.componentes).flatMap((c) => ingredientesDe(porProduto.get(c.produto_id), visitados));
    return [...proprios, ...doKit];
  };
  const etiquetas: Etiqueta[] = [];
  for (const ped of pedidos) {
    if (ped.data_entrega !== dia || ped.status === "cancelado") continue;
    for (const [idx, item] of ped.pedido_itens.entries()) {
      const produto = item.produto_id ? porProduto.get(item.produto_id) : undefined;
      const ins = ingredientesDe(produto);
      const nomes = [...new Set(ins.map((i) => i.nome))];
      const alergenos = [...new Set(ins.flatMap((i) => (i.alergenos ?? "").split(/[,;]/).map((a) => a.trim().toLowerCase()).filter(Boolean)))].sort();
      const validade = produto?.validade_dias ? somarDiasISO(fabricacao, Number(produto.validade_dias)) : null;
      const unidades = Math.max(1, Math.min(50, Math.ceil(n(item.quantidade))));
      for (let u = 0; u < unidades && etiquetas.length < 200; u++) {
        etiquetas.push({ chave: `${ped.id}-${idx}-${u}`, cliente: ped.clientes?.nome ?? "", numero: ped.numero, descricao: item.descricao, fabricacao, validade, ingredientes: nomes, alergenos });
      }
    }
  }
  return etiquetas;
}
