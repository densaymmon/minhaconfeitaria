import * as appQueries from "@/lib/queries";
import { createFileRoute } from "@tanstack/react-router";
import { useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Plus, Trash2, ShoppingCart } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { brl, dataBR, hojeISO } from "@/lib/format";
import { medidaLabel, medidasCompativeis, numeroIngrediente } from "@/lib/ingredient-cost";
import { Card, Empty, Field, PageHeader } from "@/components/app/ui";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/compras")({
  loader: async ({ context }) => {
    await Promise.all([
      context.queryClient.ensureQueryData(appQueries.insumosQ),
      context.queryClient.ensureQueryData(appQueries.comprasQ),
      context.queryClient.ensureQueryData(appQueries.compraItensQ),
    ]);
  },
  errorComponent: ({ error }) => <p role="alert" className="py-8 text-destructive">{error instanceof Error ? error.message : "Não foi possível carregar as compras."}</p>,
  head: () => ({
    meta: [
      { title: "Compras de insumos — Doce Gestão" },
      { name: "description", content: "Registro de compras de insumos e gastos por período." },
      { property: "og:title", content: "Compras de insumos — Doce Gestão" },
      { property: "og:description", content: "Registro de compras de insumos e gastos por período." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Compras,
});

const MEDIDAS_COMPRA = ["g", "kg", "L", "un"] as const;
type Linha = { compraItemId?: string; insumo_id: string; quantidade: string; unidade: string; preco: string };
const linhaVazia = (): Linha => ({ insumo_id: "", quantidade: "", unidade: "un", preco: "" });

// Nunca permita que valores numéricos inválidos vindos do banco apareçam como "NaN"
// em campos controlados; valores ausentes permanecem vazios e editáveis.
function textoCampoNumerico(valor: unknown): string {
  if (typeof valor === "number") return Number.isFinite(valor) ? String(valor) : "";
  if (typeof valor !== "string") return "";
  return ["NaN", "Infinity", "-Infinity", "undefined", "null"].includes(valor.trim()) ? "" : valor;
}

function precoInicial(insumo: { preco_embalagem?: number | null; preco_unidade: number } | undefined): string {
  if (!insumo) return "";
  const valor = insumo.preco_embalagem ?? insumo.preco_unidade;
  if (valor == null) return "";
  const texto = String(valor);
  return Number.isFinite(numeroIngrediente(texto)) ? texto : "";
}

function Compras() {
  const { data: insumos } = useSuspenseQuery(appQueries.insumosQ);
  const { data: compras } = useSuspenseQuery(appQueries.comprasQ);
  const { data: itens } = useSuspenseQuery(appQueries.compraItensQ);
  const qc = useQueryClient();
  const [data, setData] = useState(hojeISO());
  const [linhas, setLinhas] = useState<Linha[]>([linhaVazia()]);
  const [busy, setBusy] = useState(false);
  const [editandoCompraId, setEditandoCompraId] = useState<string | null>(null);
  const [de, setDe] = useState("");
  const [ate, setAte] = useState("");

  // Only the four measures the owner asked for, and only those that match the insumo's package.
  const unidadesPara = (insumoId: string) => {
    const ins = insumos.find((i) => i.id === insumoId);
    const opcoes = medidasCompativeis(ins?.unidade_embalagem ?? ins?.unidade ?? "un").filter((u) => (MEDIDAS_COMPRA as readonly string[]).includes(u));
    return opcoes.length ? opcoes : [...MEDIDAS_COMPRA];
  };

  const calculadas = linhas.map((l) => {
    const insumo = insumos.find((i) => i.id === l.insumo_id);
    const quantidade = numeroIngrediente(l.quantidade);
    const preco = numeroIngrediente(l.preco);
    return { ...l, insumo, quantidade, preco, total: quantidade * preco };
  });
  const total = calculadas.reduce((s, l) => s + (Number.isFinite(l.total) ? l.total : 0), 0);

  const noPeriodo = (iso: string) => (!de || iso >= de) && (!ate || iso <= ate);
  const comprasNoPeriodo = compras.filter((c) => noPeriodo(c.data_compra));
  const idsNoPeriodo = new Set(comprasNoPeriodo.map((c) => c.id));
  const itensNoPeriodo = itens.filter((i) => idsNoPeriodo.has(i.compra_id));
  const totalPeriodo = itensNoPeriodo.reduce((s, i) => s + Number(i.total), 0);

  const porInsumo = useMemo(() => {
    const m = new Map<string, { id: string; nome: string; total: number; quantidade: number; unidade: string }>();
    for (const it of itensNoPeriodo) {
      const nome = insumos.find((i) => i.id === it.insumo_id)?.nome ?? "Insumo removido";
      const atual = m.get(it.insumo_id) ?? { id: it.insumo_id, nome, total: 0, quantidade: 0, unidade: it.unidade };
      m.set(it.insumo_id, { ...atual, total: atual.total + Number(it.total), quantidade: atual.quantidade + Number(it.quantidade) });
    }
    return [...m.values()].sort((a, b) => b.total - a.total);
  }, [itensNoPeriodo, insumos]);

  function escolherInsumo(index: number, id: string) {
    const ins = insumos.find((i) => i.id === id);
    const unidade = unidadesPara(id)[0] ?? "un";
    setLinhas((s) => s.map((l, j) => (j === index ? { ...l, insumo_id: id, unidade, preco: Number.isFinite(numeroIngrediente(l.preco)) ? l.preco : precoInicial(ins) } : l)));
  }

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    if (!data) { toast.error("Informe a data da compra."); return; }
    if (calculadas.some((l) => !l.insumo || !Number.isFinite(l.quantidade) || l.quantidade <= 0 || !Number.isFinite(l.preco) || l.preco < 0)) {
      toast.error("Selecione um insumo e confira a quantidade e o preço de cada item.");
      return;
    }
    if (total <= 0) { toast.error("O total da compra precisa ser maior que zero."); return; }
    setBusy(true);
    let compraId: string | null = null;
    try {
      if (editandoCompraId) {
        const { error: erroCompra } = await supabase.from("compras").update({ data_compra: data }).eq("id", editandoCompraId);
        if (erroCompra) throw erroCompra;
        for (const l of calculadas) {
          const valores = { insumo_id: l.insumo!.id, quantidade: l.quantidade, unidade: l.unidade, preco_unitario: l.preco };
          if (l.compraItemId) {
            const { error } = await supabase.from("compra_itens").update(valores).eq("id", l.compraItemId).eq("compra_id", editandoCompraId);
            if (error) throw error;
          } else {
            const { error } = await supabase.from("compra_itens").insert({ ...valores, compra_id: editandoCompraId });
            if (error) throw error;
          }
        }
        const idsMantidos = new Set(linhas.map((l) => l.compraItemId).filter(Boolean));
        const removidos = itens.filter((i) => i.compra_id === editandoCompraId && !idsMantidos.has(i.id));
        if (removidos.length) {
          const { error } = await supabase.from("compra_itens").delete().in("id", removidos.map((i) => i.id)).eq("compra_id", editandoCompraId);
          if (error) throw error;
        }
      } else {
        const { data: compra, error: erroCompra } = await supabase.from("compras").insert({ data_compra: data }).select("id").single();
        if (erroCompra) throw erroCompra;
        compraId = compra.id;
        const { error: erroItens } = await supabase.from("compra_itens").insert(
          calculadas.map((l) => ({ compra_id: compra.id, insumo_id: l.insumo!.id, quantidade: l.quantidade, unidade: l.unidade, preco_unitario: l.preco })),
        );
        if (erroItens) throw erroItens;
      }
      await Promise.all([qc.invalidateQueries({ queryKey: ["compras"] }), qc.invalidateQueries({ queryKey: ["compra-itens"] })]);
      setData(hojeISO());
      setLinhas([linhaVazia()]);
      setEditandoCompraId(null);
      toast.success(editandoCompraId ? "Compra atualizada." : "Compra registrada.");
    } catch (erro) {
      if (compraId) await supabase.from("compras").delete().eq("id", compraId);
      toast.error(erro instanceof Error ? erro.message : "Não foi possível salvar a compra.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageHeader title="Compras de insumos" back="/mais" />
      <form onSubmit={salvar} className="mb-8 space-y-4">
        <h2 className="text-lg font-semibold">{editandoCompraId ? "Editar compra" : "Registrar compra"}</h2>
        <Field label="Data da compra">
          <Input required type="date" className="h-11" value={data} onChange={(e) => setData(e.target.value)} />
        </Field>
        <div className="space-y-3">
          {calculadas.map((l, index) => (
            <div key={index} className="space-y-3 rounded-xl border p-3">
              <div className="flex items-center justify-between">
                <h3 className="font-medium">Item {index + 1}</h3>
                {linhas.length > 1 && (
                  <Button type="button" variant="ghost" size="icon" onClick={() => setLinhas((s) => s.filter((_, j) => j !== index))} aria-label="Remover item">
                    <Trash2 className="size-4 text-destructive" />
                  </Button>
                )}
              </div>
              <Field label="Insumo">
                <select required value={l.insumo_id} onChange={(e) => escolherInsumo(index, e.target.value)} className="h-11 w-full rounded-md border border-input bg-background px-3 text-sm">
                  <option value="">Selecione um insumo</option>
                  {insumos.map((i) => <option key={i.id} value={i.id}>{i.nome}</option>)}
                </select>
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Quantidade">
                  <Input required inputMode="decimal" className="h-11" value={textoCampoNumerico(l.quantidade)} onChange={(e) => setLinhas((s) => s.map((x, j) => (j === index ? { ...x, quantidade: e.target.value } : x)))} />
                </Field>
                <Field label="Medida">
                  <select value={l.unidade} onChange={(e) => setLinhas((s) => s.map((x, j) => (j === index ? { ...x, unidade: e.target.value } : x)))} className="h-11 w-full rounded-md border border-input bg-background px-3 text-sm">
                    {unidadesPara(l.insumo_id).map((u) => <option key={u} value={u}>{medidaLabel(u)}</option>)}
                  </select>
                </Field>
              </div>
              <Field label="Preço de cada item (R$)">
                <Input required inputMode="decimal" className="h-11" value={textoCampoNumerico(l.preco)} onChange={(e) => setLinhas((s) => s.map((x, j) => (j === index ? { ...x, preco: e.target.value } : x)))} />
              </Field>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Total do item</span>
                <b>{Number.isFinite(l.total) ? brl(l.total) : "—"}</b>
              </div>
            </div>
          ))}
          <Button type="button" variant="outline" className="w-full" onClick={() => setLinhas((s) => [...s, linhaVazia()])}>
            <Plus className="size-4" /> Adicionar insumo
          </Button>
        </div>
        <div className="flex items-center justify-between rounded-lg bg-muted p-3">
          <span className="font-medium">Total da compra</span>
          <span className="text-lg font-bold">{brl(total)}</span>
        </div>
        <Button disabled={busy || !insumos.length} className="h-11 w-full">{busy ? "Salvando compra..." : editandoCompraId ? "Salvar alterações" : "Salvar compra"}</Button>
        {editandoCompraId && <Button type="button" variant="outline" className="h-11 w-full" onClick={() => { setEditandoCompraId(null); setData(hojeISO()); setLinhas([linhaVazia()]); }}>Cancelar edição</Button>}
        {!insumos.length && <p className="text-sm text-muted-foreground">Cadastre primeiro os insumos em Produtos e receitas.</p>}
      </form>

      <section className="mb-8">
        <h2 className="mb-3 flex items-center gap-2 text-lg font-semibold"><ShoppingCart className="size-5" /> Gastos por período</h2>
        <div className="mb-3 grid grid-cols-2 gap-3">
          <Field label="De"><Input type="date" className="h-10" value={de} max={ate || undefined} onChange={(e) => setDe(e.target.value)} /></Field>
          <Field label="Até"><Input type="date" className="h-10" value={ate} min={de || undefined} onChange={(e) => setAte(e.target.value)} /></Field>
        </div>
        {(de || ate) && (
          <button type="button" className="mb-3 text-sm text-primary" onClick={() => { setDe(""); setAte(""); }}>Limpar período</button>
        )}
        <Card className="mb-3 p-3">
          <div className="text-sm text-muted-foreground">Total comprado no período</div>
          <div className="mt-1 font-display text-2xl font-semibold">{brl(totalPeriodo)}</div>
          <div className="mt-1 text-xs text-muted-foreground">{comprasNoPeriodo.length} compra(s)</div>
        </Card>
        {porInsumo.length === 0 ? (
          <Empty>Nenhuma compra no período.</Empty>
        ) : (
          <div className="divide-y">
            {porInsumo.map((r) => (
              <div key={r.id} className="flex items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <p className="font-medium">{r.nome}</p>
                  <p className="text-xs text-muted-foreground">{r.quantidade.toLocaleString("pt-BR", { maximumFractionDigits: 4 })} {medidaLabel(r.unidade)}</p>
                </div>
                <b>{brl(r.total)}</b>
              </div>
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold">Histórico de compras</h2>
        {comprasNoPeriodo.length === 0 ? (
          <Empty>Nenhuma compra registrada.</Empty>
        ) : (
          <div className="divide-y">
            {comprasNoPeriodo.map((c) => {
              const doDia = itensNoPeriodo.filter((i) => i.compra_id === c.id);
              return (
                <div key={c.id} className="py-3">
                  <div className="flex items-center justify-between gap-3">
                    <p className="font-medium">{dataBR(c.data_compra)}</p>
                    <div className="flex items-center gap-3">
                      <b>{brl(Number(c.total))}</b>
                      <Button type="button" variant="outline" size="sm" onClick={() => {
                        const itensCompra = itens.filter((i) => i.compra_id === c.id);
                        setData(c.data_compra);
                        setLinhas(itensCompra.map((i) => ({ compraItemId: i.id, insumo_id: i.insumo_id, quantidade: String(i.quantidade), unidade: i.unidade, preco: String(i.preco_unitario) })));
                        setEditandoCompraId(c.id);
                      }}>Editar</Button>
                    </div>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {doDia.map((i) => `${i.quantidade.toLocaleString("pt-BR", { maximumFractionDigits: 3 })} ${medidaLabel(i.unidade)} de ${insumos.find((x) => x.id === i.insumo_id)?.nome ?? "insumo removido"}`).join(" · ") || "Sem itens"}
                  </p>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </>
  );
}
