import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Copy, MessageCircle, Send, Trash2, UserPlus, UsersRound } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { meuPapelQ } from "@/lib/queries";
import { DESCRICAO_PAPEL, NOME_PAPEL, mensagemEquipe, type Papel } from "@/lib/assinatura";
import { origemPublica } from "@/lib/catalogo";
import { dataBR } from "@/lib/format";
import { Card, Field, PageHeader } from "@/components/app/ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/equipe")({
  loader: ({ context }) => context.queryClient.ensureQueryData(meuPapelQ),
  head: () => ({ meta: [{ title: "Equipe — Doce Gestão" }, { name: "description", content: "Convide pessoas para usar o sistema da confeitaria." }] }),
  component: EquipePage,
});

const membrosQ = {
  queryKey: ["equipe", "membros"],
  queryFn: async () => {
    const { data, error } = await supabase.from("equipe_membros").select("id,email,nome,papel,created_at").order("created_at");
    return error ? [] : (data ?? []);
  },
};
const convitesQ = {
  queryKey: ["equipe", "convites"],
  queryFn: async () => {
    const { data, error } = await supabase.from("equipe_convites").select("id,email,papel,token,expira_em,created_at")
      .is("aceito_em", null).is("cancelado_em", null).gt("expira_em", new Date().toISOString()).order("created_at", { ascending: false });
    return error ? [] : (data ?? []);
  },
};

type PapelEquipe = Exclude<Papel, "dono">;
const linkConvite = (token: string) => `${origemPublica()}/convite/${token}`;

function EquipePage() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { data: meuPapel } = useQuery(meuPapelQ);
  const ehDono = (meuPapel?.papel ?? "dono") === "dono";
  const { data: membros = [] } = useQuery(membrosQ);
  const { data: convites = [] } = useQuery({ ...convitesQ, enabled: ehDono });
  const [email, setEmail] = useState("");
  const [papel, setPapel] = useState<PapelEquipe>("producao");
  const [enviando, setEnviando] = useState(false);

  const atualizar = () => qc.invalidateQueries({ queryKey: ["equipe"] });

  async function convidar(e: React.FormEvent) {
    e.preventDefault();
    setEnviando(true);
    const { data, error } = await supabase.rpc("convidar_membro", { p_email: email, p_papel: papel });
    setEnviando(false);
    if (error) return void toast.error(mensagemEquipe(error.message));
    setEmail("");
    await atualizar();
    const token = (data as { token?: string } | null)?.token;
    if (token) await copiar(linkConvite(token), "Convite criado e link copiado. Envie para a pessoa.");
  }

  async function copiar(texto: string, aviso = "Link copiado.") {
    try { await navigator.clipboard.writeText(texto); toast.success(aviso); } catch { toast.info(texto); }
  }

  async function alterar(id: string, novo: PapelEquipe | null, nome: string) {
    if (novo === null && !window.confirm(`Remover ${nome} da equipe? A pessoa perde o acesso na hora.`)) return;
    const { error } = await supabase.rpc("alterar_membro", { p_id: id, p_papel: novo });
    if (error) return void toast.error(mensagemEquipe(error.message));
    await atualizar();
    toast.success(novo === null ? `${nome} saiu da equipe.` : `Papel de ${nome} alterado.`);
  }

  async function cancelar(id: string) {
    const { error } = await supabase.rpc("cancelar_convite", { p_id: id });
    if (error) return void toast.error(mensagemEquipe(error.message));
    await atualizar();
  }

  async function sairDaEquipe() {
    if (!window.confirm(`Sair da equipe${meuPapel?.confeitaria ? ` de ${meuPapel.confeitaria}` : ""}? Você perde o acesso aos dados da confeitaria.`)) return;
    const { error } = await supabase.rpc("sair_da_equipe");
    if (error) return void toast.error(mensagemEquipe(error.message));
    qc.clear();
    await navigate({ to: "/painel", replace: true });
    window.location.reload();
  }

  if (!ehDono && meuPapel) {
    return (
      <>
        <PageHeader title="Equipe" back="/mais" />
        <Card className="space-y-3">
          <div className="flex items-center gap-3">
            <span className="grid size-11 place-items-center rounded-xl bg-primary/10 text-primary"><UsersRound className="size-5" /></span>
            <div>
              <h2 className="font-semibold">{meuPapel.confeitaria ?? "Confeitaria"}</h2>
              <p className="text-sm text-muted-foreground">Seu acesso: <b>{NOME_PAPEL[meuPapel.papel]}</b> — {DESCRICAO_PAPEL[meuPapel.papel as PapelEquipe]}</p>
            </div>
          </div>
          <ListaMembros membros={membros} />
          <Button type="button" variant="outline" className="h-11 w-full sm:w-auto" onClick={() => void sairDaEquipe()}>Sair da equipe</Button>
        </Card>
      </>
    );
  }

  return (
    <>
      <PageHeader title="Equipe" subtitle="Cada pessoa entra com o próprio e-mail e senha, nos dados da sua confeitaria." back="/mais" />

      <Card className="space-y-4">
        <div className="flex items-center gap-2"><UserPlus className="size-4 text-primary" /><h2 className="text-lg font-semibold">Convidar pessoa</h2></div>
        <form onSubmit={convidar} className="space-y-3">
          <Field label="E-mail da pessoa"><Input type="email" required autoComplete="off" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="ajudante@email.com" className="h-11 bg-card" /></Field>
          <div className="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="Papel">
            {(["producao", "gerente"] as const).map((p) => (
              <button key={p} type="button" role="radio" aria-checked={papel === p} onClick={() => setPapel(p)}
                className={cn("rounded-xl border p-3 text-left text-sm", papel === p ? "border-primary bg-primary/5 ring-1 ring-primary" : "bg-card")}>
                <span className="block font-semibold">{NOME_PAPEL[p]}</span>
                <span className="mt-0.5 block text-xs text-muted-foreground">{DESCRICAO_PAPEL[p]}</span>
              </button>
            ))}
          </div>
          <Button className="h-11 w-full sm:w-auto" disabled={enviando || !email.trim()}><Send className="size-4" /> {enviando ? "Criando convite..." : "Criar convite"}</Button>
          <p className="text-xs text-muted-foreground">O sistema gera um link (válido por 7 dias) para você mandar pelo WhatsApp. A pessoa cria a senha pelo link, com o mesmo e-mail.</p>
        </form>
      </Card>

      {convites.length > 0 && (
        <Card className="mt-5 space-y-2">
          <h2 className="font-semibold">Convites aguardando</h2>
          <ul className="divide-y">
            {convites.map((c) => {
              const link = linkConvite(c.token);
              const whats = `https://wa.me/?text=${encodeURIComponent(`Oi! Te convidei para a equipe da confeitaria no Doce Gestão. Crie sua senha por este link (use o e-mail ${c.email}): ${link}`)}`;
              return (
                <li key={c.id} className="flex flex-wrap items-center gap-2 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{c.email}</p>
                    <p className="text-xs text-muted-foreground">{NOME_PAPEL[c.papel as PapelEquipe] ?? c.papel} · vale até {dataBR(c.expira_em.slice(0, 10))}</p>
                  </div>
                  <Button type="button" size="sm" variant="outline" onClick={() => void copiar(link)}><Copy className="size-4" /> Link</Button>
                  <Button asChild size="sm" variant="outline"><a href={whats} target="_blank" rel="noreferrer"><MessageCircle className="size-4" /> WhatsApp</a></Button>
                  <Button type="button" size="icon" variant="ghost" aria-label={`Cancelar convite de ${c.email}`} onClick={() => void cancelar(c.id)}><Trash2 className="size-4" /></Button>
                </li>
              );
            })}
          </ul>
        </Card>
      )}

      <Card className="mt-5 space-y-2">
        <h2 className="font-semibold">Pessoas na equipe</h2>
        {membros.length === 0 ? <p className="text-sm text-muted-foreground">Só você por enquanto.</p> : (
          <ul className="divide-y">
            {membros.map((m) => (
              <li key={m.id} className="flex flex-wrap items-center gap-2 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{m.nome || m.email}</p>
                  <p className="truncate text-xs text-muted-foreground">{m.nome ? `${m.email} · ` : ""}desde {dataBR(m.created_at.slice(0, 10))}</p>
                </div>
                <select value={m.papel} aria-label={`Papel de ${m.nome || m.email}`} onChange={(e) => void alterar(m.id, e.target.value as PapelEquipe, m.nome || m.email)}
                  className="h-9 rounded-md border bg-card px-2 text-sm">
                  <option value="producao">{NOME_PAPEL.producao}</option>
                  <option value="gerente">{NOME_PAPEL.gerente}</option>
                </select>
                <Button type="button" size="icon" variant="ghost" aria-label={`Remover ${m.nome || m.email}`} onClick={() => void alterar(m.id, null, m.nome || m.email)}><Trash2 className="size-4" /></Button>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}

function ListaMembros({ membros }: { membros: { id: string; email: string; nome: string | null; papel: string }[] }) {
  if (!membros.length) return null;
  return (
    <ul className="divide-y rounded-xl border">
      {membros.map((m) => (
        <li key={m.id} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
          <span className="min-w-0 truncate">{m.nome || m.email}</span>
          <span className="shrink-0 text-xs text-muted-foreground">{NOME_PAPEL[m.papel as PapelEquipe] ?? m.papel}</span>
        </li>
      ))}
    </ul>
  );
}
