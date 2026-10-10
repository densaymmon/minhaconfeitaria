import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useCustos } from "@/lib/hooks";
import { custoReceita, margemReal, precoSugerido } from "@/lib/calc";
import { CATEGORIAS, brl, parseNum, pct } from "@/lib/format";
import { Card, Field, NativeSelect, PageHeader, Row } from "@/components/app/ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";

export const Route = createFileRoute("/_authenticated/produtos/$id")({
  head: () => ({
    meta: [
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { title: "Produto e receita — Doce Gestão" },
      { name: "description", content: "Receita, custos e precificação do produto." },
      { property: "og:title", content: "Produto e receita — Doce Gestão" },
      { property: "og:description", content: "Receita, custos e precificação do produto." },
    ],
  }),
  component: ProdutoForm,
});

function ProdutoForm() {
  const { id } = Route.useParams();
  const novo = id === "novo";
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { produtos, insumos, mapIns } = useCustos();
  const p = novo ? undefined : produtos.find((x) => x.id === id);

  const [f, setF] = useState(() => ({
    nome: p?.nome ?? "",
    categoria: p?.categoria ?? "Bolos caseiros",
    rendimento: String(p?.rendimento ?? "1"),
    custo_gas: String(p?.custo_gas ?? "0"),
    custo_energia: String(p?.custo_energia ?? "0"),
    custo_mao_obra: String(p?.custo_mao_obra ?? "0"),
    preco_venda: String(p?.preco_venda ?? "0"),
    margem_desejada: String(p?.margem_desejada ?? "100"),
    modo_preparo: p?.modo_preparo ?? "",
    ativo: p?.ativo ?? true,
  }));
  const [itens, setItens] = useState(() => p?.receita_itens.map((i) => ({ insumo_id: i.insumo_id, quantidade: String(i.quantidade) })) ?? []);
  const [salvando, setSalvando] = useState(false);

  if (!novo && !p) return <p className="py-16 text-center text-muted-foreground">Produto não encontrado. <Link to="/produtos" className="text-primary">Voltar</Link></p>;

  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((s) => ({ ...s, [k]: v }));
  const prodNum = {
    rendimento: parseNum(f.rendimento) || 1,
    custo_gas: parseNum(f.custo_gas),
    custo_energia: parseNum(f.custo_energia),
    custo_mao_obra: parseNum(f.custo_mao_obra),
  };
  const itensNum = itens.filter((i) => i.insumo_id).map((i) => ({ insumo_id: i.insumo_id, quantidade: parseNum(i.quantidade) }));
  const cr = custoReceita(prodNum, itensNum, mapIns);
  const unit = cr.total / prodNum.rendimento;
  const sugerido = precoSugerido(unit, parseNum(f.margem_desejada));
  const preco = parseNum(f.preco_venda);

  async function salvar() {
    if (!f.nome.trim()) return void toast.error("Informe o nome do produto.");
    setSalvando(true);
    try {
      const payload = {
        nome: f.nome.trim(),
        categoria: f.categoria,
        ...prodNum,
        preco_venda: preco,
        margem_desejada: parseNum(f.margem_desejada),
        modo_preparo: f.modo_preparo.trim() || null,
        ativo: f.ativo,
      };
      let pid = p?.id;
      if (pid) {
        const { error } = await supabase.from("produtos").update(payload).eq("id", pid);
        if (error) throw error;
        const { error: e2 } = await supabase.from("receita_itens").delete().eq("produto_id", pid);
        if (e2) throw e2;
      } else {
        const { data, error } = await supabase.from("produtos").insert(payload).select("id").single();
        if (error) throw error;
        pid = data.id;
      }
      if (itensNum.length) {
        const { error } = await supabase.from("receita_itens").insert(itensNum.map((i) => ({ ...i, produto_id: pid ?? "" })));
        if (error) throw error;
      }
      await qc.invalidateQueries({ queryKey: ["produtos"] });
      toast.success("Produto salvo!");
      navigate({ to: "/produtos" });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSalvando(false);
    }
  }

  async function excluir() {
    if (!p || !confirm(`Excluir ${p.nome}? Pedidos antigos continuam com o nome do item.`)) return;
    const { error } = await supabase.from("produtos").delete().eq("id", p.id);
    if (error) return void toast.error(error.message);
    await qc.invalidateQueries({ queryKey: ["produtos"] });
    navigate({ to: "/produtos" });
  }

  return (
    <>
      <PageHeader title={novo ? "Novo produto" : p?.nome ?? "Produto"} back="/produtos" />
      <div className="space-y-4">
        <Card className="space-y-3">
          <Field label="Nome do produto">
            <Input value={f.nome} onChange={(e) => set("nome", e.target.value)} className="h-11" placeholder="Ex.: Bolo de cenoura com chocolate" />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Categoria">
              <NativeSelect value={f.categoria} onChange={(e) => set("categoria", e.target.value)}>
                {CATEGORIAS.map((c) => <option key={c}>{c}</option>)}
              </NativeSelect>
            </Field>
            <Field label="Rendimento (unid.)" hint="Quantas unidades a receita rende">
              <Input inputMode="decimal" value={f.rendimento} onChange={(e) => set("rendimento", e.target.value)} className="h-11" />
            </Field>
          </div>
          <label className="flex items-center justify-between">
            <span className="text-sm font-medium">Produto ativo (aparece nos pedidos)</span>
            <Switch checked={f.ativo} onCheckedChange={(v) => set("ativo", v)} />
          </label>
        </Card>

        <Card className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Ingredientes e embalagens</h2>
            <Button size="sm" variant="outline" disabled={insumos.length === 0} onClick={() => setItens((s) => [...s, { insumo_id: insumos[0]?.id ?? "", quantidade: "" }])}>
              <Plus className="size-4" /> Insumo
            </Button>
          </div>
          {insumos.length === 0 && (
            <p className="text-sm text-muted-foreground">
              Cadastre os insumos primeiro na aba <Link to="/produtos" className="text-primary">Insumos</Link>.
            </p>
          )}
          {itens.map((it, i) => {
            const ins = mapIns.get(it.insumo_id);
            const meta = insumos.find((x) => x.id === it.insumo_id);
            return (
              <div key={i} className="flex items-end gap-2">
                <div className="flex-1">
                  <NativeSelect value={it.insumo_id} onChange={(e) => setItens((s) => s.map((x, j) => (j === i ? { ...x, insumo_id: e.target.value } : x)))}>
                    {insumos.map((x) => <option key={x.id} value={x.id}>{x.nome}</option>)}
                  </NativeSelect>
                  <div className="mt-0.5 text-[11px] text-muted-foreground">
                    {brl(parseNum(it.quantidade) * (ins?.preco_unidade ?? 0))}
                  </div>
                </div>
                <div className="w-24">
                  <Input
                    inputMode="decimal"
                    placeholder={meta?.unidade}
                    value={it.quantidade}
                    onChange={(e) => setItens((s) => s.map((x, j) => (j === i ? { ...x, quantidade: e.target.value } : x)))}
                    className="h-11"
                    aria-label="Quantidade"
                  />
                  <div className="mt-0.5 text-center text-[11px] text-muted-foreground">{meta?.unidade}</div>
                </div>
                <Button size="icon" variant="ghost" className="mb-5" onClick={() => setItens((s) => s.filter((_, j) => j !== i))} aria-label="Remover">
                  <Trash2 className="size-4 text-destructive" />
                </Button>
              </div>
            );
          })}
          <p className="text-xs text-muted-foreground">Informe a quantidade na mesma unidade do insumo (ex.: 0,5 kg de farinha).</p>
        </Card>

        <Card className="space-y-3">
          <h2 className="text-lg font-semibold">Custos da receita (lote)</h2>
          <div className="grid grid-cols-3 gap-2">
            <Field label="Gás R$"><Input inputMode="decimal" value={f.custo_gas} onChange={(e) => set("custo_gas", e.target.value)} className="h-11" /></Field>
            <Field label="Energia R$"><Input inputMode="decimal" value={f.custo_energia} onChange={(e) => set("custo_energia", e.target.value)} className="h-11" /></Field>
            <Field label="Mão de obra R$"><Input inputMode="decimal" value={f.custo_mao_obra} onChange={(e) => set("custo_mao_obra", e.target.value)} className="h-11" /></Field>
          </div>
        </Card>

        <Card className="space-y-3">
          <h2 className="text-lg font-semibold">Precificação</h2>
          <Row label="Ingredientes e embalagens" value={brl(cr.ingredientes)} />
          <Row label="Gás, energia e mão de obra" value={brl(cr.operacionais)} />
          <Row label="Custo total da receita" value={brl(cr.total)} strong />
          <Row label={`Custo por unidade (÷ ${prodNum.rendimento})`} value={brl(unit)} strong />
          <div className="grid grid-cols-2 gap-3 pt-2">
            <Field label="Margem desejada %">
              <Input inputMode="decimal" value={f.margem_desejada} onChange={(e) => set("margem_desejada", e.target.value)} className="h-11" />
            </Field>
            <Field label="Preço de venda R$">
              <Input inputMode="decimal" value={f.preco_venda} onChange={(e) => set("preco_venda", e.target.value)} className="h-11" />
            </Field>
          </div>
          <button type="button" className="w-full rounded-xl bg-accent p-3 text-left text-sm text-accent-foreground" onClick={() => set("preco_venda", sugerido.toFixed(2))}>
            Preço sugerido: <b>{brl(sugerido)}</b> — toque para usar
          </button>
          <Row label="Lucro bruto por unidade" value={brl(preco - unit)} tone={preco - unit >= 0 ? "success" : "danger"} strong />
          <Row label="Margem real sobre o custo" value={pct(margemReal(unit, preco))} />
          <Row label="Lucro da receita inteira" value={brl((preco - unit) * prodNum.rendimento)} />
        </Card>

        <Card>
          <Field label="Modo de preparo / anotações">
            <Textarea rows={3} value={f.modo_preparo} onChange={(e) => set("modo_preparo", e.target.value)} />
          </Field>
        </Card>

        <div className="flex gap-2">
          {!novo && (
            <Button variant="outline" className="h-12 text-destructive" onClick={excluir}><Trash2 className="size-4" /></Button>
          )}
          <Button className="h-12 flex-1 text-base" onClick={salvar} disabled={salvando}>{salvando ? "Salvando..." : "Salvar produto"}</Button>
        </div>
      </div>
    </>
  );
}
