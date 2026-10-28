import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { parseNum } from "@/lib/format";
import { MAX_GRUPOS, MAX_OPCOES, type GrupoEditavel } from "@/lib/opcoes-produto";

export { opcoesParaEdicao, opcoesParaSalvar, type GrupoEditavel } from "@/lib/opcoes-produto";

/** Editor de variações: grupos (Tamanho, Sabor...) com opções, acréscimo de preço e de custo. */
export function EditorOpcoes({ grupos, onChange, precoBase }: { grupos: GrupoEditavel[]; onChange: (g: GrupoEditavel[]) => void; precoBase: number }) {
  const alterarGrupo = (gi: number, novo: Partial<GrupoEditavel>) => onChange(grupos.map((g, i) => (i === gi ? { ...g, ...novo } : g)));
  const alterarItem = (gi: number, ii: number, novo: Partial<GrupoEditavel["itens"][number]>) =>
    alterarGrupo(gi, { itens: (grupos[gi]?.itens ?? []).map((it, i) => (i === ii ? { ...it, ...novo } : it)) });

  return (
    <div className="space-y-3">
      {grupos.map((g, gi) => (
        <div key={gi} className="space-y-2 rounded-xl border p-3">
          <div className="flex gap-2">
            <Input value={g.grupo} maxLength={40} placeholder="Nome do grupo (ex.: Tamanho, Sabor, Recheio)" aria-label="Nome do grupo de opções"
              onChange={(e) => alterarGrupo(gi, { grupo: e.target.value })} className="h-10" />
            <Button type="button" variant="ghost" size="icon" aria-label={`Remover grupo ${g.grupo || gi + 1}`} onClick={() => onChange(grupos.filter((_, i) => i !== gi))}>
              <Trash2 className="size-4 text-destructive" />
            </Button>
          </div>
          <div className="grid grid-cols-[1fr_5.5rem_5.5rem_2.5rem] gap-1.5 text-[11px] text-muted-foreground">
            <span>Opção</span><span>+ Preço R$</span><span>+ Custo R$</span><span />
          </div>
          {g.itens.map((it, ii) => (
            <div key={ii} className="grid grid-cols-[1fr_5.5rem_5.5rem_2.5rem] gap-1.5">
              <Input value={it.nome} maxLength={40} placeholder="Ex.: G" aria-label="Nome da opção" onChange={(e) => alterarItem(gi, ii, { nome: e.target.value })} className="h-10" />
              <Input value={it.preco} inputMode="decimal" aria-label="Acréscimo de preço" onChange={(e) => alterarItem(gi, ii, { preco: e.target.value })} className="h-10" />
              <Input value={it.custo} inputMode="decimal" aria-label="Acréscimo de custo" onChange={(e) => alterarItem(gi, ii, { custo: e.target.value })} className="h-10" />
              <Button type="button" variant="ghost" size="icon" aria-label="Remover opção" onClick={() => alterarGrupo(gi, { itens: g.itens.filter((_, i) => i !== ii) })}>
                <Trash2 className="size-4" />
              </Button>
            </div>
          ))}
          {g.itens.length < MAX_OPCOES && (
            <Button type="button" variant="outline" size="sm" onClick={() => alterarGrupo(gi, { itens: [...g.itens, { nome: "", preco: "0", custo: "0" }] })}>
              <Plus className="size-4" /> Opção
            </Button>
          )}
          {g.itens.some((i) => i.nome.trim()) && (
            <p className="text-xs text-muted-foreground">
              Preço final: {g.itens.filter((i) => i.nome.trim()).map((i) => `${i.nome.trim()} R$ ${(precoBase + parseNum(i.preco || "0")).toFixed(2).replace(".", ",")}`).join(" · ")}
            </p>
          )}
        </div>
      ))}
      {grupos.length < MAX_GRUPOS && (
        <Button type="button" variant="outline" size="sm" onClick={() => onChange([...grupos, { grupo: "", itens: [{ nome: "", preco: "0", custo: "0" }] }])}>
          <Plus className="size-4" /> Grupo de opções
        </Button>
      )}
      <p className="text-xs text-muted-foreground">
        O cliente escolhe uma opção de cada grupo. "+ Preço" soma ao preço de venda (use negativo para opções mais baratas, ex.: P = -5). "+ Custo" soma ao custo da receita, para o lucro do pedido ficar certo.
      </p>
    </div>
  );
}
