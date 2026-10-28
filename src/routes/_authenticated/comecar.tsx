import * as appQueries from "@/lib/queries";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Check, ChevronLeft, Copy, ExternalLink, PartyPopper } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { TablesUpdate } from "@/integrations/supabase/types";
import { parseNum } from "@/lib/format";
import { ROTULO_CHAVE, normalizarChavePix, tipoChaveValido, type TipoChavePix } from "@/lib/pix";
import { SLUGS_RESERVADOS, linkCatalogo, slugValido, sugerirSlug } from "@/lib/catalogo";
import { Card, Field, NativeSelect } from "@/components/app/ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/comecar")({
  loader: async ({ context }) => {
    await Promise.all([
      context.queryClient.ensureQueryData(appQueries.configQ),
      context.queryClient.ensureQueryData(appQueries.confeitariaQ),
    ]);
  },
  head: () => ({ meta: [{ title: "Primeiros passos — Doce Gestão" }] }),
  component: Comecar,
});

const PASSOS = ["Confeitaria", "Pix", "Catálogo", "Produto", "Pronto"] as const;

function Comecar() {
  const { user } = Route.useRouteContext();
  const { data: config } = useSuspenseQuery(appQueries.configQ);
  const { data: confeitaria } = useSuspenseQuery(appQueries.confeitariaQ);
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [passo, setPasso] = useState(0);
  const [salvando, setSalvando] = useState(false);

  const [loja, setLoja] = useState(() => ({
    nome: confeitaria?.nome && confeitaria.nome !== "Minha confeitaria" ? confeitaria.nome : "",
    whatsapp: confeitaria?.whatsapp ?? "",
    cidade: confeitaria?.cidade ?? "",
  }));
  const [pix, setPix] = useState(() => ({ chave: config.pix_chave ?? "", tipo: (tipoChaveValido(config.pix_tipo) ?? "") as TipoChavePix | "" }));
  const [cat, setCat] = useState(() => ({
    slug: confeitaria?.slug ?? "",
    retirada: confeitaria?.aceita_retirada ?? true,
    entrega: confeitaria?.aceita_entrega ?? false,
    taxa: String(confeitaria?.taxa_entrega ?? 0),
    ativo: true,
  }));
  const [produto, setProduto] = useState({ nome: "", preco: "", categoria: "" });
  const chave = normalizarChavePix(pix.chave, tipoChaveValido(pix.tipo));
  const slug = cat.slug || sugerirSlug(loja.nome);
  const link = typeof window !== "undefined" && slugValido(slug) ? linkCatalogo(window.location.origin, slug) : "";

  async function atualizarLoja(dados: TablesUpdate<"confeitarias">) {
    const { error } = await supabase.from("confeitarias").update(dados).eq("user_id", user.id);
    if (error) throw new Error(error.code === "23505" ? "Este endereço de catálogo já está em uso. Escolha outro." : error.message);
  }

  async function concluir(irPara: "/painel" | "/produtos" | null) {
    setSalvando(true);
    try {
      await atualizarLoja({ onboarding_concluido_em: new Date().toISOString() });
      await qc.invalidateQueries({ queryKey: ["confeitaria"] });
      if (irPara) await navigate({ to: irPara, replace: true });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível concluir.");
    } finally {
      setSalvando(false);
    }
  }

  async function avancar() {
    setSalvando(true);
    try {
      if (passo === 0) {
        if (loja.nome.trim().length < 2) throw new Error("Informe o nome da confeitaria.");
        if (loja.whatsapp.replace(/\D/g, "").length < 10) throw new Error("Informe o WhatsApp com DDD: é por ele que os clientes falam com você.");
        await atualizarLoja({ nome: loja.nome.trim().slice(0, 80), whatsapp: loja.whatsapp.trim().slice(0, 30), cidade: loja.cidade.trim().slice(0, 60) || null });
      } else if (passo === 1) {
        if (pix.chave.trim() && !chave) throw new Error("Não reconhecemos a chave Pix. Confira a chave ou escolha o tipo.");
        if (pix.chave.trim()) {
          const { error } = await supabase.from("configuracoes").upsert({ user_id: user.id, pix_chave: pix.chave.trim(), pix_tipo: pix.tipo || null });
          if (error) throw new Error(error.message);
        }
      } else if (passo === 2) {
        if (!slugValido(slug)) throw new Error(SLUGS_RESERVADOS.includes(slug) ? "Este endereço é usado por uma página do sistema. Escolha outro." : "O endereço deve ter de 3 a 60 letras minúsculas, números ou hífens.");
        if (!cat.retirada && !cat.entrega) throw new Error("Escolha retirada, entrega ou as duas.");
        const taxa = parseNum(cat.taxa);
        if (taxa < 0 || taxa > 1000) throw new Error("Confira a taxa de entrega.");
        await atualizarLoja({ slug, aceita_retirada: cat.retirada, aceita_entrega: cat.entrega, taxa_entrega: cat.entrega ? taxa : 0, catalogo_ativo: cat.ativo });
        setCat({ ...cat, slug });
      } else if (passo === 3 && produto.nome.trim()) {
        const preco = parseNum(produto.preco);
        if (!(preco > 0)) throw new Error("Informe o preço de venda.");
        const { error } = await supabase.from("produtos").insert({
          nome: produto.nome.trim().slice(0, 120),
          preco_venda: preco,
          rendimento: 1,
          no_catalogo: true,
          ...(produto.categoria.trim() ? { categoria: produto.categoria.trim().slice(0, 60) } : {}),
        });
        if (error) throw new Error(error.message);
        setProduto({ nome: "", preco: "", categoria: "" });
      }
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["confeitaria"] }),
        qc.invalidateQueries({ queryKey: ["config"] }),
        qc.invalidateQueries({ queryKey: ["produtos"] }),
      ]);
      if (passo === 3) await concluir(null);
      setPasso((p) => Math.min(PASSOS.length - 1, p + 1));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível salvar.");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div className="mx-auto max-w-lg pb-24">
      <div className="mb-5 flex items-center justify-between gap-3">
        <div>
          <p className="text-sm text-muted-foreground">Primeiros passos</p>
          <h1 className="font-display text-2xl font-semibold">Vamos deixar sua confeitaria pronta</h1>
        </div>
        {passo < PASSOS.length - 1 && (
          <Button type="button" variant="ghost" size="sm" disabled={salvando} onClick={() => void concluir("/painel")}>Fazer depois</Button>
        )}
      </div>

      <ol className="mb-5 grid grid-cols-5 gap-1" aria-label="Etapas">
        {PASSOS.map((nome, i) => (
          <li key={nome} className="text-center">
            <div className={cn("h-1.5 rounded-full", i <= passo ? "bg-primary" : "bg-muted")} />
            <span className={cn("mt-1 block text-[11px]", i === passo ? "font-semibold text-foreground" : "text-muted-foreground")}>{nome}</span>
            {i === passo && <span className="sr-only">(etapa atual)</span>}
          </li>
        ))}
      </ol>

      <Card className="space-y-4">
        {passo === 0 && <>
          <h2 className="text-lg font-semibold">Sua confeitaria</h2>
          <Field label="Nome da confeitaria *" hint="Aparece no catálogo, nos recibos e nas mensagens aos clientes.">
            <Input autoFocus maxLength={80} value={loja.nome} onChange={(e) => setLoja({ ...loja, nome: e.target.value })} className="h-11" />
          </Field>
          <Field label="WhatsApp da confeitaria *" hint="Os clientes do catálogo enviam o pedido para este número.">
            <Input type="tel" inputMode="tel" maxLength={30} placeholder="(19) 99999-9999" value={loja.whatsapp} onChange={(e) => setLoja({ ...loja, whatsapp: e.target.value })} className="h-11" />
          </Field>
          <Field label="Cidade" hint="Usada no Pix copia e cola.">
            <Input maxLength={60} value={loja.cidade} onChange={(e) => setLoja({ ...loja, cidade: e.target.value })} className="h-11" />
          </Field>
        </>}

        {passo === 1 && <>
          <h2 className="text-lg font-semibold">Como você recebe: Pix</h2>
          <p className="text-sm text-muted-foreground">Com a chave, o cliente recebe o Pix copia e cola já com o valor do pedido. O dinheiro cai direto na sua conta.</p>
          <Field label="Chave Pix" hint={pix.chave.trim() ? (chave ? `Reconhecida como ${ROTULO_CHAVE[chave.tipo]}.` : "Chave não reconhecida para este tipo.") : "Pode deixar em branco e cadastrar depois em Configurações."}>
            <Input value={pix.chave} maxLength={120} onChange={(e) => setPix({ ...pix, chave: e.target.value })} placeholder="CPF/CNPJ, e-mail, celular ou chave aleatória" className="h-11" />
          </Field>
          <Field label="Tipo da chave">
            <NativeSelect value={pix.tipo} onChange={(e) => setPix({ ...pix, tipo: tipoChaveValido(e.target.value) ?? "" })}>
              <option value="">Detectar automaticamente</option>
              {(Object.keys(ROTULO_CHAVE) as TipoChavePix[]).map((t) => <option key={t} value={t}>{ROTULO_CHAVE[t][0]?.toUpperCase()}{ROTULO_CHAVE[t].slice(1)}</option>)}
            </NativeSelect>
          </Field>
        </>}

        {passo === 2 && <>
          <h2 className="text-lg font-semibold">Seu catálogo on-line</h2>
          <p className="text-sm text-muted-foreground">Uma página com seus produtos onde o cliente escolhe, faz o pedido e paga por Pix. Os pedidos chegam aqui no sistema.</p>
          <Field label="Endereço do catálogo" hint="Curto e fácil de digitar. Só letras minúsculas, números e hífens.">
            <div className="flex items-center rounded-md border bg-card pl-3 text-sm text-muted-foreground">
              <span className="shrink-0">/</span>
              <Input value={slug} maxLength={60} onChange={(e) => setCat({ ...cat, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "") })} className="h-11 border-0 bg-transparent pl-1 shadow-none focus-visible:ring-0" />
            </div>
          </Field>
          {link && <p className="break-all rounded-xl bg-muted/60 p-3 text-sm">{link}</p>}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="flex items-center justify-between rounded-xl border p-3 text-sm font-medium">Retirada<Switch checked={cat.retirada} onCheckedChange={(v) => setCat({ ...cat, retirada: v })} /></label>
            <label className="flex items-center justify-between rounded-xl border p-3 text-sm font-medium">Entrega<Switch checked={cat.entrega} onCheckedChange={(v) => setCat({ ...cat, entrega: v })} /></label>
          </div>
          {cat.entrega && <Field label="Taxa de entrega (R$)"><Input inputMode="decimal" value={cat.taxa} onChange={(e) => setCat({ ...cat, taxa: e.target.value })} className="h-11" /></Field>}
          <label className="flex items-center justify-between rounded-xl border p-3 text-sm font-medium">Deixar o catálogo no ar<Switch checked={cat.ativo} onCheckedChange={(v) => setCat({ ...cat, ativo: v })} /></label>
        </>}

        {passo === 3 && <>
          <h2 className="text-lg font-semibold">Seu primeiro produto</h2>
          <p className="text-sm text-muted-foreground">Cadastre um produto para ele já aparecer no catálogo. Depois você adiciona fotos, receita, custo e variações (tamanho, sabor) em Produtos.</p>
          <Field label="Nome do produto"><Input maxLength={120} placeholder="Ex.: Bolo de cenoura com chocolate" value={produto.nome} onChange={(e) => setProduto({ ...produto, nome: e.target.value })} className="h-11" /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Preço de venda (R$)"><Input inputMode="decimal" value={produto.preco} onChange={(e) => setProduto({ ...produto, preco: e.target.value })} className="h-11" /></Field>
            <Field label="Categoria"><Input maxLength={60} placeholder="Ex.: Bolos" value={produto.categoria} onChange={(e) => setProduto({ ...produto, categoria: e.target.value })} className="h-11" /></Field>
          </div>
        </>}

        {passo === 4 && <div className="space-y-4 text-center">
          <div className="mx-auto grid size-14 place-items-center rounded-full bg-success/15 text-success"><PartyPopper className="size-7" /></div>
          <h2 className="font-display text-2xl font-semibold">Tudo pronto!</h2>
          <p className="text-sm text-muted-foreground">Sua confeitaria já pode receber pedidos. Compartilhe o link do catálogo no WhatsApp e no Instagram.</p>
          {link && cat.ativo && (
            <div className="space-y-2 rounded-xl bg-muted/60 p-3 text-left">
              <p className="break-all text-sm font-medium">{link}</p>
              <div className="flex gap-2">
                <Button type="button" size="sm" variant="outline" onClick={async () => { try { await navigator.clipboard.writeText(link); toast.success("Link copiado."); } catch { toast.error("Não foi possível copiar."); } }}><Copy className="size-4" /> Copiar</Button>
                <Button type="button" size="sm" variant="outline" asChild><a href={link} target="_blank" rel="noreferrer"><ExternalLink className="size-4" /> Ver catálogo</a></Button>
              </div>
            </div>
          )}
          <ul className="space-y-1.5 text-left text-sm">
            {["Cadastre os outros produtos com foto e preço", "Monte a ficha técnica para saber o custo e o lucro", "Registre os pedidos que chegam pelo WhatsApp"].map((t) => (
              <li key={t} className="flex items-start gap-2"><Check className="mt-0.5 size-4 shrink-0 text-success" />{t}</li>
            ))}
          </ul>
          <div className="grid gap-2 sm:grid-cols-2">
            <Button asChild className="h-11"><Link to="/produtos">Cadastrar produtos</Link></Button>
            <Button asChild variant="outline" className="h-11"><Link to="/painel">Ir para o painel</Link></Button>
          </div>
        </div>}
      </Card>

      {passo < PASSOS.length - 1 && (
        <div className="mt-4 flex gap-2">
          {passo > 0 && <Button type="button" variant="outline" className="h-12" disabled={salvando} onClick={() => setPasso((p) => p - 1)}><ChevronLeft className="size-4" /> Voltar</Button>}
          <Button type="button" className="h-12 flex-1" disabled={salvando} onClick={() => void avancar()}>
            {salvando ? "Salvando..." : passo === 1 && !pix.chave.trim() ? "Pular por agora" : passo === 3 && !produto.nome.trim() ? "Pular e concluir" : passo === 3 ? "Salvar e concluir" : "Continuar"}
          </Button>
        </div>
      )}
    </div>
  );
}
