import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { URL_PAINEL_ADMIN } from "@/lib/assinatura";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/app/ui";

export const Route = createFileRoute("/reset-password")({
  ssr: false,
  head: () => ({
    meta: [
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { title: "Nova senha — Doce Gestão" },
      { name: "description", content: "Defina uma nova senha de acesso." },
      { property: "og:title", content: "Nova senha — Doce Gestão" },
      { property: "og:description", content: "Defina uma nova senha de acesso." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: Reset,
});

/**
 * Nova senha. Aceita os formatos de link de recuperação do Supabase:
 * #access_token=…&type=recovery (implícito), ?code=… (PKCE) e ?token_hash=…&type=recovery.
 * Em todos eles a pessoa chega com sessão; sem sessão, pede um novo link.
 */
function Reset() {
  const navigate = useNavigate();
  const [senha, setSenha] = useState("");
  const [confirmar, setConfirmar] = useState("");
  const [loading, setLoading] = useState(false);
  const [estado, setEstado] = useState<"verificando" | "pronto" | "sem-link" | "salvo">("verificando");
  const [email, setEmail] = useState<string | null>(null);
  const [ehAdmin, setEhAdmin] = useState(false);
  const [motivo, setMotivo] = useState<string | null>(null);

  useEffect(() => {
    let ativo = true;
    const marcarPronto = (e?: string | null) => { if (ativo) { setEmail(e ?? null); setEstado("pronto"); } };
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      if ((event === "PASSWORD_RECOVERY" || event === "SIGNED_IN") && session) marcarPronto(session.user.email);
    });
    void (async () => {
      // Erro vindo do link (vencido, já usado): mostra o motivo em vez de esperar a sessão.
      let link = "";
      try { link = sessionStorage.getItem("docegestao:link-senha") ?? ""; sessionStorage.removeItem("docegestao:link-senha"); } catch { /* sem armazenamento */ }
      const dados = new URLSearchParams((link || window.location.hash + window.location.search).replace(/^[#?]/, "").replace(/[#?]/g, "&"));
      const codigoErro = dados.get("error_code") ?? dados.get("error");
      if (codigoErro) {
        const { data: s } = await supabase.auth.getSession();
        if (!s.session) {
          if (ativo) {
            setMotivo(/expired/i.test(codigoErro + (dados.get("error_description") ?? "")) ? "O link venceu ou já foi usado." : "O link não é válido.");
            setEstado("sem-link");
          }
          return;
        }
      }
      const params = new URLSearchParams(window.location.search);
      const tokenHash = params.get("token_hash");
      if (tokenHash && params.get("type") === "recovery") {
        const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: "recovery" });
        if (error && ativo) { setEstado("sem-link"); return; }
      }
      // Dá tempo para o cliente trocar o código/token do link pela sessão.
      for (let i = 0; i < 10 && ativo; i++) {
        const { data: s } = await supabase.auth.getSession();
        if (s.session) return marcarPronto(s.session.user.email);
        await new Promise((ok) => setTimeout(ok, 300));
      }
      if (ativo) setEstado((atual) => (atual === "verificando" ? "sem-link" : atual));
    })();
    return () => { ativo = false; data.subscription.unsubscribe(); };
  }, []);

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    if (senha.length < 8) return void toast.error("Use pelo menos 8 caracteres.");
    if (senha !== confirmar) return void toast.error("As duas senhas não são iguais.");
    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password: senha });
    if (error) {
      setLoading(false);
      return void toast.error(/different from the old|same/i.test(error.message) ? "A nova senha precisa ser diferente da anterior." : /weak|short/i.test(error.message) ? "Senha fraca. Use letras e números, com pelo menos 8 caracteres." : error.message);
    }
    const { data: admin } = await supabase.rpc("eh_admin_plataforma");
    setLoading(false);
    toast.success("Senha alterada!");
    // Conta da administração: entra pelo painel separado com a nova senha.
    if (admin === true) {
      setEhAdmin(true);
      setEstado("salvo");
      await supabase.auth.signOut();
      return;
    }
    navigate({ to: "/painel" });
  }

  return (
    <div className="min-h-screen bg-hero px-5 py-16">
      <div className="mx-auto max-w-sm space-y-4 rounded-2xl bg-card p-5 shadow-soft">
        {estado === "salvo" && ehAdmin ? (
          <>
            <h1 className="text-xl font-semibold">Senha alterada ✅</h1>
            <p className="text-sm text-muted-foreground">Agora entre no painel de administração com o seu e-mail e a nova senha.</p>
            <Button asChild className="h-11 w-full"><a href={URL_PAINEL_ADMIN}>Abrir o painel de administração</a></Button>
          </>
        ) : estado === "sem-link" ? (
          <>
            <h1 className="text-xl font-semibold">Link expirado ou já usado</h1>
            <p className="text-sm text-muted-foreground">{motivo ? `${motivo} ` : ""}Peça um novo link em “Esqueci a senha” e abra o e-mail mais recente. Cada link funciona uma vez só e vale por pouco tempo.</p>
            <Button type="button" variant="outline" className="h-11 w-full" onClick={() => navigate({ to: "/auth" })}>Voltar para entrar</Button>
          </>
        ) : (
          <form onSubmit={salvar} className="space-y-4">
            <h1 className="text-xl font-semibold">Definir nova senha</h1>
            {estado === "verificando" ? <p className="text-sm text-muted-foreground" role="status">Conferindo o link…</p> : email && <p className="text-sm text-muted-foreground">Conta: {email}</p>}
            <Field label="Nova senha">
              <Input type="password" value={senha} onChange={(e) => setSenha(e.target.value)} className="h-11" autoComplete="new-password" minLength={8} required />
            </Field>
            <Field label="Repita a nova senha">
              <Input type="password" value={confirmar} onChange={(e) => setConfirmar(e.target.value)} className="h-11" autoComplete="new-password" minLength={8} required />
            </Field>
            <Button className="h-11 w-full" disabled={loading || estado !== "pronto"}>{loading ? "Salvando…" : "Salvar nova senha"}</Button>
          </form>
        )}
      </div>
    </div>
  );
}
