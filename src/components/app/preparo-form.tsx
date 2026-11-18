import { useState } from "react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { Plus, Save, Trash2 } from "lucide-react";
import { supabase } from "@/lib/database-compat";
import type { Insumo } from "@/lib/queries";
import type { PreparoItem } from "@/lib/database-compat";
import type { InsumoLite } from "@/lib/calc";
import { brl } from "@/lib/format";
import { medidaLabel, medidasCompativeis, numeroIngrediente } from "@/lib/ingredient-cost";
import { MEDIDAS_RENDIMENTO, MAX_ITENS_PREPARO, custoDoLote, custoPorPorcao, ehPreparo, preparoParaSalvar, type PreparoEditavel } from "@/lib/preparos";
import { Field, NativeSelect } from "./ui";
import { NOVO_INGREDIENTE, NovoInsumoDialog } from "./novo-insumo-dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

/**
 * Cadastro de um preparo (recheio, cobertura, calda...): ingredientes + quanto a receita rende.
 * Depois ele aparece na lista de ingredientes das receitas e das variações; usar 100 g de um
 * preparo que rende 500 g soma 1/5 do custo dele.
 */
export function PreparoForm({ preparo: base, itens = [], insumos, onDone, duplicar = false }: {
  preparo?: Insumo;
  itens?: PreparoItem[];
  insumos: Insumo[];
  onDone?: () => void;
  /** Começa com os dados de `preparo`, mas salva como um novo (nome com "(cópia)"). */
  duplicar?: boolean;
}) {
  // Na cópia, o original só preenche o formulário: o que se salva é um item novo.
  const preparo = duplicar ? undefined : base;
  const qc = useQueryClient();
  const [f, setF] = useState<PreparoEditavel>(() => ({
    nome: base ? (duplicar ? `${base.nome} (cópia)`.slice(0, 120) : base.nome) : "",
    rendimento: base ? String(base.quantidade_embalagem ?? 1).replace(".", ",") : "",
    unidade: base?.unidade_embalagem ?? base?.unidade ?? "g",
    itens: itens.length
      ? itens.map((i) => ({ insumo_id: i.insumo_id, quantidade: String(i.quantidade).replace(".", ","), unidade: i.unidade }))
      : [{ insumo_id: "", quantidade: "", unidade: "g" }],
  }));
  const [salvando, setSalvando] = useState(false);
  // Linha que recebe o ingrediente cadastrado na hora (-1 = nova linha no fim).
  const [novoIngredienteLinha, setNovoIngredienteLinha] = useState<number | null>(null);

  const ingredientes = insumos.filter((i) => !ehPreparo(i));
  const mapIns = new Map<string, InsumoLite & { nome: string; tipo: string }>(
    insumos.map((i) => [i.id, { ...i, preco_unidade: Number(i.preco_unidade), preco_embalagem: i.preco_embalagem == null ? null : Number(i.preco_embalagem), quantidade_embalagem: i.quantidade_embalagem == null ? null : Number(i.quantidade_embalagem) }]),
  );
  const unidadeDe = (id: string) => {
    const ins = insumos.find((x) => x.id === id);
    return ins?.unidade_embalagem ?? ins?.unidade ?? "g";
  };
  // Medidas do rendimento: num preparo já salvo, só as do mesmo tipo (peso, volume ou unidade).
  const medidasRendimento = preparo ? medidasCompativeis(preparo.unidade).filter((u) => (MEDIDAS_RENDIMENTO as readonly string[]).includes(u)) : [...MEDIDAS_RENDIMENTO];

  const linhasValidas = f.itens.filter((l) => l.insumo_id).map((l) => ({ insumo_id: l.insumo_id, quantidade: numeroIngrediente(l.quantidade) || 0, unidade: l.unidade }));
  let lote: number | null = null;
  let erroMedida = "";
  try { lote = custoDoLote(linhasValidas, mapIns); } catch (e) { erroMedida = e instanceof Error ? e.message : "Confira as medidas."; }
  const rendimento = numeroIngrediente(f.rendimento);
  const porcao = lote !== null && rendimento > 0 ? custoPorPorcao(lote, rendimento, f.unidade) : null;

  const alterarLinha = (i: number, novo: Partial<PreparoEditavel["itens"][number]>) =>
    setF((s) => ({ ...s, itens: s.itens.map((l, j) => (j === i ? { ...l, ...novo } : l)) }));

  async function salvar() {
    const r = preparoParaSalvar(f, mapIns);
    if (!r.ok) return void toast.error(r.erro);
    setSalvando(true);
    try {
      const { error } = await supabase.rpc("salvar_preparo", {
        p_nome: r.valor.nome,
        p_rendimento: r.valor.rendimento,
        p_unidade: r.valor.unidade,
        p_itens: r.valor.itens,
        ...(preparo ? { p_id: preparo.id } : {}),
      });
      if (error) throw new Error(error.message);
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["insumos"] }),
        qc.invalidateQueries({ queryKey: ["preparo-itens"] }),
        qc.invalidateQueries({ queryKey: ["produtos"] }),
      ]);
      toast.success(duplicar ? "Cópia criada. Ajuste os ingredientes e o rendimento se precisar." : preparo ? "Salvo. Os produtos que usam este recheio/cobertura já estão com o custo novo." : "Cadastrado. Agora ele aparece nos ingredientes das receitas dos produtos.");
      onDone?.();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div className="space-y-3">
      <Field label="Nome">
        <Input value={f.nome} maxLength={120} onChange={(e) => setF((s) => ({ ...s, nome: e.target.value }))} className="h-11" placeholder="Ex.: Cobertura de chocolate" />
      </Field>
      <Field label="A receita rende" hint="Quanto sai pronto, para o sistema dividir o custo.">
        <div className="flex gap-2">
          <Input inputMode="decimal" value={f.rendimento} onChange={(e) => setF((s) => ({ ...s, rendimento: e.target.value }))} className="h-11" placeholder="Ex.: 500" aria-label="Rendimento" />
          <NativeSelect value={f.unidade} onChange={(e) => setF((s) => ({ ...s, unidade: e.target.value }))} aria-label="Medida do rendimento">
            {medidasRendimento.map((u) => <option key={u} value={u}>{medidaLabel(u)}</option>)}
          </NativeSelect>
        </div>
      </Field>

      <div className="space-y-2">
        <span className="text-sm font-medium">Ingredientes</span>
        {f.itens.map((l, i) => {
          let custoLinha: number | null = null;
          try { custoLinha = l.insumo_id ? custoDoLote([{ insumo_id: l.insumo_id, quantidade: numeroIngrediente(l.quantidade) || 0, unidade: l.unidade }], mapIns) : null; } catch { custoLinha = null; }
          return (
            <div key={i} className="space-y-1 rounded-lg bg-muted/50 p-2">
              <div className="grid grid-cols-[1fr_2.5rem] gap-1.5">
                <NativeSelect aria-label="Ingrediente" value={l.insumo_id} onChange={(e) => { const v = e.target.value; if (v === NOVO_INGREDIENTE) return void setNovoIngredienteLinha(i); alterarLinha(i, { insumo_id: v, unidade: unidadeDe(v) }); }}>
                  <option value="">Escolha o ingrediente</option>
                  {ingredientes.filter((x) => x.ativo !== false || x.id === l.insumo_id).map((x) => <option key={x.id} value={x.id}>{x.nome}</option>)}
                  <option value={NOVO_INGREDIENTE}>+ Cadastrar novo ingrediente</option>
                </NativeSelect>
                <Button type="button" variant="ghost" size="icon" className="h-11 w-10" aria-label="Remover ingrediente" onClick={() => setF((s) => ({ ...s, itens: s.itens.filter((_, j) => j !== i) }))}>
                  <Trash2 className="size-4" />
                </Button>
              </div>
              <div className="grid grid-cols-[1fr_6rem] gap-1.5">
                <Input inputMode="decimal" aria-label="Quantidade" placeholder="Quantidade" value={l.quantidade} onChange={(e) => alterarLinha(i, { quantidade: e.target.value })} className="h-10 bg-card" />
                <select aria-label="Medida" value={l.unidade} className="h-10 rounded-md border bg-card px-2 text-sm" onChange={(e) => alterarLinha(i, { unidade: e.target.value })}>
                  {[...new Set([l.unidade, ...medidasCompativeis(l.insumo_id ? unidadeDe(l.insumo_id) : "g")])].map((u) => <option key={u} value={u}>{medidaLabel(u)}</option>)}
                </select>
              </div>
              {custoLinha !== null && <p className="text-right text-xs text-muted-foreground">{brl(custoLinha)}</p>}
            </div>
          );
        })}
        {f.itens.length < MAX_ITENS_PREPARO && (
          <Button type="button" variant="outline" size="sm" onClick={() => setF((s) => ({ ...s, itens: [...s.itens, { insumo_id: "", quantidade: "", unidade: "g" }] }))}>
            <Plus className="size-4" /> Adicionar
          </Button>
        )}
        <Button type="button" variant="outline" size="sm" className="ml-2" onClick={() => setNovoIngredienteLinha(-1)}>
          <Plus className="size-4" /> Cadastrar ingrediente
        </Button>
        {ingredientes.length === 0 && <p className="text-xs text-muted-foreground">Nenhum ingrediente cadastrado ainda: use "Cadastrar ingrediente" (chocolate, creme de leite...).</p>}
        <NovoInsumoDialog
          aberto={novoIngredienteLinha !== null}
          onFechar={() => setNovoIngredienteLinha(null)}
          onCriado={({ id, unidade_embalagem }) => {
            const linha = { insumo_id: id, quantidade: "", unidade: unidade_embalagem };
            setF((s) => {
              // Linha vazia no fim (a do formulário novo) é reaproveitada.
              if (novoIngredienteLinha === null || novoIngredienteLinha < 0) {
                const vazia = s.itens.findIndex((l) => !l.insumo_id);
                return { ...s, itens: vazia >= 0 ? s.itens.map((l, j) => (j === vazia ? linha : l)) : [...s.itens, linha] };
              }
              return { ...s, itens: s.itens.map((l, j) => (j === novoIngredienteLinha ? { ...l, insumo_id: id, unidade: unidade_embalagem } : l)) };
            });
          }}
        />
      </div>

      <div className="rounded-xl border bg-card p-3 text-sm">
        {erroMedida ? <p className="text-destructive">{erroMedida}</p> : (
          <>
            <div className="flex justify-between"><span>Custo da receita inteira</span><b>{brl(lote ?? 0)}</b></div>
            {porcao && <div className="flex justify-between text-muted-foreground"><span>A cada {porcao.porcao}</span><span>{brl(porcao.custo)}</span></div>}
          </>
        )}
      </div>

      <div className="flex gap-2">
        <Button type="button" className="h-11 flex-1" disabled={salvando} onClick={salvar}><Save className="size-4" /> {salvando ? "Salvando..." : "Salvar"}</Button>
        {onDone && <Button type="button" variant="outline" className="h-11" onClick={onDone}>Cancelar</Button>}
      </div>
    </div>
  );
}
