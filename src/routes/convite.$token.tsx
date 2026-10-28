import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { CakeSlice, UsersRound } from "lucide-react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { DESCRICAO_PAPEL, NOME_PAPEL, mensagemEquipe } from "@/lib/assinatura";
import { origemPublica } from "@/lib/catalogo";
import { Field } from "@/components/app/ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export const Route = createFileRoute("/convite/$token")({
  ssr: false,
  head: () => ({ meta: [{ title: "Convite para a equipe — Doce Gestão" }, { name: "robots", content: "noindex" }] }),
  component: ConvitePage,
});

type Convite = { confeitaria: string; papel: "gerente" | "producao"; email: string; valido: boolean; aceito: boolean };

function ConvitePage() {
  const { token } = Route.useParams();
  const tokenValido = /^[0-9a-f-]{36}$/i.test(token);
  const { data: convite, isLoading } = useQuery({
    queryKey: ["convite", token],
    enabled: tokenValido,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("ver_convite", { p_token: token });
      if (error) throw new Error(error.message);
      return (data as Convite | null) ?? null;
    },
  });
  const [sessao, setSessao] = useState<Session | null | undefined>(undefined);
  useEffect(() => { void supabase.auth.getSession().then(({ data }) => setSessao(data.session)); }, []);

  return (
    <div className="grid min-h-screen place-items-center bg-background px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <span className="mx-auto grid size-12 place-items-center rounded-2xl bg-primary text-primary-foreground"><CakeSlice className="size-6" /></span>
          <p className="mt-2 text-sm text-muted-foreground">Doce Gestão</p>
        </div>
        {!tokenValido || (!isLoading && !convite) ? (
          <Aviso titulo="Convite não encontrado" texto="Confira o link ou peça um novo para a dona da confeitaria." />
        ) : isLoading || sessao === undefined || !convite ? (
          <p className="text-center text-sm text-muted-foreground" role="status">Carregando convite…</p>
        ) : convite.aceito ? (
          <Aviso titulo="Convite já usado" texto="Este convite já foi aceito. Entre com seu e-mail e senha." acao={<Button asChild className="mt-4 h-11 w-full"><Link to="/auth">Entrar</Link></Button>} />
        ) : !convite.valido ? (
          <Aviso titulo="Convite expirado" texto="Peça um novo link para a dona da confeitaria." />
        ) : (
          <Aceite token={token} convite={convite} sessao={sessao} />
        )}
      </div>
    </div>
  );
}

function Aviso({ titulo, texto, acao }: { titulo: string; texto: string; acao?: React.ReactNode }) {
  return (
    <div className="rounded-2xl bg-card p-6 text-center shadow-soft">
      <h1 className="font-display text-2xl font-semibold">{titulo}</h1>
      <p className="mt-2 text-sm text-muted-foreground">{texto}</p>
      {acao}
    </div>
  );
}

function Aceite({ token, convite, sessao }: { token: string; convite: Convite; sessao: Session | null }) {
  const [modo, setModo] = useState<"criar" | "entrar">("criar");
  const [nome, setNome] = useState("");
  const [senha, setSenha] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [confirmarEmail, setConfirmarEmail] = useState(false);
  const emailLogado = sessao?.user.email?.toLowerCase() ?? null;

  const irParaSistema = () => { window.location.href = "/painel"; };

  async function aceitar() {
    setOcupado(true);
    setErro(null);
    const { error } = await supabase.rpc("aceitar_convite", { p_token: token, ...(nome.trim() ? { p_nome: nome.trim() } : {}) });
    setOcupado(false);
    if (error) return setErro(mensagemEquipe(error.message));
    irParaSistema();
  }

  async function criarConta(e: React.FormEvent) {
    e.preventDefault();
    if (senha.length < 8) return setErro("A senha precisa ter pelo menos 8 caracteres.");
    setOcupado(true);
    setErro(null);
    const { data, error } = await supabase.auth.signUp({
      email: convite.email,
      password: senha,
      options: { data: { convite_token: token, nome: nome.trim() }, emailRedirectTo: `${origemPublica()}/painel` },
    });
    setOcupado(false);
    if (error) {
      return setErro(/registered|already/i.test(error.message)
        ? "Este e-mail já tem conta. Use “Já tenho conta” para entrar e aceitar o convite."
        : "Não foi possível criar a conta. Confira se o link é o mais recente e tente de novo.");
    }
    if (data.session) return irParaSistema();
    setConfirmarEmail(true);
  }

  async function entrar(e: React.FormEvent) {
    e.preventDefault();
    setOcupado(true);
    setErro(null);
    const { error } = await supabase.auth.signInWithPassword({ email: convite.email, password: senha });
    if (error) { setOcupado(false); return setErro("E-mail ou senha incorretos."); }
    await aceitar();
  }

  const cabecalho = (
    <div className="mb-4 flex items-start gap-3">
      <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary"><UsersRound className="size-5" /></span>
      <div>
        <h1 className="font-display text-xl font-semibold leading-tight">Convite da {convite.confeitaria}</h1>
        <p className="mt-1 text-sm text-muted-foreground">Acesso de <b>{NOME_PAPEL[convite.papel]}</b>: {DESCRICAO_PAPEL[convite.papel]}</p>
      </div>
    </div>
  );

  if (confirmarEmail) {
    return <Aviso titulo="Confirme seu e-mail" texto={`Enviamos um link para ${convite.email}. Abra o e-mail, confirme e depois entre com sua senha: você já estará na equipe.`} />;
  }

  if (sessao) {
    return (
      <div className="rounded-2xl bg-card p-6 shadow-soft">
        {cabecalho}
        {emailLogado === convite.email ? (
          <>
            <Field label="Seu nome (opcional)"><Input value={nome} maxLength={80} onChange={(e) => setNome(e.target.value)} className="h-11" /></Field>
            {erro && <p role="alert" className="mt-3 rounded-xl bg-destructive/10 p-3 text-sm text-destructive">{erro}</p>}
            <Button type="button" className="mt-4 h-11 w-full" disabled={ocupado} onClick={() => void aceitar()}>{ocupado ? "Entrando…" : "Entrar na equipe"}</Button>
          </>
        ) : (
          <>
            <p className="rounded-xl bg-warning/15 p-3 text-sm text-warning-foreground">Você está conectado como {emailLogado}, mas o convite é para {convite.email}.</p>
            <Button type="button" variant="outline" className="mt-4 h-11 w-full" onClick={() => void supabase.auth.signOut().then(() => window.location.reload())}>Sair e usar {convite.email}</Button>
          </>
        )}
      </div>
    );
  }

  return (
    <div className="rounded-2xl bg-card p-6 shadow-soft">
      {cabecalho}
      <div className="mb-4 grid grid-cols-2 rounded-xl bg-muted p-1 text-sm font-medium" role="tablist">
        {(["criar", "entrar"] as const).map((m) => (
          <button key={m} type="button" role="tab" aria-selected={modo === m} onClick={() => { setModo(m); setErro(null); }}
            className={`rounded-lg py-2 ${modo === m ? "bg-card shadow-sm" : "text-muted-foreground"}`}>{m === "criar" ? "Criar senha" : "Já tenho conta"}</button>
        ))}
      </div>
      <form onSubmit={modo === "criar" ? criarConta : entrar} className="space-y-3">
        <Field label="E-mail"><Input value={convite.email} readOnly className="h-11 bg-muted" /></Field>
        {modo === "criar" && <Field label="Seu nome"><Input value={nome} maxLength={80} autoComplete="name" onChange={(e) => setNome(e.target.value)} className="h-11" /></Field>}
        <Field label={modo === "criar" ? "Crie uma senha" : "Senha"}>
          <Input type="password" required minLength={modo === "criar" ? 8 : 1} autoComplete={modo === "criar" ? "new-password" : "current-password"} value={senha} onChange={(e) => setSenha(e.target.value)} className="h-11" />
        </Field>
        {erro && <p role="alert" className="rounded-xl bg-destructive/10 p-3 text-sm text-destructive">{erro}</p>}
        <Button className="h-11 w-full" disabled={ocupado}>{ocupado ? "Aguarde…" : modo === "criar" ? "Criar conta e entrar na equipe" : "Entrar e aceitar"}</Button>
      </form>
    </div>
  );
}
