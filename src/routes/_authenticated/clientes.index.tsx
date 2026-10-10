import * as appQueries from "@/lib/queries";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Download, Plus, Search, ChevronRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { clientesQ, type Cliente } from "@/lib/queries";
import { usePedidosCalc } from "@/lib/hooks";
import { brl, hojeISO } from "@/lib/format";
import { baixarCSV } from "@/lib/csv";
import { Card, Empty, Field, PageHeader } from "@/components/app/ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export const Route = createFileRoute("/_authenticated/clientes/")({
 loader: async ({ context }) => { await Promise.all([context.queryClient.ensureQueryData(appQueries.clientesQ),context.queryClient.ensureQueryData(appQueries.pedidosQ),context.queryClient.ensureQueryData(appQueries.configQ)]); },
 errorComponent: ({error}) => <p role="alert" className="py-8 text-destructive">{error instanceof Error ? error.message : "Não foi possível carregar os registros."}</p>,
 notFoundComponent: () => <p>Registro não encontrado.</p>,

  head: () => ({
    meta: [
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { title: "Clientes — Doce Gestão" },
      { name: "description", content: "Cadastro de clientes da confeitaria." },
      { property: "og:title", content: "Clientes — Doce Gestão" },
      { property: "og:description", content: "Cadastro de clientes da confeitaria." },
    ],
  }),
  component: Clientes,
});

export function ClienteDialog({ cliente, open, onOpenChange }: { cliente?: Cliente; open: boolean; onOpenChange: (v: boolean) => void }) {
  const qc = useQueryClient();
  const [f, setF] = useState({
    nome: cliente?.nome ?? "",
    telefone: cliente?.telefone ?? "",
    endereco: cliente?.endereco ?? "",
    observacoes: cliente?.observacoes ?? "",
  });
  const [loading, setLoading] = useState(false);
  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    if (!f.nome.trim()) return void toast.error("Informe o nome.");
    setLoading(true);
    const payload = {
      nome: f.nome.trim().slice(0, 120),
      telefone: f.telefone.trim().slice(0, 30) || null,
      endereco: f.endereco.trim().slice(0, 300) || null,
      observacoes: f.observacoes.trim().slice(0, 1000) || null,
    };
    const { error } = cliente
      ? await supabase.from("clientes").update(payload).eq("id", cliente.id)
      : await supabase.from("clientes").insert(payload);
    setLoading(false);
    if (error) return void toast.error(error.message);
    await qc.invalidateQueries({ queryKey: ["clientes"] });
    qc.invalidateQueries({ queryKey: ["pedidos"] });
    toast.success("Cliente salvo!");
    onOpenChange(false);
    if (!cliente) setF({ nome: "", telefone: "", endereco: "", observacoes: "" });
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{cliente ? "Editar cliente" : "Novo cliente"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={salvar} className="space-y-3">
          <Field label="Nome *">
            <Input value={f.nome} onChange={(e) => setF({ ...f, nome: e.target.value })} className="h-11" />
          </Field>
          <Field label="Telefone / WhatsApp">
            <Input type="tel" inputMode="tel" value={f.telefone} onChange={(e) => setF({ ...f, telefone: e.target.value })} className="h-11" placeholder="(11) 99999-9999" />
          </Field>
          <Field label="Endereço">
            <Input value={f.endereco} onChange={(e) => setF({ ...f, endereco: e.target.value })} className="h-11" />
          </Field>
          <Field label="Observações">
            <Textarea value={f.observacoes} onChange={(e) => setF({ ...f, observacoes: e.target.value })} placeholder="Alergias, preferências..." />
          </Field>
          <Button className="h-11 w-full" disabled={loading}>Salvar</Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Clientes() {
  const { data: clientes } = useSuspenseQuery(clientesQ);
  const pedidos = usePedidosCalc();
  const [busca, setBusca] = useState("");
  const [aberto, setAberto] = useState(false);

  const stats = useMemo(() => {
    const m = new Map<string, { n: number; total: number }>();
    for (const p of pedidos) {
      if (!p.cliente_id || p.status === "cancelado") continue;
      const s = m.get(p.cliente_id) ?? { n: 0, total: 0 };
      s.n++;
      s.total += p.t.venda;
      m.set(p.cliente_id, s);
    }
    return m;
  }, [pedidos]);

  const q = busca.toLowerCase();
  const lista = clientes.filter((c) => !q || c.nome.toLowerCase().includes(q) || (c.telefone ?? "").includes(q));

  return (
    <>
      <PageHeader
        title="Clientes"
        subtitle={`${clientes.length} cadastrado(s)`}
        action={
          <div className="mt-1 flex gap-2">
            <Button
              size="icon"
              variant="outline"
              aria-label="Exportar CSV"
              onClick={() =>
                baixarCSV(
                  `clientes-${hojeISO()}`,
                  ["Nome", "Telefone", "Endereço", "Observações", "Pedidos", "Total comprado"],
                  clientes.map((c) => [c.nome, c.telefone, c.endereco, c.observacoes, stats.get(c.id)?.n ?? 0, +(stats.get(c.id)?.total ?? 0).toFixed(2)]),
                )
              }
            >
              <Download className="size-4" />
            </Button>
            <Button size="sm" className="h-9" onClick={() => setAberto(true)}>
              <Plus className="size-4" /> Novo
            </Button>
          </div>
        }
      />
      <div className="relative mb-4">
        <Search className="absolute top-3.5 left-3 size-4 text-muted-foreground" />
        <Input placeholder="Buscar por nome ou telefone" value={busca} onChange={(e) => setBusca(e.target.value)} className="h-11 bg-card pl-9" />
      </div>
      {lista.length === 0 ? (
        <Empty>Nenhum cliente ainda.</Empty>
      ) : (
        <div className="space-y-2">
          {lista.map((c) => (
            <Link key={c.id} to="/clientes/$id" params={{ id: c.id }} className="block">
              <Card className="flex items-center gap-3 p-3.5">
                <div className="grid size-10 shrink-0 place-items-center rounded-full bg-accent font-semibold text-accent-foreground">
                  {c.nome.charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">{c.nome}</div>
                  <div className="truncate text-xs text-muted-foreground">{c.telefone ?? "Sem telefone"}</div>
                </div>
                <div className="text-right text-xs">
                  <div className="font-semibold">{brl(stats.get(c.id)?.total ?? 0)}</div>
                  <div className="text-muted-foreground">{stats.get(c.id)?.n ?? 0} pedido(s)</div>
                </div>
                <ChevronRight className="size-4 text-muted-foreground" />
              </Card>
            </Link>
          ))}
        </div>
      )}
      <ClienteDialog open={aberto} onOpenChange={setAberto} />
    </>
  );
}
