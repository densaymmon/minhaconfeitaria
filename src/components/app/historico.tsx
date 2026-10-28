import { useQuery } from "@tanstack/react-query";
import { History } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export type RegistroHistorico = { id: string; autor: string; entidade: string; pedido_numero: number | null; acao: string; detalhe: string | null; created_at: string; registro_id: string | null };

export const historicoQ = (registroId?: string) => ({
  queryKey: ["historico", registroId ?? "todos"],
  queryFn: async (): Promise<RegistroHistorico[]> => {
    let q = supabase.from("historico").select("id,autor,entidade,pedido_numero,acao,detalhe,created_at,registro_id").order("created_at", { ascending: false }).limit(registroId ? 50 : 300);
    if (registroId) q = q.eq("registro_id", registroId);
    const { data, error } = await q;
    // Antes da migração 0045 (ou para o papel produção) não há histórico: lista vazia.
    return error ? [] : (data ?? []);
  },
});

export function quando(iso: string) {
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" }).format(new Date(iso));
}

/** Últimas alterações de um pedido (quem fez e quando). */
export function HistoricoDoPedido({ pedidoId }: { pedidoId: string }) {
  const { data: registros = [] } = useQuery(historicoQ(pedidoId));
  if (registros.length === 0) return null;
  return (
    <details className="rounded-2xl bg-card p-4 shadow-soft">
      <summary className="flex cursor-pointer items-center gap-2 font-semibold"><History className="size-4 text-primary" /> Histórico do pedido ({registros.length})</summary>
      <ul className="mt-3 space-y-2 text-sm">
        {registros.map((r) => (
          <li key={r.id} className="border-l-2 border-primary/30 pl-3">
            <div><span className="font-medium">{r.autor}</span> {r.acao}{r.detalhe ? `: ${r.detalhe}` : ""}</div>
            <div className="text-xs text-muted-foreground">{quando(r.created_at)}</div>
          </li>
        ))}
      </ul>
    </details>
  );
}
