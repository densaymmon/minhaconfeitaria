import { Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { CakeSlice, Clock3, LogOut, Lock, ScrollText } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { plataformaPublicaQ, type Confeitaria } from "@/lib/queries";
import { NOME_PLATAFORMA, TERMOS_VERSAO, contato } from "@/lib/termos";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/app/ui";

function Moldura({ icone, titulo, children, sair }: { icone: React.ReactNode; titulo: string; children: React.ReactNode; sair: () => void }) {
  return (
    <div className="min-h-screen bg-background px-5 py-10">
      <main className="mx-auto max-w-md">
        <div className="mb-6 flex items-center gap-2 font-display text-lg font-semibold">
          <span className="grid size-9 place-items-center rounded-lg bg-primary text-primary-foreground"><CakeSlice className="size-5" /></span>
          {NOME_PLATAFORMA}
        </div>
        <div className="rounded-2xl border bg-card p-5 shadow-soft">
          <div className="mb-3 grid size-12 place-items-center rounded-full bg-accent text-primary">{icone}</div>
          <h1 className="font-display text-2xl font-semibold">{titulo}</h1>
          <div className="mt-3 space-y-4 text-sm">{children}</div>
        </div>
        <Button type="button" variant="ghost" className="mt-4 w-full" onClick={sair}><LogOut className="size-4" /> Sair da conta</Button>
      </main>
    </div>
  );
}

/** Conta cadastrada aguardando liberação: confirma os dados de contato. */
export function TelaPendente({ confeitaria, sair }: { confeitaria: Confeitaria; sair: () => void }) {
  const qc = useQueryClient();
  const { data: plataforma } = useQuery(plataformaPublicaQ);
  const [dados, setDados] = useState({ nome: confeitaria.nome ?? "", whatsapp: confeitaria.whatsapp ?? "", cidade: confeitaria.cidade ?? "" });
  const [salvando, setSalvando] = useState(false);

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    if (dados.nome.trim().length < 2) return void toast.error("Informe o nome da confeitaria.");
    setSalvando(true);
    const { error } = await supabase.from("confeitarias").update({
      nome: dados.nome.trim().slice(0, 80),
      whatsapp: dados.whatsapp.trim().slice(0, 30) || null,
      cidade: dados.cidade.trim().slice(0, 60) || null,
    }).eq("user_id", confeitaria.user_id);
    setSalvando(false);
    if (error) return void toast.error(`Não foi possível salvar: ${error.message}`);
    await qc.invalidateQueries({ queryKey: ["confeitaria"] });
    toast.success("Dados atualizados.");
  }

  return (
    <Moldura icone={<Clock3 className="size-6" />} titulo="Cadastro recebido!" sair={sair}>
      <p className="text-muted-foreground">
        Seu acesso ao {NOME_PLATAFORMA} está aguardando liberação. Vamos entrar em contato pelo WhatsApp abaixo. Assim que o acesso for liberado, esta página abre o sistema.
      </p>
      <form onSubmit={salvar} className="space-y-3">
        <Field label="Nome da confeitaria"><Input required maxLength={80} value={dados.nome} onChange={(e) => setDados({ ...dados, nome: e.target.value })} className="h-11" /></Field>
        <Field label="WhatsApp"><Input type="tel" inputMode="tel" maxLength={30} value={dados.whatsapp} onChange={(e) => setDados({ ...dados, whatsapp: e.target.value })} className="h-11" /></Field>
        <Field label="Cidade"><Input maxLength={60} value={dados.cidade} onChange={(e) => setDados({ ...dados, cidade: e.target.value })} className="h-11" /></Field>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button type="submit" variant="outline" className="h-11 flex-1" disabled={salvando}>{salvando ? "Salvando..." : "Salvar dados"}</Button>
          <Button type="button" className="h-11 flex-1" onClick={() => void qc.invalidateQueries({ queryKey: ["confeitaria"] })}>Verificar liberação</Button>
        </div>
      </form>
      <p className="text-xs text-muted-foreground">Dúvidas: {contato(plataforma)}.</p>
    </Moldura>
  );
}

/** Conta bloqueada pela administração (por exemplo, mensalidade em aberto). */
export function TelaBloqueada({ sair }: { sair: () => void }) {
  const { data: plataforma } = useQuery(plataformaPublicaQ);
  return (
    <Moldura icone={<Lock className="size-6" />} titulo="Acesso suspenso" sair={sair}>
      <p className="text-muted-foreground">
        O acesso desta confeitaria está suspenso e o catálogo on-line saiu do ar. Seus pedidos, clientes e produtos continuam guardados.
      </p>
      <p>Para reativar, fale com a gente: <b>{contato(plataforma)}</b>.</p>
    </Moldura>
  );
}

/** Aceite dos termos (contas antigas ou nova versão dos termos). */
export function AceiteTermos({ jaAceitou, sair }: { jaAceitou: boolean; sair: () => void }) {
  const qc = useQueryClient();
  const [aceite, setAceite] = useState(false);
  const [salvando, setSalvando] = useState(false);

  async function aceitar() {
    setSalvando(true);
    const { error } = await supabase.rpc("aceitar_termos", { p_versao: TERMOS_VERSAO });
    setSalvando(false);
    if (error) return void toast.error(`Não foi possível registrar o aceite: ${error.message}`);
    await qc.invalidateQueries({ queryKey: ["confeitaria"] });
  }

  return (
    <Moldura icone={<ScrollText className="size-6" />} titulo={jaAceitou ? "Atualizamos os termos" : "Termos de uso"} sair={sair}>
      <p className="text-muted-foreground">
        {jaAceitou
          ? "Os termos de uso e a política de privacidade mudaram. Leia e aceite a nova versão para continuar usando o sistema."
          : "Para continuar usando o sistema, leia e aceite os termos de uso e a política de privacidade."}
      </p>
      <label className="flex items-start gap-2">
        <input type="checkbox" checked={aceite} onChange={(e) => setAceite(e.target.checked)} className="mt-0.5 size-5 shrink-0 accent-primary" />
        <span>
          Li e aceito os <Link to="/termos" target="_blank" className="text-primary underline">termos de uso</Link> e a{" "}
          <Link to="/privacidade" target="_blank" className="text-primary underline">política de privacidade</Link>.
        </span>
      </label>
      <Button type="button" className="h-11 w-full" disabled={!aceite || salvando} onClick={() => void aceitar()}>
        {salvando ? "Registrando..." : "Aceitar e continuar"}
      </Button>
    </Moldura>
  );
}
