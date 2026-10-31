import { useState } from "react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Insumo } from "@/lib/queries";
import { MEDIDAS, custoPorMedida, medidaLabel } from "@/lib/ingredient-cost";
import { brl } from "@/lib/format";
import { Field, NativeSelect } from "./ui";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Save, Plus } from "lucide-react";

// Parse decimals without converting intermediate input (for example "12," or "12.")
// into NaN or changing the text while the user is typing.
function parseCampoDecimal(valor: string): number {
  const texto = valor.trim().replace(/\s/g, "");
  if (!texto || /^[+-]?(?:\d+[.,]|[.,])$/.test(texto)) return NaN;
  if (!/^[+-]?[\d.,]+$/.test(texto)) return NaN;
  const ultimaVirgula = texto.lastIndexOf(",");
  const ultimoPonto = texto.lastIndexOf(".");
  let normalizado = texto;
  if (ultimaVirgula >= 0 && ultimoPonto >= 0) {
    const decimal = ultimaVirgula > ultimoPonto ? "," : ".";
    const milhar = decimal === "," ? /\./g : /,/g;
    normalizado = texto.replace(milhar, "").replace(decimal, ".");
  } else if (ultimaVirgula >= 0) {
    normalizado = texto.replace(",", ".");
  }
  const numero = Number(normalizado);
  return Number.isFinite(numero) ? numero : NaN;
}

export function IngredientForm({ insumo, onDone, onSaved }: {
  insumo?: Insumo;
  onDone?: () => void;
  /** Chamado só ao criar um insumo novo, depois de salvo, com o id e a unidade da embalagem. */
  onSaved?: (criado: { id: string; unidade_embalagem: string }) => void;
}) {
  const qc = useQueryClient();
  const [f, setF] = useState({ nome: insumo?.nome ?? "", tipo: insumo?.tipo ?? "ingrediente", preco: String(insumo?.preco_embalagem ?? insumo?.preco_unidade ?? ""), quantidade: String(insumo?.quantidade_embalagem ?? "1"), unidade: insumo?.unidade_embalagem ?? insumo?.unidade ?? "kg", alergenos: insumo?.alergenos ?? "" });
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f, v: string) => setF((s) => ({ ...s, [k]: v }));
  const preco = parseCampoDecimal(f.preco), quantidade = parseCampoDecimal(f.quantidade);
  let unitario: ReturnType<typeof custoPorMedida> | null = null;
  try { unitario = custoPorMedida({ preco_unidade: 0, preco_embalagem: preco, quantidade_embalagem: quantidade, unidade_embalagem: f.unidade }); } catch { /* invalid pending input */ }
  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    if (!f.nome.trim() || f.nome.trim().length > 120 || !unitario) return void toast.error("Confira o nome, o preço e a quantidade da embalagem (maior que zero).");
    setBusy(true);
    const payload = { nome: f.nome.trim(), tipo: f.tipo, preco_embalagem: preco, quantidade_embalagem: quantidade, unidade_embalagem: f.unidade, alergenos: f.alergenos.trim().slice(0, 120) || null, ...(insumo ? {} : { unidade: f.unidade }) };
    try {
      let criadoId: string | null = null;
      if (insumo) {
        const { error } = await supabase.from("insumos").update(payload).eq("id", insumo.id);
        if (error) throw error;
      } else {
        const { data, error } = await supabase.from("insumos").insert(payload).select("id").single();
        if (error) throw error;
        criadoId = data.id;
      }
      await Promise.all([qc.invalidateQueries({ queryKey: ["insumos"] }), qc.invalidateQueries({ queryKey: ["produtos"] })]);
      if (!insumo) setF({ nome: "", tipo: "ingrediente", preco: "", quantidade: "1", unidade: "kg", alergenos: "" });
      // Preço mudou: os produtos que usam o ingrediente podem ter ficado com margem baixa.
      toast.success(insumo ? "Ingrediente atualizado; custos das receitas recalculados." : "Insumo adicionado!", insumo && Number(insumo.preco_embalagem) !== preco
        ? { description: "Confira se algum produto ficou com margem baixa.", action: { label: "Ver produtos", onClick: () => { window.location.assign("/produtos"); } } }
        : undefined);
      if (criadoId) onSaved?.({ id: criadoId, unidade_embalagem: payload.unidade_embalagem });
      onDone?.();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Não foi possível salvar o ingrediente."); }
    finally { setBusy(false); }
  }
  // A unidade da embalagem é independente da unidade usada nas receitas.
  // Ao editar um insumo existente, permita trocar entre peso, volume e unidade,
  // assim como no cadastro inicial, em vez de restringir pelas medidas antigas.
  const unidades = MEDIDAS;
  return <form onSubmit={salvar} className="space-y-3">
    <Field label="Nome do ingrediente"><Input required maxLength={120} value={f.nome} onChange={(e) => set("nome", e.target.value)} className="h-11" /></Field>
    <Field label="Tipo"><NativeSelect value={f.tipo} onChange={(e) => set("tipo", e.target.value)}><option value="ingrediente">Ingrediente</option><option value="embalagem">Embalagem</option></NativeSelect></Field>
    <Field label="Preço pago pela embalagem R$"><Input required type="text" inputMode="decimal" lang="pt-BR" autoComplete="off" value={f.preco} onChange={(e) => set("preco", e.currentTarget.value)} className="h-11" /></Field>
    <div className="grid grid-cols-2 gap-3">
      <Field label="Quantidade da embalagem"><Input required type="text" inputMode="decimal" lang="pt-BR" autoComplete="off" value={f.quantidade} onChange={(e) => set("quantidade", e.currentTarget.value)} className="h-11" /></Field>
      <Field label="Unidade da embalagem"><NativeSelect value={f.unidade} onChange={(e) => set("unidade", e.target.value)}>{unidades.map((u) => <option key={u} value={u}>{medidaLabel(u)}</option>)}</NativeSelect></Field>
    </div>
    {f.tipo !== "embalagem" && <Field label="Alergênicos (opcional)" hint="Saem nas etiquetas. Ex.: glúten, leite, ovo, castanhas."><Input maxLength={120} value={f.alergenos} onChange={(e) => set("alergenos", e.target.value)} className="h-11" placeholder="Ex.: glúten" /></Field>}
    {unitario && <p className="text-sm text-muted-foreground">Custo unitário: {brl(unitario.custo)} / {medidaLabel(unitario.unidade)}</p>}
    <Button type="submit" className="h-11 w-full" disabled={busy}>{insumo ? <Save className="size-4" /> : <Plus className="size-4" />}{busy ? "Salvando..." : insumo ? "Salvar ingrediente" : "Adicionar"}</Button>
  </form>;
}