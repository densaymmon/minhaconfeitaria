import { Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, Pencil, Target } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { confeitariaQ, meuPapelQ } from "@/lib/queries";
import { useCustos } from "@/lib/hooks";
import { alertaMargem } from "@/lib/calc";
import { brl, hojeISO, parseNum } from "@/lib/format";
import { progressoMeta } from "@/lib/gestao";
import { Card } from "@/components/app/ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/** Meta de vendas do mês: progresso, projeção e quanto vender por dia. */
export function MetaDoMes({ vendido }: { vendido: number }) {
  const qc = useQueryClient();
  const { data: confeitaria } = useQuery(confeitariaQ);
  const { data: meuPapel } = useQuery(meuPapelQ);
  const podeEditar = (meuPapel?.papel ?? "dono") !== "producao";
  const meta = Number(confeitaria?.meta_vendas_mes ?? 0);
  const [editando, setEditando] = useState(false);
  const [valor, setValor] = useState("");
  if (!confeitaria || !("meta_vendas_mes" in confeitaria) || (!meta && !podeEditar)) return null;

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    const v = parseNum(valor);
    if (!(v >= 0) || v > 10_000_000) return void toast.error("Informe a meta em reais.");
    const { error } = await supabase.from("confeitarias").update({ meta_vendas_mes: v }).eq("user_id", confeitaria!.user_id);
    if (error) return void toast.error(`Não foi possível salvar: ${error.message}`);
    setEditando(false);
    await qc.invalidateQueries({ queryKey: ["confeitaria"] });
    toast.success(v > 0 ? "Meta do mês salva." : "Meta removida.");
  }

  if (editando || !meta) {
    return (
      <Card className="mb-5 p-4">
        <form onSubmit={salvar} className="flex flex-wrap items-end gap-2">
          <div className="min-w-0 flex-1">
            <p className="mb-1 flex items-center gap-2 text-sm font-semibold"><Target className="size-4 text-primary" /> Meta de vendas do mês</p>
            <Input inputMode="decimal" value={valor} onChange={(e) => setValor(e.target.value)} placeholder={meta ? String(meta) : "Ex.: 8000"} className="h-10 bg-card" aria-label="Meta do mês em reais" />
          </div>
          <Button type="submit" className="h-10">Salvar</Button>
          {meta > 0 && <Button type="button" variant="ghost" className="h-10" onClick={() => setEditando(false)}>Cancelar</Button>}
        </form>
        {!meta && <p className="mt-2 text-xs text-muted-foreground">Defina quanto quer vender no mês para acompanhar o ritmo aqui.</p>}
      </Card>
    );
  }

  const p = progressoMeta(vendido, meta, hojeISO());
  return (
    <Card className="mb-5 p-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="flex items-center gap-2 text-sm font-semibold"><Target className="size-4 text-primary" /> Meta do mês: {brl(meta)}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">Vendido {brl(vendido)} ({p.pct}%) · pela data de entrega</p>
        </div>
        {podeEditar && <Button type="button" size="icon" variant="ghost" className="size-8" aria-label="Alterar meta" onClick={() => { setValor(String(meta)); setEditando(true); }}><Pencil className="size-4" /></Button>}
      </div>
      <div className="mt-3 h-3 overflow-hidden rounded-full bg-muted"><div className={cn("h-full rounded-full", p.batida ? "bg-success" : "bg-primary")} style={{ width: `${Math.min(100, p.pct)}%` }} /></div>
      <p className="mt-2 text-sm">
        {p.batida ? "🎉 Meta batida! Tudo o que vier agora é extra."
          : <>Faltam <b>{brl(p.falta)}</b>: cerca de <b>{brl(p.porDia)}</b> por dia nos {p.diasRestantes} dia(s) que restam. No ritmo atual, o mês fecha em <b className={p.projecao >= meta ? "text-success" : ""}>{brl(p.projecao)}</b>.</>}
      </p>
    </Card>
  );
}

/** Produtos com preço abaixo do custo ou da margem desejada (ex.: depois de um insumo subir). */
export function AlertaMargens() {
  const { produtos, custo } = useCustos();
  const alertas = produtos
    .filter((p) => p.ativo)
    .map((p) => ({ p, a: alertaMargem(custo.get(p.id) ?? 0, Number(p.preco_venda), Number(p.margem_desejada)) }))
    .filter(({ a }) => a.abaixoDoCusto || a.abaixoDaMargem)
    .sort((x, y) => Number(y.a.abaixoDoCusto) - Number(x.a.abaixoDoCusto) || y.a.faltaParaMargem - x.a.faltaParaMargem);
  if (alertas.length === 0) return null;
  return (
    <Card className="mb-5 border border-warning/40 p-4">
      <p className="flex items-center gap-2 text-sm font-semibold"><AlertTriangle className="size-4 text-warning-foreground" /> {alertas.length} produto(s) com margem baixa</p>
      <p className="mt-0.5 text-xs text-muted-foreground">O custo dos ingredientes subiu ou o preço ficou abaixo da margem desejada.</p>
      <ul className="mt-2 divide-y text-sm">
        {alertas.slice(0, 5).map(({ p, a }) => (
          <li key={p.id}>
            <Link to="/produtos/$id" params={{ id: p.id }} className="flex items-center justify-between gap-2 py-2 hover:bg-muted/40">
              <span className="min-w-0 truncate">{p.nome}{a.abaixoDoCusto && <span className="ml-1 text-xs font-semibold text-destructive">prejuízo</span>}</span>
              <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{brl(Number(p.preco_venda))} → sugerido <b className="text-foreground">{brl(a.sugerido)}</b></span>
            </Link>
          </li>
        ))}
      </ul>
      {alertas.length > 5 && <Link to="/produtos" className="text-sm text-primary hover:underline">Ver todos</Link>}
    </Card>
  );
}
