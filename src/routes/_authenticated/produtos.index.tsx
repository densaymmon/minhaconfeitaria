import { createFileRoute, Link } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Download, Plus, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useCustos } from "@/lib/hooks";
import { margemReal } from "@/lib/calc";
import { UNIDADES, brl, hojeISO, parseNum, pct } from "@/lib/format";
import { baixarCSV } from "@/lib/csv";
import { Card, Empty, Field, NativeSelect, PageHeader } from "@/components/app/ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { Insumo } from "@/lib/queries";

export const Route = createFileRoute("/_authenticated/produtos/")({
  head: () => ({
    meta: [
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
                  <Link key={p.id} to="/produtos/$id" params={{ id: p.id }} className="block">
                    <Card className={`p-3.5 ${p.ativo ? "" : "opacity-60"}`}>
                      <div className="flex justify-between gap-2">
                        <div className="min-w-0">
                          <div className="truncate font-semibold">{p.nome}</div>
                          <div className="text-xs text-muted-foreground">{p.categoria}{!p.ativo && " · inativo"}</div>
                        </div>
                        <div className="text-right font-semibold">{brl(preco)}</div>
                      </div>
                      <div className="mt-2 grid grid-cols-3 text-xs">
                        <div><div className="text-muted-foreground">Custo un.</div>{brl(c)}</div>
                        <div><div className="text-muted-foreground">Lucro un.</div><span className={lucro >= 0 ? "text-success" : "text-destructive"}>{brl(lucro)}</span></div>
                        <div><div className="text-muted-foreground">Margem</div>{pct(margemReal(c, preco))}</div>
                      </div>
                    </Card>
                  </Link>
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
  const [novo, setNovo] = useState({ nome: "", tipo: "ingrediente", unidade: "kg", preco: "" });
  const [precos, setPrecos] = useState<Record<string, string>>({});

  async function adicionar(e: React.FormEvent) {
    e.preventDefault();
    if (!novo.nome.trim()) return toast.error("Informe o nome do insumo.");
    const { error } = await supabase.from("insumos").insert({ nome: novo.nome.trim(), tipo: novo.tipo, unidade: novo.unidade, preco_unidade: parseNum(novo.preco) });
    if (error) return toast.error(error.message);
    setNovo({ ...novo, nome: "", preco: "" });
    qc.invalidateQueries({ queryKey: ["insumos"] });
    toast.success("Insumo adicionado!");
  }

  async function atualizarPreco(i: Insumo) {
    const v = precos[i.id];
    if (v === undefined || parseNum(v) === Number(i.preco_unidade)) return;
    const { error } = await supabase.from("insumos").update({ preco_unidade: parseNum(v) }).eq("id", i.id);
    if (error) return toast.error(error.message);
    await qc.invalidateQueries({ queryKey: ["insumos"] });
    toast.success(`Preço de ${i.nome} atualizado — custos recalculados.`);
  }

  async function excluir(i: Insumo) {
    if (!confirm(`Excluir ${i.nome}?`)) return;
    const { error } = await supabase.from("insumos").delete().eq("id", i.id);
    if (error) return toast.error(error.message.includes("foreign") ? "Este insumo está em uma receita. Remova-o da receita primeiro." : error.message);
    qc.invalidateQueries({ queryKey: ["insumos"] });
  }

  return (
    <>
      <Card className="mb-4">
        <form onSubmit={adicionar} className="space-y-3">
          <h2 className="font-semibold">Novo insumo</h2>
          <Input placeholder="Ex.: Farinha de trigo, Caixa de bolo, Ovos" value={novo.nome} onChange={(e) => setNovo({ ...novo, nome: e.target.value })} className="h-11" />
          <div className="grid grid-cols-3 gap-2">
            <Field label="Tipo">
              <NativeSelect value={novo.tipo} onChange={(e) => setNovo({ ...novo, tipo: e.target.value })}>
                <option value="ingrediente">Ingrediente</option>
                <option value="embalagem">Embalagem</option>
              </NativeSelect>
            </Field>
            <Field label="Unidade">
              <NativeSelect value={novo.unidade} onChange={(e) => setNovo({ ...novo, unidade: e.target.value })}>
                {UNIDADES.map((u) => <option key={u}>{u}</option>)}
              </NativeSelect>
            </Field>
            <Field label="R$ / unid.">
              <Input inputMode="decimal" value={novo.preco} onChange={(e) => setNovo({ ...novo, preco: e.target.value })} className="h-11" placeholder="0,00" />
            </Field>
          </div>
          <Button className="h-11 w-full"><Plus className="size-4" /> Adicionar</Button>
        </form>
      </Card>
      {insumos.length === 0 ? (
        <Empty>Nenhum insumo cadastrado.</Empty>
      ) : (
        <div className="space-y-2">
          {insumos.map((i) => (
            <Card key={i.id} className="flex items-center gap-2 p-3">
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium">{i.nome}</div>
                <div className="text-xs text-muted-foreground">{i.tipo === "embalagem" ? "Embalagem" : "Ingrediente"} · por {i.unidade}</div>
              </div>
              <div className="relative w-28">
                <span className="absolute top-2.5 left-2 text-xs text-muted-foreground">R$</span>
                <Input
                  inputMode="decimal"
                  aria-label={`Preço de ${i.nome}`}
                  className="h-10 pl-7 text-right"
                  value={precos[i.id] ?? String(Number(i.preco_unidade)).replace(".", ",")}
                  onChange={(e) => setPrecos({ ...precos, [i.id]: e.target.value })}
                  onBlur={() => atualizarPreco(i)}
                />
              </div>
              <Button size="icon" variant="ghost" onClick={() => excluir(i)} aria-label="Excluir">
                <Trash2 className="size-4 text-destructive" />
              </Button>
            </Card>
          ))}
          <p className="pt-1 text-center text-xs text-muted-foreground">Altere o preço e toque fora do campo para salvar.</p>
        </div>
      )}
    </>
  );
}
