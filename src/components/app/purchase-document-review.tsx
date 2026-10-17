import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Field } from "./ui";
import { Trash2 } from "lucide-react";
import { brl } from "@/lib/format";
import { numeroIngrediente } from "@/lib/ingredient-cost";
import { reviewDocument, type DocumentLine, type IngredientMatch, type PurchaseDocument } from "@/lib/purchase-document";

const numeric = (s: string) => { const value = numeroIngrediente(s); return Number.isFinite(value) ? value : null; };
function NumberField({ label, value, change }: { label: string; value: number | null; change: (v: number | null) => void }) {
  return <Field label={label}><Input aria-label={label} type="text" inputMode="decimal" value={value === null ? "" : String(value)} onChange={(e) => change(numeric(e.target.value))} /></Field>;
}
export function PurchaseDocumentReview({ document, ingredients, change, disabled }: { document: PurchaseDocument; ingredients: IngredientMatch[]; change: (doc: PurchaseDocument) => void; disabled: boolean }) {
  const review = reviewDocument(document, ingredients);
  const lineChange = (id: string, patch: Partial<DocumentLine>) => change({ ...document, linhas: document.linhas.map((l) => l.id === id ? { ...l, ...patch } : l) });
  return <fieldset disabled={disabled} className="mt-4 space-y-4">
    <div className="grid gap-3 sm:grid-cols-2">
      <Field label="Fornecedor"><Input aria-label="Fornecedor" maxLength={120} value={document.fornecedor} onChange={(e) => change({ ...document, fornecedor: e.target.value })} /></Field>
      <Field label="Data do documento"><Input aria-label="Data do documento" type="date" value={document.data} onChange={(e) => change({ ...document, data: e.target.value })} /></Field>
      <Field label="Número do documento"><Input aria-label="Número do documento" value={document.numero} onChange={(e) => change({ ...document, numero: e.target.value })} /></Field>
      <NumberField label="Total do documento (R$)" value={document.total} change={(total) => change({ ...document, total })} />
      <NumberField label="Desconto geral (R$)" value={document.desconto} change={(desconto) => change({ ...document, desconto })} />
      <NumberField label="Outras despesas (R$)" value={document.despesas} change={(despesas) => change({ ...document, despesas })} />
    </div>
    {document.chave && <p className="break-all text-xs text-muted-foreground">Chave: {document.chave}</p>}
    {document.duvidas.map((d, i) => <p key={i} role="alert" className="text-sm text-destructive">{d}</p>)}
    {document.linhas.map((line, index) => <div key={line.id} className="space-y-3 rounded-lg border p-3">
      <div className="flex items-center justify-between"><h3 className="font-medium">Item {index + 1}</h3><Button type="button" variant="ghost" size="icon" aria-label={line.ignorar ? `Incluir item ${index + 1}` : `Ignorar item ${index + 1}`} onClick={() => lineChange(line.id, { ignorar: !line.ignorar })}><Trash2 className="size-4" /></Button></div>
      {line.ignorar ? <p className="text-sm text-muted-foreground">Item ignorado</p> : <>
        <Field label="Descrição"><Input aria-label={`Descrição item ${index + 1}`} value={line.nome} maxLength={120} onChange={(e) => lineChange(line.id, { nome: e.target.value, insumoId: "" })} /></Field>
        <div className="grid grid-cols-2 gap-3">
          <NumberField label={`Quantidade item ${index + 1}`} value={line.quantidade} change={(quantidade) => lineChange(line.id, { quantidade })} />
          <Field label="Unidade"><select aria-label={`Unidade item ${index + 1}`} value={line.unidade} onChange={(e) => lineChange(line.id, { unidade: e.target.value, insumoId: "" })} className="h-11 w-full rounded-md border border-input bg-background px-3 text-sm"><option value="">Revisar</option>{["g", "kg", "L", "ml", "un"].map((u) => <option key={u}>{u}</option>)}</select></Field>
          <NumberField label={`Valor unitário item ${index + 1}`} value={line.unitario} change={(unitario) => lineChange(line.id, { unitario })} />
          <NumberField label={`Desconto item ${index + 1}`} value={line.desconto} change={(desconto) => lineChange(line.id, { desconto })} />
          <NumberField label={`Total líquido item ${index + 1}`} value={line.total} change={(total) => lineChange(line.id, { total })} />
        </div>
        <Field label="Vincular ao cadastro"><select aria-label={`Vincular item ${index + 1}`} value={line.insumoId} onChange={(e) => lineChange(line.id, { insumoId: e.target.value })} className="h-11 w-full rounded-md border border-input bg-background px-3 text-sm"><option value="">Selecione um insumo existente</option>{ingredients.map((i) => <option key={i.id} value={i.id}>{i.nome}</option>)}<option value="__novo__" disabled={!line.unidade}>Cadastrar novo insumo após confirmação</option></select></Field>
        {line.insumoId === "__novo__" && <p className="text-sm text-muted-foreground">Novo cadastro: {line.nome}. Será criado somente ao confirmar os insumos.</p>}
        {(line.quantidade === null || line.total === null || !line.nome || !line.unidade) && <p role="alert" className="text-sm text-destructive">Dados ausentes: preencha os campos antes de confirmar.</p>}
        {line.duvidas.map((d, i) => <p key={i} className="text-xs text-destructive">{d}</p>)}
      </>}
    </div>)}
    <p className="font-semibold">Total dos itens selecionados: {brl(review.sum)}</p>
    {review.divergence && <p role="alert" className="text-sm text-destructive">{document.total === null ? "Total da nota não identificado." : `A soma dos itens (${brl(review.sum)}) difere do total da nota (${brl(document.total)}).`} Confira descontos e despesas nos totais líquidos dos itens; nenhum rateio será feito automaticamente.</p>}
    {!!review.itemDivergences.length && <p role="alert" className="text-sm text-destructive">Quantidade × valor unitário − desconto difere do total em {review.itemDivergences.length} item(ns).</p>}
    {review.errors.map((error, i) => <p key={i} className="text-sm text-destructive">{error}</p>)}
  </fieldset>;
}