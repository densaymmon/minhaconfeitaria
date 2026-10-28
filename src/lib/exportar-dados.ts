// Cópia completa dos dados da confeitaria (somente o que a conta logada pode ver, pelo RLS).
import { supabase } from "@/integrations/supabase/client";
import { baixarCSV } from "@/lib/csv";

export const TABELAS_EXPORTADAS = [
  "confeitarias", "configuracoes", "clientes", "produtos", "receita_itens", "produto_midias", "insumos",
  "pedidos", "pedido_itens", "pedido_pagamentos", "pedidos_recorrentes", "pedidos_recorrentes_ocorrencias",
  "despesas", "compras", "compra_itens", "contas_pagar", "contas_pagar_pagamentos", "estoque_movimentos",
  "assinaturas", "assinatura_pagamentos",
] as const;

const POR_PAGINA = 1000;

/** Lê uma tabela inteira em páginas (o servidor devolve no máximo 1000 linhas por vez). */
async function lerTabela(tabela: string): Promise<Record<string, unknown>[]> {
  const linhas: Record<string, unknown>[] = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- nome de tabela dinâmico
  const db = supabase as any;
  for (let inicio = 0; ; inicio += POR_PAGINA) {
    const { data, error } = await db.from(tabela).select("*").range(inicio, inicio + POR_PAGINA - 1);
    if (error) {
      // Tabela inexistente ou sem acesso: segue com as demais.
      return linhas;
    }
    linhas.push(...((data ?? []) as Record<string, unknown>[]));
    if (!data || data.length < POR_PAGINA) return linhas;
  }
}

/** Baixa um arquivo .json com todas as tabelas e devolve quantos registros foram exportados. */
export async function baixarCopiaCompleta(nomeLoja: string, aoAvancar?: (tabela: string) => void) {
  const dados: Record<string, unknown[]> = {};
  let total = 0;
  for (const tabela of TABELAS_EXPORTADAS) {
    aoAvancar?.(tabela);
    const linhas = await lerTabela(tabela);
    dados[tabela] = linhas;
    total += linhas.length;
  }
  const arquivo = { sistema: "Doce Gestão", confeitaria: nomeLoja, gerado_em: new Date().toISOString(), tabelas: dados };
  const blob = new Blob([JSON.stringify(arquivo, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `doce-gestao-copia-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return total;
}

/** Planilha com uma linha por item de pedido (abre no Excel/Google Planilhas). */
export async function baixarPlanilhaPedidos() {
  const pedidos = await lerTabela("pedidos");
  const itens = await lerTabela("pedido_itens");
  const clientes = await lerTabela("clientes");
  const nomeCliente = new Map(clientes.map((c) => [String(c["id"]), String(c["nome"] ?? "")]));
  const porPedido = new Map<string, Record<string, unknown>[]>();
  for (const i of itens) porPedido.set(String(i["pedido_id"]), [...(porPedido.get(String(i["pedido_id"])) ?? []), i]);
  const linhas = pedidos
    .sort((a, b) => String(b["data_entrega"]).localeCompare(String(a["data_entrega"])))
    .flatMap((p) => {
      const lista = porPedido.get(String(p["id"])) ?? [];
      const base = [p["numero"], p["data_entrega"], p["hora_entrega"] ?? "", nomeCliente.get(String(p["cliente_id"])) ?? "", p["status"], p["origem"] ?? "", p["forma_pagamento"] ?? ""];
      return (lista.length ? lista : [{}]).map((i) => [
        ...base,
        i["descricao"] ?? "", i["quantidade"] ?? "", i["preco_unitario"] ?? "", i["custo_unitario"] ?? "",
        p["desconto"] ?? 0, p["taxa_entrega"] ?? 0, p["valor_entrada"] ?? 0,
      ] as (string | number | null)[]);
    });
  baixarCSV(`pedidos-completos-${new Date().toISOString().slice(0, 10)}`,
    ["Pedido", "Entrega", "Horário", "Cliente", "Status", "Origem", "Pagamento", "Item", "Quantidade", "Preço unitário", "Custo unitário", "Desconto do pedido", "Taxa de entrega", "Entrada"],
    linhas.map((l) => l.map((c) => (typeof c === "number" || typeof c === "string" || c === null ? c : String(c)))));
  return pedidos.length;
}
