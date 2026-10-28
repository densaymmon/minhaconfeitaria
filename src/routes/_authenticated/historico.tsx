import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { History } from "lucide-react";
import { historicoQ, quando } from "@/components/app/historico";
import { Card, PageHeader } from "@/components/app/ui";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/historico")({
  head: () => ({ meta: [{ title: "Histórico — Doce Gestão" }, { name: "description", content: "Quem criou, alterou e recebeu cada pedido." }] }),
  component: HistoricoPage,
});

const TIPOS = [{ id: "", rotulo: "Tudo" }, { id: "pedido", rotulo: "Pedidos" }, { id: "pagamento", rotulo: "Pagamentos" }, { id: "produto", rotulo: "Preços" }] as const;

function HistoricoPage() {
  const { data: registros = [], isLoading } = useQuery(historicoQ());
  const [tipo, setTipo] = useState<string>("");
  const [autor, setAutor] = useState<string>("");
  const autores = [...new Set(registros.map((r) => r.autor))].sort();
  const lista = registros.filter((r) => (!tipo || r.entidade === tipo) && (!autor || r.autor === autor));

  return (
    <>
      <PageHeader title="Histórico" subtitle="Quem fez o quê nos pedidos, pagamentos e preços" back="/mais" />
      <div className="mb-3 flex flex-wrap gap-2">
        {TIPOS.map((t) => <Button key={t.id} type="button" size="sm" variant={tipo === t.id ? "default" : "outline"} onClick={() => setTipo(t.id)}>{t.rotulo}</Button>)}
        {autores.length > 1 && (
          <select value={autor} onChange={(e) => setAutor(e.target.value)} className="h-9 rounded-md border bg-card px-2 text-sm" aria-label="Pessoa">
            <option value="">Todas as pessoas</option>
            {autores.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
        )}
      </div>
      <Card className="pb-2">
        {isLoading ? <p className="text-sm text-muted-foreground" role="status">Carregando…</p> : lista.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground"><History className="mx-auto mb-2 size-8 opacity-50" />Nada registrado ainda. As alterações a partir de agora aparecem aqui.</p>
        ) : (
          <ul className="divide-y">
            {lista.map((r) => (
              <li key={r.id} className="py-2.5 text-sm">
                <div>
                  <span className="font-medium">{r.autor}</span> {r.acao}
                  {r.pedido_numero != null && r.registro_id && r.acao !== "excluiu o pedido" ? <> <Link to="/pedidos/$id" params={{ id: r.registro_id }} className="text-primary hover:underline">#{r.pedido_numero}</Link></> : r.pedido_numero != null ? ` #${r.pedido_numero}` : ""}
                </div>
                {r.detalhe && <div className="text-muted-foreground">{r.detalhe}</div>}
                <div className="text-xs text-muted-foreground">{quando(r.created_at)}</div>
              </li>
            ))}
          </ul>
        )}
        <p className="pt-2 text-xs text-muted-foreground">Mostra as últimas 300 alterações. Mudanças de status feitas automaticamente aparecem como "Sistema".</p>
      </Card>
    </>
  );
}
