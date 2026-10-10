import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { CakeSlice } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/app/ui";

export const Route = createFileRoute("/auth")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Entrar — Doce Gestão" },
      { name: "description", content: "Acesso exclusivo da proprietária ao sistema da confeitaria." },
      { property: "og:title", content: "Entrar — Doce Gestão" },
      { property: "og:description", content: "Acesso exclusivo da proprietária." },
    ],
  }),
  component: AuthPage,
});

type Modo = "entrar" | "criar" | "esqueci";

function AuthPage() {
  const navigate = useNavigate();
  const [modo, setModo] = useState<Modo>("entrar");
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [loading, setLoading] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setAviso(null);
    try {
      if (modo === "entrar") {
        const { error } = await supabase.auth.signInWithPassword({ email, password: senha });
        if (error) throw new Error(error.message.includes("Invalid") ? "E-mail ou senha incorretos." : error.message);
        navigate({ to: "/painel" });
      } else if (modo === "criar") {
        if (senha.length < 8) throw new Error("A senha precisa ter pelo menos 8 caracteres.");
        const { data, error } = await supabase.auth.signUp({
          email,
          password: senha,
          options: { emailRedirectTo: window.location.origin },
        });
        if (error)
          throw new Error(
            error.message.includes("Database error") ? "O sistema já tem uma proprietária cadastrada." : error.message,
          );
        if (data.session) navigate({ to: "/painel" });
        else setAviso("Conta criada! Abra seu e-mail e clique no link de confirmação para entrar.");
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
    <div className="min-h-screen bg-hero px-5 py-10">
      <div className="mx-auto max-w-sm">
        <div className="mb-8 text-center text-primary-foreground">
          <div className="mx-auto mb-3 grid size-16 place-items-center rounded-2xl bg-primary-foreground/15">
            <CakeSlice className="size-8" />
          </div>
          <h1 className="text-3xl font-semibold">Doce Gestão</h1>
          <p className="mt-1 text-sm opacity-80">O caderno digital da sua confeitaria</p>
        </div>
        <form onSubmit={enviar} className="space-y-4 rounded-2xl bg-card p-5 shadow-soft">
          <h2 className="text-xl font-semibold">
            {modo === "entrar" ? "Entrar" : modo === "criar" ? "Primeiro acesso" : "Recuperar senha"}
          </h2>
          {modo === "criar" && (
            <p className="text-xs text-muted-foreground">
              Só uma conta pode ser criada. Depois do primeiro cadastro, o sistema fica exclusivo para você.
            </p>
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
          {aviso && <p className="rounded-lg bg-success/10 p-3 text-sm text-success">{aviso}</p>}
          <Button type="submit" className="h-11 w-full" disabled={loading}>
            {loading ? "Aguarde..." : modo === "entrar" ? "Entrar" : modo === "criar" ? "Criar conta" : "Enviar link"}
          </Button>
          <div className="flex justify-between text-sm">
            {modo !== "entrar" ? (
              <button type="button" className="text-primary" onClick={() => setModo("entrar")}>
                Voltar para entrar
              </button>
            ) : (
              <>
                <button type="button" className="text-muted-foreground" onClick={() => setModo("esqueci")}>
                  Esqueci a senha
                </button>
                <button type="button" className="text-primary" onClick={() => setModo("criar")}>
                  Primeiro acesso
                </button>
              </>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}
