import { useState } from "react";
import { ChevronDown, ChevronUp, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { brl, parseNum } from "@/lib/format";
import { NOVO_INGREDIENTE, NovoInsumoDialog } from "./novo-insumo-dialog";
import type { InsumoLite } from "@/lib/calc";
import { medidaLabel, medidasCompativeis, numeroIngrediente } from "@/lib/ingredient-cost";
import {
  MAX_GRUPOS,
  MAX_INGREDIENTES_OPCAO,
  MAX_OPCOES,
  custoIngredientesOpcao,
  type GrupoEditavel,
  type IngredienteEditavel,
  type OpcaoEditavel,
} from "@/lib/opcoes-produto";

export { opcoesParaEdicao, opcoesParaSalvar, type GrupoEditavel } from "@/lib/opcoes-produto";

type InsumoOpcao = { id: string; nome: string; tipo?: string | null; ativo?: boolean | null; unidade?: string | null; unidade_embalagem?: string | null };

/** Custo calculado pelos ingredientes da opção (null = sem ingredientes; texto = erro de medida). */
function custoCalculado(opcao: OpcaoEditavel, mapIns: Map<string, InsumoLite>): number | string | null {
  const linhas = (opcao.ingredientes ?? []).filter((x) => x.insumo_id);
  if (linhas.length === 0) return null;
  try {
    return custoIngredientesOpcao(
      linhas.map((x) => ({ insumo_id: x.insumo_id, quantidade: numeroIngrediente(x.quantidade) || 0, unidade: x.unidade })),
      mapIns,
    );
  } catch (e) {
    return e instanceof Error ? e.message : "Confira as medidas.";
  }
}

/**
 * Editor de variações: grupos (Cobertura, Tamanho, Recheio...) com opções, acréscimo de preço e de custo.
 * Cada opção pode listar os ingredientes extras que leva; aí o "+ Custo" é calculado sozinho.
 */
export function EditorOpcoes({
  grupos,
  onChange,
  precoBase,
  custoBase = 0,
  insumos = [],
  mapIns = new Map(),
  mostrarCusto = true,
}: {
  grupos: GrupoEditavel[];
  onChange: (g: GrupoEditavel[]) => void;
  precoBase: number;
  custoBase?: number;
  insumos?: InsumoOpcao[];
  mapIns?: Map<string, InsumoLite>;
  mostrarCusto?: boolean;
}) {
  const [aberta, setAberta] = useState<string | null>(null);
  // Opção (grupo, opção, linha) que recebe o ingrediente cadastrado na hora; linha -1 = nova.
  const [novoIngrediente, setNovoIngrediente] = useState<{ gi: number; ii: number; xi: number } | null>(null);
  const alterarGrupo = (gi: number, novo: Partial<GrupoEditavel>) => onChange(grupos.map((g, i) => (i === gi ? { ...g, ...novo } : g)));
  const alterarItem = (gi: number, ii: number, novo: Partial<OpcaoEditavel>) =>
    alterarGrupo(gi, { itens: (grupos[gi]?.itens ?? []).map((it, i) => (i === ii ? { ...it, ...novo } : it)) });
  const alterarIngredientes = (gi: number, ii: number, f: (l: IngredienteEditavel[]) => IngredienteEditavel[]) =>
    alterarItem(gi, ii, { ingredientes: f(grupos[gi]?.itens[ii]?.ingredientes ?? []) });
  const disponiveis = insumos.filter((x) => x.ativo !== false);
  const unidadeDe = (id: string) => {
    const ins = insumos.find((x) => x.id === id);
    return ins?.unidade_embalagem ?? ins?.unidade ?? "un";
  };
  const colunas = mostrarCusto ? "grid-cols-[1fr_5.5rem_5.5rem_2.5rem]" : "grid-cols-[1fr_5.5rem_2.5rem]";

  return (
    <div className="space-y-3">
      {grupos.map((g, gi) => (
        <div key={gi} className="space-y-2 rounded-xl border p-3">
          <div className="flex gap-2">
            <Input value={g.grupo} maxLength={40} placeholder="Nome do grupo (ex.: Cobertura, Tamanho, Recheio)" aria-label="Nome do grupo de opções"
              onChange={(e) => alterarGrupo(gi, { grupo: e.target.value })} className="h-10" />
            <Button type="button" variant="ghost" size="icon" aria-label={`Remover grupo ${g.grupo || gi + 1}`} onClick={() => onChange(grupos.filter((_, i) => i !== gi))}>
              <Trash2 className="size-4 text-destructive" />
            </Button>
          </div>
          <div className={`grid ${colunas} gap-1.5 text-[11px] text-muted-foreground`}>
            <span>Opção</span><span>+ Preço R$</span>{mostrarCusto && <span>+ Custo R$</span>}<span />
          </div>
          {g.itens.map((it, ii) => {
            const chave = `${gi}-${ii}`;
            const calculado = mostrarCusto ? custoCalculado(it, mapIns) : null;
            const qtdIngredientes = (it.ingredientes ?? []).filter((x) => x.insumo_id).length;
            return (
              <div key={ii} className="space-y-1.5">
                <div className={`grid ${colunas} gap-1.5`}>
                  <Input value={it.nome} maxLength={40} placeholder="Ex.: Ganache" aria-label="Nome da opção" onChange={(e) => alterarItem(gi, ii, { nome: e.target.value })} className="h-10" />
                  <Input value={it.preco} inputMode="decimal" aria-label="Acréscimo de preço" onChange={(e) => alterarItem(gi, ii, { preco: e.target.value })} className="h-10" />
                  {mostrarCusto && (typeof calculado === "number"
                    ? <div className="flex h-10 items-center rounded-md border bg-muted/50 px-2 text-sm" title="Calculado pelos ingredientes">{calculado.toFixed(2).replace(".", ",")}</div>
                    : <Input value={it.custo} inputMode="decimal" aria-label="Acréscimo de custo" onChange={(e) => alterarItem(gi, ii, { custo: e.target.value })} className="h-10" />)}
                  <Button type="button" variant="ghost" size="icon" aria-label="Remover opção" onClick={() => alterarGrupo(gi, { itens: g.itens.filter((_, i) => i !== ii) })}>
                    <Trash2 className="size-4" />
                  </Button>
                </div>
                {mostrarCusto && (
                  <button type="button" onClick={() => setAberta(aberta === chave ? null : chave)} aria-expanded={aberta === chave}
                    className="flex items-center gap-1 text-xs font-medium text-primary">
                    {aberta === chave ? <ChevronUp className="size-3.5" /> : <ChevronDown className="size-3.5" />}
                    {qtdIngredientes ? `Ingredientes da opção (${qtdIngredientes})` : "Calcular custo pelos ingredientes"}
                  </button>
                )}
                {typeof calculado === "string" && <p className="text-xs text-destructive">{calculado}</p>}
                {mostrarCusto && aberta === chave && (
                  <div className="space-y-2 rounded-lg bg-muted/50 p-2.5">
                    <p className="text-[11px] text-muted-foreground">O que esta opção acrescenta em <b>uma unidade</b> do produto (ex.: 200 g de chocolate e 100 g de creme de leite). O custo usa o preço atual dos insumos.</p>
                    {(it.ingredientes ?? []).map((x, xi) => {
                      const ins = mapIns.get(x.insumo_id);
                      let custoLinha: number | null = null;
                      try { custoLinha = ins ? custoIngredientesOpcao([{ insumo_id: x.insumo_id, quantidade: numeroIngrediente(x.quantidade) || 0, unidade: x.unidade }], mapIns) : null; } catch { custoLinha = null; }
                      return (
                        <div key={xi} className="space-y-1">
                          <div className="grid grid-cols-[1fr_4.5rem_4.5rem_2.25rem] gap-1.5">
                            <select aria-label="Ingrediente" value={x.insumo_id} className="h-10 min-w-0 rounded-md border bg-background px-2 text-sm"
                              onChange={(e) => { const v = e.target.value; if (v === NOVO_INGREDIENTE) return void setNovoIngrediente({ gi, ii, xi }); alterarIngredientes(gi, ii, (l) => l.map((y, j) => (j === xi ? { ...y, insumo_id: v, unidade: unidadeDe(v) } : y))); }}>
                              {insumos.filter((y) => y.ativo !== false || y.id === x.insumo_id).map((y) => <option key={y.id} value={y.id}>{y.nome}{y.tipo === "preparo" ? " (recheio/cobertura)" : ""}</option>)}
                              <option value={NOVO_INGREDIENTE}>+ Cadastrar novo ingrediente</option>
                            </select>
                            <Input inputMode="decimal" aria-label="Quantidade do ingrediente" value={x.quantidade} placeholder="Qtd."
                              onChange={(e) => { const v = e.target.value; alterarIngredientes(gi, ii, (l) => l.map((y, j) => (j === xi ? { ...y, quantidade: v } : y))); }} className="h-10" />
                            <select aria-label="Medida" value={x.unidade} className="h-10 min-w-0 rounded-md border bg-background px-1 text-sm"
                              onChange={(e) => { const v = e.target.value; alterarIngredientes(gi, ii, (l) => l.map((y, j) => (j === xi ? { ...y, unidade: v } : y))); }}>
                              {[...new Set([x.unidade, ...medidasCompativeis(unidadeDe(x.insumo_id))])].map((u) => <option key={u} value={u}>{medidaLabel(u)}</option>)}
                            </select>
                            <Button type="button" variant="ghost" size="icon" className="h-10 w-9" aria-label="Remover ingrediente"
                              onClick={() => alterarIngredientes(gi, ii, (l) => l.filter((_, j) => j !== xi))}>
                              <Trash2 className="size-4" />
                            </Button>
                          </div>
                          {custoLinha !== null && <p className="text-right text-[11px] text-muted-foreground">{brl(custoLinha)}</p>}
                        </div>
                      );
                    })}
                    {(it.ingredientes ?? []).length < MAX_INGREDIENTES_OPCAO && (
                      <div className="flex flex-wrap gap-2">
                        {disponiveis.length > 0 && (
                          <Button type="button" variant="outline" size="sm" onClick={() => {
                            const primeiro = disponiveis[0];
                            if (primeiro) alterarIngredientes(gi, ii, (l) => [...l, { insumo_id: primeiro.id, quantidade: "", unidade: unidadeDe(primeiro.id) }]);
                          }}>
                            <Plus className="size-4" /> Ingrediente
                          </Button>
                        )}
                        <Button type="button" variant="outline" size="sm" onClick={() => setNovoIngrediente({ gi, ii, xi: -1 })}>
                          <Plus className="size-4" /> Novo ingrediente
                        </Button>
                      </div>
                    )}
                    {typeof calculado === "number" && <p className="text-xs font-medium">Custo da opção: {brl(calculado)} por unidade</p>}
                  </div>
                )}
              </div>
            );
          })}
          {g.itens.length < MAX_OPCOES && (
            <Button type="button" variant="outline" size="sm" onClick={() => alterarGrupo(gi, { itens: [...g.itens, { nome: "", preco: "0", custo: "0" }] })}>
              <Plus className="size-4" /> Opção
            </Button>
          )}
          {g.itens.some((i) => i.nome.trim()) && (
            <p className="text-xs text-muted-foreground">
              {g.itens.filter((i) => i.nome.trim()).map((i) => {
                const c = mostrarCusto ? custoCalculado(i, mapIns) : null;
                const custoOpcao = typeof c === "number" ? c : parseNum(i.custo || "0");
                const precoFinal = precoBase + parseNum(i.preco || "0");
                return `${i.nome.trim()}: ${brl(precoFinal)}${mostrarCusto ? ` (custo ${brl(custoBase + custoOpcao)})` : ""}`;
              }).join(" · ")}
            </p>
          )}
        </div>
      ))}
      {grupos.length < MAX_GRUPOS && (
        <Button type="button" variant="outline" size="sm" onClick={() => onChange([...grupos, { grupo: "", itens: [{ nome: "", preco: "0", custo: "0" }] }])}>
          <Plus className="size-4" /> Grupo de opções
        </Button>
      )}
      <NovoInsumoDialog
        aberto={novoIngrediente !== null}
        onFechar={() => setNovoIngrediente(null)}
        onCriado={({ id, unidade_embalagem }) => {
          if (!novoIngrediente) return;
          const { gi, ii, xi } = novoIngrediente;
          alterarIngredientes(gi, ii, (l) => (xi < 0
            ? [...l, { insumo_id: id, quantidade: "", unidade: unidade_embalagem }]
            : l.map((y, j) => (j === xi ? { ...y, insumo_id: id, unidade: unidade_embalagem } : y))));
        }}
      />
      <p className="text-xs text-muted-foreground">
        Escolhe-se uma opção de cada grupo, no pedido ou no catálogo. "+ Preço" soma ao preço de venda (use negativo para opções mais baratas, ex.: P = -5).
        {mostrarCusto && " \"+ Custo\" soma ao custo da receita; com ingredientes, é calculado sozinho."}
      </p>
    </div>
  );
}
