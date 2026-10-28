import * as appQueries from "@/lib/queries";
import { createFileRoute } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Printer, Tag } from "lucide-react";
import { usePedidosCalc } from "@/lib/hooks";
import { dataBR, hojeISO } from "@/lib/format";
import { etiquetasDoDia, somarDiasISO } from "@/lib/gestao";
import { Card, Field, PageHeader } from "@/components/app/ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";

export const Route = createFileRoute("/_authenticated/etiquetas")({
  loader: async ({ context }) => {
    await Promise.all([
      context.queryClient.ensureQueryData(appQueries.pedidosQ),
      context.queryClient.ensureQueryData(appQueries.configQ),
      context.queryClient.ensureQueryData(appQueries.pedidoPagamentosQ),
      context.queryClient.ensureQueryData(appQueries.produtosQ),
      context.queryClient.ensureQueryData(appQueries.insumosQ),
      context.queryClient.ensureQueryData(appQueries.confeitariaQ),
    ]);
  },
  head: () => ({ meta: [{ title: "Etiquetas — Doce Gestão" }, { name: "description", content: "Etiquetas com validade, ingredientes e alergênicos para imprimir." }] }),
  component: EtiquetasPage,
});

function EtiquetasPage() {
  const pedidos = usePedidosCalc();
  const { data: produtos } = useSuspenseQuery(appQueries.produtosQ);
  const { data: insumos } = useSuspenseQuery(appQueries.insumosQ);
  const { data: confeitaria } = useSuspenseQuery(appQueries.confeitariaQ);
  const hoje = hojeISO();
  const [dia, setDia] = useState(somarDiasISO(hoje, 1));
  const [fabricacao, setFabricacao] = useState(hoje);
  const [mostrarIngredientes, setMostrarIngredientes] = useState(true);
  const [mostrarCliente, setMostrarCliente] = useState(true);
  const etiquetas = useMemo(() => etiquetasDoDia(pedidos, produtos, insumos, dia, fabricacao), [pedidos, produtos, insumos, dia, fabricacao]);
  const loja = confeitaria?.nome ?? "";

  return (
    <>
      <div className="print:hidden">
        <PageHeader title="Etiquetas" subtitle="Uma etiqueta por unidade dos pedidos do dia" back="/mais" />
        <Card className="mb-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Pedidos com entrega em"><Input type="date" value={dia} onChange={(e) => e.target.value && setDia(e.target.value)} className="h-11 bg-card" /></Field>
            <Field label="Data de fabricação"><Input type="date" value={fabricacao} onChange={(e) => e.target.value && setFabricacao(e.target.value)} className="h-11 bg-card" /></Field>
          </div>
          <div className="flex flex-wrap gap-4 text-sm">
            <label className="flex items-center gap-2"><Switch checked={mostrarCliente} onCheckedChange={setMostrarCliente} /> Nome do cliente</label>
            <label className="flex items-center gap-2"><Switch checked={mostrarIngredientes} onCheckedChange={setMostrarIngredientes} /> Ingredientes</label>
          </div>
          <Button type="button" className="h-11 w-full" disabled={etiquetas.length === 0} onClick={() => window.print()}><Printer className="size-4" /> Imprimir {etiquetas.length} etiqueta(s)</Button>
          <p className="text-xs text-muted-foreground">A validade vem do campo "Validade (dias)" do produto e os alergênicos, do cadastro dos ingredientes. Use papel de etiqueta A4 ou corte as etiquetas.</p>
        </Card>
        {etiquetas.length === 0 && <Card className="py-10 text-center text-sm text-muted-foreground"><Tag className="mx-auto mb-2 size-8 opacity-50" />Nenhum pedido com entrega em {dataBR(dia)}.</Card>}
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 print:grid-cols-3 print:gap-1">
        {etiquetas.map((e) => (
          <div key={e.chave} className="break-inside-avoid rounded-lg border border-dashed border-foreground/40 bg-white p-2 text-[11px] leading-tight text-black">
            <div className="flex items-baseline justify-between gap-1">
              <span className="truncate font-bold">{loja}</span>
              <span className="shrink-0">#{e.numero}</span>
            </div>
            <div className="mt-1 text-[13px] font-bold">{e.descricao}</div>
            {mostrarCliente && e.cliente && <div className="truncate">Para: {e.cliente}</div>}
            <div className="mt-1">Fabricação: {dataBR(e.fabricacao)}</div>
            {e.validade && <div className="font-semibold">Validade: {dataBR(e.validade)}</div>}
            {mostrarIngredientes && e.ingredientes.length > 0 && <div className="mt-1 line-clamp-3">Ingredientes: {e.ingredientes.join(", ")}.</div>}
            {e.alergenos.length > 0 && <div className="mt-1 font-bold uppercase">Alérgicos: contém {e.alergenos.join(", ")}.</div>}
          </div>
        ))}
      </div>
    </>
  );
}
