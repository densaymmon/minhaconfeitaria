import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { plataformaPublicaQ } from "@/lib/queries";
import { TERMOS_VERSAO, contato } from "@/lib/termos";
import { useState } from "react";
import { toast } from "sonner";
import { CakeSlice } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import bakeryImage from "@/assets/confeitaria.jpg";
import { oauthReturnPath } from "@/lib/oauth-return-path";
import { Field } from "@/components/app/ui";

export const Route = createFileRoute("/auth")({
  ssr: false,
  validateSearch: (s: Record<string, unknown>): { next?: string } => ({ next: oauthReturnPath(s["next"]) }),
  head: () => ({
    meta: [
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { title: "Entrar — Doce Gestão" },
      { name: "description", content: "Acesse ou crie a conta da sua confeitaria." },
      { property: "og:title", content: "Entrar — Doce Gestão" },
      { property: "og:description", content: "Acesse ou crie a conta da sua confeitaria." },
    ],
  }),
  component: AuthPage,
});

type Modo = "entrar" | "criar" | "esqueci";

function AuthPage() {
  const { next } = Route.useSearch();
  const destination = !next || next === "/" ? "/painel" : next;
  function finishLogin() { window.location.assign(destination); }
  const [modo, setModo] = useState<Modo>("entrar");
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [loading, setLoading] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const [nomeLoja, setNomeLoja] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [aceite, setAceite] = useState(false);
  const { data: plataforma } = useQuery(plataformaPublicaQ);
  // Sem a informação (banco antigo ou falha de rede), mantém o cadastro visível como antes.
  const cadastroFechado = plataforma?.cadastro_aberto === false;

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setAviso(null);
    try {
      if (modo === "entrar") {
        const { error } = await supabase.auth.signInWithPassword({ email, password: senha });
        if (error) throw new Error(error.message.includes("Invalid") ? "E-mail ou senha incorretos." : error.message);
        finishLogin();
      } else if (modo === "criar") {
        if (nomeLoja.trim().length < 2) throw new Error("Informe o nome da confeitaria.");
        if (whatsapp.replace(/\D/g, "").length < 10) throw new Error("Informe o WhatsApp da confeitaria com DDD.");
        if (senha.length < 8) throw new Error("A senha precisa ter pelo menos 8 caracteres.");
        if (!aceite) throw new Error("Para criar a conta, aceite os termos de uso e a política de privacidade.");
        const { data, error } = await supabase.auth.signUp({
          email,
          password: senha,
          options: {
            emailRedirectTo: new URL(destination, window.location.origin).href,
            data: { nome_confeitaria: nomeLoja.trim().slice(0, 80), whatsapp: whatsapp.trim().slice(0, 30), termos_versao: TERMOS_VERSAO },
          },
        });
        if (error)
          throw new Error(
            error.message.includes("Database error")
              ? "O cadastro de novas confeitarias está fechado no momento. Fale com o suporte para liberar o acesso."
              : error.message,
          );
        const aprovacao = plataforma?.aprovacao_manual !== false;
        if (data.session) finishLogin();
        else setAviso(`Conta criada! Abra seu e-mail e clique no link de confirmação para entrar.${aprovacao ? " Depois, é só aguardar a liberação do acesso." : ""}`);
      } else {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/reset-password`,
        });
        if (error) throw new Error(error.message);
        setAviso("Enviamos um link para redefinir sua senha.");
      }
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-background px-5 py-10">
      <div className="mx-auto max-w-sm">
        <div className="mb-8 text-center text-foreground">
          <div className="mx-auto mb-3 grid size-16 place-items-center rounded-2xl bg-accent text-primary">
            <CakeSlice className="size-8" />
          </div>
          <h1 className="text-3xl font-semibold">Doce Gestão</h1>
          <p className="mt-1 text-sm opacity-80">O caderno digital da sua confeitaria</p>
        </div>
        <img src={bakeryImage} width={1152} height={576} alt="Bolo caseiro, pão italiano e baguetes artesanais" className="mb-6 w-full rounded-lg" />
        <form onSubmit={enviar} className="space-y-4">
          <h2 className="text-xl font-semibold">
            {modo === "entrar" ? "Entrar" : modo === "criar" ? "Criar conta da confeitaria" : "Recuperar senha"}
          </h2>
          {modo === "criar" && (
            <>
              <p className="text-xs text-muted-foreground">
                Cada conta é uma confeitaria, com dados separados e acessíveis só por você. Depois de entrar, um passo a passo ajuda a configurar o Pix e o catálogo.
              </p>
              <Field label="Nome da confeitaria">
                <Input required maxLength={80} autoComplete="organization" value={nomeLoja} onChange={(e) => setNomeLoja(e.target.value)} className="h-11" />
              </Field>
              <Field label="WhatsApp da confeitaria">
                <Input required type="tel" inputMode="tel" maxLength={30} autoComplete="tel" placeholder="(19) 99999-9999" value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)} className="h-11" />
              </Field>
            </>
          )}
          <Field label="E-mail">
            <Input type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} className="h-11" />
          </Field>
          {modo !== "esqueci" && (
            <Field label="Senha">
              <Input
                type="password"
                required
                autoComplete={modo === "criar" ? "new-password" : "current-password"}
                value={senha}
                onChange={(e) => setSenha(e.target.value)}
                className="h-11"
              />
            </Field>
          )}
          {modo === "criar" && (
            <label className="flex items-start gap-2 text-sm">
              <input type="checkbox" required checked={aceite} onChange={(e) => setAceite(e.target.checked)} className="mt-0.5 size-5 shrink-0 accent-primary" />
              <span>
                Li e aceito os <Link to="/termos" target="_blank" className="text-primary underline">termos de uso</Link> e a{" "}
                <Link to="/privacidade" target="_blank" className="text-primary underline">política de privacidade</Link>.
              </span>
            </label>
          )}
          {aviso && <p className="rounded-lg bg-success/10 p-3 text-sm text-success">{aviso}</p>}
          <Button type="submit" className="h-11 w-full" disabled={loading}>
            {loading ? "Aguarde..." : modo === "entrar" ? "Entrar" : modo === "criar" ? "Criar conta" : "Enviar link"}
          </Button>
          <div className="flex justify-between text-sm">
            {modo !== "entrar" ? (
              <Button variant="link" type="button" onClick={() => setModo("entrar")}>
                Voltar para entrar
              </Button>
            ) : (
              <>
                <Button variant="link" type="button" onClick={() => setModo("esqueci")}>
                  Esqueci a senha
                </Button>
                {!cadastroFechado && (
                  <Button variant="link" type="button" onClick={() => setModo("criar")}>
                    Criar conta
                  </Button>
                )}
              </>
            )}
          </div>
          {modo === "entrar" && cadastroFechado && (
            <p className="text-center text-xs text-muted-foreground">
              Quer usar o Doce Gestão na sua confeitaria? Fale com a gente: {contato(plataforma)}.
            </p>
          )}
        </form>
        <p className="mt-8 text-center text-xs text-muted-foreground">
          <Link to="/termos" className="hover:underline">Termos de uso</Link> · <Link to="/privacidade" className="hover:underline">Privacidade</Link>
        </p>
      </div>
    </div>
  );
}
