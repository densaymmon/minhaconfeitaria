import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Building2, KeyRound, LayoutDashboard, LogOut, Receipt, Settings, ShieldCheck, Tags } from "lucide-react";
// Endereço principal do sistema (o mesmo do login): o link do e-mail sempre volta para ele.
const URL_LOGIN = "https://minhaconfeitaria.app";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { supabase } from "./supabase";
import { Campo, Cartao } from "./ui";
import { PaginaResumo } from "./paginas/Resumo";
import { PaginaEmpresas } from "./paginas/Empresas";
import { PaginaPagamentos } from "./paginas/Pagamentos";
import { PaginaPlanos } from "./paginas/Planos";
import { PaginaConfiguracoes } from "./paginas/Configuracoes";

const PAGINAS = [
  { id: "resumo", rotulo: "Resumo", icone: LayoutDashboard },
  { id: "empresas", rotulo: "Empresas", icone: Building2 },
  { id: "pagamentos", rotulo: "Pagamentos", icone: Receipt },
  { id: "planos", rotulo: "Planos", icone: Tags },
  { id: "configuracoes", rotulo: "Configurações", icone: Settings },
] as const;
type Pagina = (typeof PAGINAS)[number]["id"];

// Chegou por um link de recuperação de senha? (lido antes de o cliente limpar o endereço)
const veioDeRecuperacao = typeof window !== "undefined" && /type=recovery/.test(window.location.hash + window.location.search);

function paginaDoEndereco(): Pagina {
  const h = window.location.hash.replace(/^#\/?/, "").split("?")[0] ?? "";
  return (PAGINAS.find((p) => p.id === h)?.id ?? "resumo") as Pagina;
}

export function App() {
  const [sessao, setSessao] = useState<Session | null | undefined>(undefined);
  const [novaSenha, setNovaSenha] = useState(veioDeRecuperacao);
  useEffect(() => {
    void supabase.auth.getSession().then(({ data }) => setSessao(data.session));
    const { data } = supabase.auth.onAuthStateChange((evento, s) => {
      setSessao(s);
      if (evento === "PASSWORD_RECOVERY") setNovaSenha(true);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  if (sessao === undefined) return <Carregando />;
  if (!sessao) return <Login />;
  if (novaSenha) return <DefinirSenha email={sessao.user.email ?? ""} pronto={() => setNovaSenha(false)} />;
  return <AreaAdmin email={sessao.user.email ?? ""} alterarSenha={() => setNovaSenha(true)} />;
}

function Carregando() {
  return <p className="py-24 text-center text-sm text-muted-foreground" role="status">Carregando…</p>;
}

function Marca() {
  return (
    <div className="flex items-center gap-2">
      <span className="grid size-9 place-items-center rounded-lg bg-primary text-primary-foreground"><ShieldCheck className="size-5" /></span>
      <span className="leading-tight">
        <span className="block font-display text-lg font-semibold">Doce Gestão</span>
        <span className="block text-xs text-muted-foreground">Administração da plataforma</span>
      </span>
    </div>
  );
}

function Login() {
  const [modo, setModo] = useState<"entrar" | "criar" | "esqueci">("entrar");
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [aguarde, setAguarde] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    setAguarde(true);
    setAviso(null);
    try {
      if (modo === "entrar") {
        const { error } = await supabase.auth.signInWithPassword({ email, password: senha });
        if (error) throw new Error(error.message.includes("Invalid") ? "E-mail ou senha incorretos." : error.message.includes("confirm") ? "Confirme seu e-mail pelo link que enviamos antes de entrar." : error.message);
      } else if (modo === "criar") {
        if (senha.length < 8) throw new Error("A senha precisa ter pelo menos 8 caracteres.");
        const { data, error } = await supabase.auth.signUp({ email, password: senha, options: { emailRedirectTo: `${window.location.origin}${window.location.pathname}` } });
        if (error) throw new Error(error.message.includes("Database error") ? "Este e-mail não está autorizado a administrar a plataforma." : error.message);
        if (!data.session) setAviso("Acesso criado! Abra seu e-mail e clique no link de confirmação. Depois, volte aqui e entre com e-mail e senha.");
      } else {
        // O link abre a página de nova senha do sistema (endereço já autorizado no login);
        // depois de salvar, ela traz de volta para este painel.
        const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${URL_LOGIN}/reset-password` });
        if (error) throw new Error(/rate|seconds/i.test(error.message) ? "Aguarde um minuto antes de pedir outro link." : error.message);
        setAviso("Enviamos um link para o seu e-mail. Abra o mais recente, crie a nova senha e volte aqui para entrar.");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Não foi possível continuar.");
    } finally {
      setAguarde(false);
    }
  }

  return (
    <div className="min-h-screen bg-background px-5 py-12">
      <div className="mx-auto max-w-sm">
        <div className="mb-8"><Marca /></div>
        <Cartao>
          <form onSubmit={enviar} className="space-y-4">
            <h1 className="text-xl font-semibold">{modo === "entrar" ? "Entrar" : modo === "criar" ? "Primeiro acesso" : "Recuperar senha"}</h1>
            {modo === "criar" && <p className="text-xs text-muted-foreground">Somente e-mails autorizados como administração conseguem criar o acesso.</p>}
            <Campo rotulo="E-mail"><Input type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} className="h-11" /></Campo>
            {modo !== "esqueci" && (
              <Campo rotulo="Senha"><Input type="password" required autoComplete={modo === "criar" ? "new-password" : "current-password"} value={senha} onChange={(e) => setSenha(e.target.value)} className="h-11" /></Campo>
            )}
            {aviso && <p className="rounded-lg bg-success/10 p-3 text-sm text-success">{aviso}</p>}
            <Button type="submit" className="h-11 w-full" disabled={aguarde}>
              {aguarde ? "Aguarde…" : modo === "entrar" ? "Entrar" : modo === "criar" ? "Criar acesso" : "Enviar link"}
            </Button>
            <div className="flex flex-wrap justify-between gap-2 text-sm">
              {modo === "entrar" ? (
                <>
                  <button type="button" className="text-primary hover:underline" onClick={() => setModo("esqueci")}>Esqueci a senha</button>
                  <button type="button" className="text-primary hover:underline" onClick={() => setModo("criar")}>Primeiro acesso</button>
                </>
              ) : (
                <button type="button" className="text-primary hover:underline" onClick={() => setModo("entrar")}>Voltar para entrar</button>
              )}
            </div>
          </form>
        </Cartao>
      </div>
    </div>
  );
}

function DefinirSenha({ email, pronto }: { email: string; pronto: () => void }) {
  const [senha, setSenha] = useState("");
  const [confirmar, setConfirmar] = useState("");
  const [aguarde, setAguarde] = useState(false);

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    if (senha.length < 8) return void toast.error("Use pelo menos 8 caracteres.");
    if (senha !== confirmar) return void toast.error("As duas senhas não são iguais.");
    setAguarde(true);
    const { error } = await supabase.auth.updateUser({ password: senha });
    setAguarde(false);
    if (error) return void toast.error(/different from the old|same/i.test(error.message) ? "A nova senha precisa ser diferente da anterior." : error.message);
    if (window.location.hash.includes("type=recovery")) window.history.replaceState(null, "", window.location.pathname);
    toast.success("Senha alterada!");
    pronto();
  }

  return (
    <div className="min-h-screen bg-background px-5 py-12">
      <div className="mx-auto max-w-sm">
        <div className="mb-8"><Marca /></div>
        <Cartao>
          <form onSubmit={salvar} className="space-y-4">
            <h1 className="text-xl font-semibold">Criar nova senha</h1>
            <p className="text-sm text-muted-foreground">Conta: {email}</p>
            <Campo rotulo="Nova senha"><Input type="password" required minLength={8} autoComplete="new-password" value={senha} onChange={(e) => setSenha(e.target.value)} className="h-11" /></Campo>
            <Campo rotulo="Repita a nova senha"><Input type="password" required minLength={8} autoComplete="new-password" value={confirmar} onChange={(e) => setConfirmar(e.target.value)} className="h-11" /></Campo>
            <Button type="submit" className="h-11 w-full" disabled={aguarde}>{aguarde ? "Salvando…" : "Salvar nova senha"}</Button>
            <button type="button" className="text-sm text-primary hover:underline" onClick={pronto}>Cancelar</button>
          </form>
        </Cartao>
      </div>
    </div>
  );
}

function AreaAdmin({ email, alterarSenha }: { email: string; alterarSenha: () => void }) {
  const qc = useQueryClient();
  const [pagina, setPagina] = useState<Pagina>(paginaDoEndereco);
  const { data: admin, isPending } = useQuery({
    queryKey: ["eh-admin"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("eh_admin_plataforma");
      if (error) throw new Error(error.message);
      return data === true;
    },
  });

  useEffect(() => {
    const mudar = () => setPagina(paginaDoEndereco());
    window.addEventListener("hashchange", mudar);
    return () => window.removeEventListener("hashchange", mudar);
  }, []);

  async function sair() {
    await supabase.auth.signOut();
    qc.clear();
  }

  if (isPending) return <Carregando />;
  if (!admin) {
    return (
      <div className="min-h-screen bg-background px-5 py-12">
        <Cartao className="mx-auto max-w-sm space-y-3 text-center">
          <h1 className="text-lg font-semibold">Acesso restrito</h1>
          <p className="text-sm text-muted-foreground">A conta {email} não administra a plataforma. Confeitarias acessam o sistema pelo endereço próprio delas.</p>
          <Button type="button" variant="outline" onClick={() => void sair()}><LogOut className="size-4" /> Sair</Button>
        </Cartao>
      </div>
    );
  }

  const ir = (p: Pagina) => { window.location.hash = p; setPagina(p); window.scrollTo({ top: 0 }); };

  return (
    <div className="min-h-screen bg-background">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col border-r bg-card px-4 py-5 lg:flex">
        <Marca />
        <nav className="mt-8 flex-1 space-y-1" aria-label="Menu">
          {PAGINAS.map(({ id, rotulo, icone: Icone }) => (
            <button key={id} type="button" onClick={() => ir(id)} aria-current={pagina === id ? "page" : undefined}
              className={cn("flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium", pagina === id ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted hover:text-foreground")}>
              <Icone className="size-5" /> {rotulo}
            </button>
          ))}
        </nav>
        <p className="truncate px-3 text-xs text-muted-foreground" title={email}>{email}</p>
        <button type="button" onClick={alterarSenha} className="mt-2 flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-muted-foreground hover:bg-muted"><KeyRound className="size-5" /> Alterar senha</button>
        <button type="button" onClick={() => void sair()} className="mt-2 flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-muted-foreground hover:bg-muted"><LogOut className="size-5" /> Sair</button>
      </aside>

      <header className="sticky top-0 z-20 flex items-center justify-between border-b bg-background/90 px-4 py-3 backdrop-blur lg:hidden">
        <Marca />
        <div className="flex gap-1">
          <Button type="button" size="sm" variant="ghost" onClick={alterarSenha} aria-label="Alterar senha"><KeyRound className="size-4" /></Button>
          <Button type="button" size="sm" variant="ghost" onClick={() => void sair()} aria-label="Sair"><LogOut className="size-4" /></Button>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 pb-28 pt-5 sm:px-6 lg:pl-68 lg:pt-8">
        {pagina === "resumo" && <PaginaResumo ir={ir} />}
        {pagina === "empresas" && <PaginaEmpresas />}
        {pagina === "pagamentos" && <PaginaPagamentos />}
        {pagina === "planos" && <PaginaPlanos />}
        {pagina === "configuracoes" && <PaginaConfiguracoes />}
      </main>

      <nav className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t bg-card lg:hidden" aria-label="Menu" style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
        {PAGINAS.map(({ id, rotulo, icone: Icone }) => (
          <button key={id} type="button" onClick={() => ir(id)} aria-current={pagina === id ? "page" : undefined}
            className={cn("flex min-h-14 flex-col items-center justify-center gap-0.5 text-[11px] font-medium", pagina === id ? "text-primary" : "text-muted-foreground")}>
            <Icone className="size-5" /> {rotulo === "Configurações" ? "Ajustes" : rotulo}
          </button>
        ))}
      </nav>
    </div>
  );
}
