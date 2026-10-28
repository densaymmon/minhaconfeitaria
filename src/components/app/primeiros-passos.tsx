import { useRouter } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { CheckCircle2, Circle, Rocket, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { confeitariaQ, configQ, insumosQ, meuPapelQ, pedidosQ, produtosQ } from "@/lib/queries";
import { primeirosPassos, progressoPassos } from "@/lib/primeiros-passos";
import { Card } from "@/components/app/ui";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const chaveDispensado = (id: string) => `docegestao:primeiros-passos:${id}`;

/** Roteiro de primeiros passos no Hoje, até a confeitaria completar ou dispensar. */
export function PrimeirosPassos() {
  const router = useRouter();
  const qc = useQueryClient();
  const { data: confeitaria } = useQuery(confeitariaQ);
  const { data: config } = useQuery(configQ);
  const { data: insumos = [] } = useQuery(insumosQ);
  const { data: produtos = [] } = useQuery(produtosQ);
  const { data: pedidos = [] } = useQuery(pedidosQ);
  const { data: meuPapel } = useQuery(meuPapelQ);
  const [dispensado, setDispensado] = useState(() => {
    try { return confeitaria ? localStorage.getItem(chaveDispensado(confeitaria.user_id)) === "1" : false; } catch { return false; }
  });
  const [criando, setCriando] = useState(false);
  if (!confeitaria || dispensado || (meuPapel?.papel ?? "dono") !== "dono") return null;

  const passos = primeirosPassos({
    nome: confeitaria.nome,
    whatsapp: confeitaria.whatsapp,
    pix: config?.pix_chave,
    insumos: insumos.length,
    produtosComReceita: produtos.filter((p) => p.receita_itens.length > 0 && Number(p.preco_venda) > 0).length,
    catalogoNoAr: Boolean(confeitaria.catalogo_ativo && confeitaria.slug),
    pedidos: pedidos.length,
  });
  const p = progressoPassos(passos);
  if (p.completo) return null;

  function dispensar() {
    try { localStorage.setItem(chaveDispensado(confeitaria!.user_id), "1"); } catch { /* sem armazenamento */ }
    setDispensado(true);
  }

  // Exemplo pronto: 3 ingredientes e um bolo com ficha técnica, para ver custo e lucro na hora.
  async function criarExemplo() {
    setCriando(true);
    try {
      const { data: ins, error } = await supabase.from("insumos").insert([
        { nome: "Farinha de trigo (exemplo)", tipo: "ingrediente", preco_embalagem: 6.5, quantidade_embalagem: 1, unidade_embalagem: "kg", unidade: "kg", alergenos: "glúten" },
        { nome: "Açúcar (exemplo)", tipo: "ingrediente", preco_embalagem: 5, quantidade_embalagem: 1, unidade_embalagem: "kg", unidade: "kg" },
        { nome: "Ovos (exemplo)", tipo: "ingrediente", preco_embalagem: 18, quantidade_embalagem: 30, unidade_embalagem: "un", unidade: "un", alergenos: "ovo" },
      ]).select("id,nome");
      if (error || !ins) throw new Error(error?.message ?? "Não foi possível criar os ingredientes.");
      const id = (parte: string) => ins.find((i) => i.nome.startsWith(parte))?.id ?? "";
      const { error: e2 } = await supabase.rpc("salvar_produto", {
        payload: { nome: "Bolo simples (exemplo)", categoria: "Bolos caseiros", rendimento: 1, custo_gas: 2, custo_energia: 1, custo_mao_obra: 10, preco_venda: 45, margem_desejada: 100, modo_preparo: "Produto de exemplo: edite ou exclua quando quiser.", ativo: true },
        itens: [
          { insumo_id: id("Farinha"), quantidade: 300, quantidade_utilizada: 300, unidade_receita: "g" },
          { insumo_id: id("Açúcar"), quantidade: 200, quantidade_utilizada: 200, unidade_receita: "g" },
          { insumo_id: id("Ovos"), quantidade: 3, quantidade_utilizada: 3, unidade_receita: "un" },
        ],
      });
      if (e2) throw new Error(e2.message);
      await Promise.all([qc.invalidateQueries({ queryKey: ["insumos"] }), qc.invalidateQueries({ queryKey: ["produtos"] })]);
      toast.success("Exemplo criado! Veja o custo e o lucro em Produtos.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível criar o exemplo.");
    } finally {
      setCriando(false);
    }
  }

  return (
    <Card className="mb-5 border border-primary/30 p-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="flex items-center gap-2 font-semibold"><Rocket className="size-4 text-primary" /> Primeiros passos · {p.feitos}/{p.total}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">Complete para deixar a confeitaria pronta para vender.</p>
        </div>
        <Button type="button" size="icon" variant="ghost" className="size-8" aria-label="Esconder primeiros passos" onClick={dispensar}><X className="size-4" /></Button>
      </div>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary" style={{ width: `${Math.round((p.feitos / p.total) * 100)}%` }} /></div>
      <ul className="mt-3 space-y-1">
        {passos.map((passo) => (
          <li key={passo.id}>
            <button type="button" onClick={() => router.history.push(passo.link)} disabled={passo.feito}
              className={cn("flex w-full items-start gap-2 rounded-lg p-2 text-left text-sm", !passo.feito && "hover:bg-muted", passo.id === p.proximo?.id && "bg-primary/5")}>
              {passo.feito ? <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" /> : <Circle className="mt-0.5 size-4 shrink-0 text-muted-foreground" />}
              <span className="min-w-0">
                <span className={cn("block font-medium", passo.feito && "text-muted-foreground line-through")}>{passo.titulo}</span>
                {!passo.feito && <span className="block text-xs text-muted-foreground">{passo.descricao}</span>}
              </span>
            </button>
          </li>
        ))}
      </ul>
      {insumos.length === 0 && produtos.length === 0 && (
        <Button type="button" variant="outline" className="mt-2 w-full" disabled={criando} onClick={() => void criarExemplo()}>{criando ? "Criando…" : "Criar um produto de exemplo para testar"}</Button>
      )}
    </Card>
  );
}
