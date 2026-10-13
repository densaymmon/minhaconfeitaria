import * as appQueries from "@/lib/queries";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Copy, Download, Plus, Trash2, Pencil } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useCustos } from "@/lib/hooks";
import { margemReal } from "@/lib/calc";
import { brl, hojeISO, pct, dataBR } from "@/lib/format";
import { custoPorMedida, medidaLabel } from "@/lib/ingredient-cost";
import { IngredientForm } from "@/components/app/ingredient-form";
import { baixarCSV } from "@/lib/csv";
import { Card, Empty, PageHeader } from "@/components/app/ui";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { Insumo } from "@/lib/queries";

export const Route = createFileRoute("/_authenticated/produtos/")({
 loader: async ({ context }) => { await Promise.all([context.queryClient.ensureQueryData(appQueries.produtosQ),context.queryClient.ensureQueryData(appQueries.insumosQ)]); },
 errorComponent: ({error}) => <p role="alert" className="py-8 text-destructive">{error instanceof Error ? error.message : "Não foi possível carregar os registros."}</p>,
 notFoundComponent: () => <p>Registro não encontrado.</p>,

  head: () => ({
    meta: [
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { title: "Produtos e insumos — Doce Gestão" },
      { name: "description", content: "Produtos, receitas e preços dos insumos." },
      { property: "og:title", content: "Produtos e insumos — Doce Gestão" },
      { property: "og:description", content: "Produtos, receitas e preços dos insumos." },
    ],
  }),
  component: Produtos,
});

function Produtos() {
  const { produtos, insumos, custo } = useCustos();
  const navigate = useNavigate();
  return (
    <>
      <PageHeader title="Produtos e receitas" back="/mais" />
      <Tabs defaultValue="produtos">
        <TabsList className="mb-4 grid w-full grid-cols-2">
          <TabsTrigger value="produtos">Produtos ({produtos.length})</TabsTrigger>
          <TabsTrigger value="insumos">Insumos ({insumos.length})</TabsTrigger>
        </TabsList>
        <TabsContent value="produtos">
          <div className="mb-3 flex gap-2">
            <Button asChild className="h-11 flex-1">
              <Link to="/produtos/$id" params={{ id: "novo" }}><Plus className="size-4" /> Novo produto</Link>
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="h-11 w-11"
              aria-label="Exportar CSV"
              onClick={() =>
                baixarCSV(
                  `produtos-${hojeISO()}`,
                  ["Produto", "Categoria", "Rendimento", "Custo unitário", "Preço de venda", "Lucro unitário", "Margem real %", "Ativo"],
                  produtos.map((p) => {
                    const c = custo.get(p.id) ?? 0;
                    return [p.nome, p.categoria, Number(p.rendimento), +c.toFixed(2), Number(p.preco_venda), +(Number(p.preco_venda) - c).toFixed(2), +margemReal(c, Number(p.preco_venda)).toFixed(1), p.ativo];
                  }),
                )
              }
            >
              <Download className="size-4" />
            </Button>
          </div>
          {produtos.length === 0 ? (
            <Empty>Cadastre primeiro os insumos e depois seus produtos com a receita.</Empty>
          ) : (
            <div className="space-y-2">
              {produtos.map((p) => {
                const c = custo.get(p.id) ?? 0;
                const preco = Number(p.preco_venda);
                const lucro = preco - c;
                return (
                  <Card key={p.id} className={`p-3.5 ${p.ativo ? "" : "opacity-60"}`}>
                    <div className="flex items-start gap-2">
                      <Link to="/produtos/$id" params={{ id: p.id }} className="min-w-0 flex-1">
                        <div className="flex justify-between gap-2">
                          <div className="min-w-0">
                            <div className="truncate font-semibold">{p.nome}</div>
                            <div className="text-xs text-muted-foreground">{p.categoria}{!p.ativo && " · inativo"}</div>
                            {p.custo_alterado_em && <div className="mt-1 text-xs text-warning-foreground">Custo atualizado em {dataBR(p.custo_alterado_em)}</div>}
                          </div>
                          <div className="text-right font-semibold">{brl(preco)}</div>
                        </div>
                        <div className="mt-2 grid grid-cols-3 text-xs">
                          <div><div className="text-muted-foreground">Custo un.</div>{brl(c)}</div>
                          <div><div className="text-muted-foreground">Lucro un.</div><span className={lucro >= 0 ? "text-success" : "text-destructive"}>{brl(lucro)}</span></div>
                          <div><div className="text-muted-foreground">Margem</div>{pct(margemReal(c, preco))}</div>
                        </div>
                      </Link>
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        className="h-10 w-10 shrink-0"
                        aria-label={`Duplicar ${p.nome}`}
                        title="Duplicar produto"
                        onClick={() => navigate({ to: "/produtos/$id", params: { id: p.id }, search: { duplicar: true } })}
                      >
                        <Copy className="size-4" />
                      </Button>
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>
        <TabsContent value="insumos">
          <Insumos insumos={insumos} />
        </TabsContent>
      </Tabs>
    </>
  );
}

function Insumos({ insumos }: { insumos: Insumo[] }) {
  const qc = useQueryClient();
  const [editando, setEditando] = useState<string | null>(null);

  async function excluir(i: Insumo) {
    if (!confirm(`Excluir ${i.nome}?`)) return;
    const { error } = await supabase.from("insumos").delete().eq("id", i.id);
    if (error) return void toast.error(error.message.includes("foreign") ? "Este insumo está em uma receita. Remova-o da receita primeiro." : error.message);
    qc.invalidateQueries({ queryKey: ["insumos"] });
  }

  return (
    <>
      <Card className="mb-4">
        <h2 className="mb-3 font-semibold">Novo insumo</h2>
        <IngredientForm />
      </Card>
      {insumos.length === 0 ? (
        <Empty>Nenhum insumo cadastrado.</Empty>
      ) : (
        <div className="space-y-2">
          {insumos.map((i) => {
            const u = custoPorMedida(i);
            return <Card key={i.id} className="p-3">
              <div className="flex items-center gap-2">
                <div className="min-w-0 flex-1">
                  <div className="break-words font-medium">{i.nome}</div>
                  <div className="text-xs text-muted-foreground">{brl(i.preco_embalagem ?? i.preco_unidade)} / {i.quantidade_embalagem ?? 1} {medidaLabel(i.unidade_embalagem ?? i.unidade)}</div>
                  <div className="text-xs text-muted-foreground">Custo unitário: {brl(u.custo)} / {medidaLabel(u.unidade)}</div>
                </div>
                <Button size="icon" variant="ghost" onClick={() => setEditando(editando === i.id ? null : i.id)} aria-label={`Editar ${i.nome}`}><Pencil className="size-4" /></Button>
                <Button size="icon" variant="ghost" onClick={() => excluir(i)} aria-label={`Excluir ${i.nome}`}><Trash2 className="size-4 text-destructive" /></Button>
              </div>
              {editando === i.id && <div className="mt-3 border-t pt-3"><IngredientForm insumo={i} onDone={() => setEditando(null)} /></div>}
            </Card>;
          })}
        </div>
      )}
    </>
  );
}
