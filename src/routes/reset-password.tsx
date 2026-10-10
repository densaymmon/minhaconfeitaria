import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
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
    ],
  }),
  component: Reset,
});

function Reset() {
  const navigate = useNavigate();
  const [senha, setSenha] = useState("");
  const [loading, setLoading] = useState(false);
  const [recovery, setRecovery] = useState(false);
  useEffect(() => {
    setRecovery(new URLSearchParams(window.location.hash.slice(1)).get("type") === "recovery");
    const { data } = supabase.auth.onAuthStateChange(event => {
      if (event === "PASSWORD_RECOVERY") setRecovery(true);
    });
    return () => data.subscription.unsubscribe();
  }, []);
  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    if (!recovery) return void toast.error("Abra o link de recuperação enviado ao seu e-mail.");
    if (senha.length < 8) return void toast.error("Use pelo menos 8 caracteres.");
    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password: senha });
    setLoading(false);
    if (error) return void toast.error(error.message);
    toast.success("Senha alterada!");
    navigate({ to: "/painel" });
  }
  return (
    <div className="min-h-screen bg-hero px-5 py-16">
      <form onSubmit={salvar} className="mx-auto max-w-sm space-y-4 rounded-2xl bg-card p-5 shadow-soft">
        <h1 className="text-xl font-semibold">Definir nova senha</h1>
        {!recovery && <p className="text-sm text-muted-foreground">Abra o link de recuperação enviado ao seu e-mail.</p>}
        <Field label="Nova senha">
          <Input type="password" value={senha} onChange={(e) => setSenha(e.target.value)} className="h-11" autoComplete="new-password" />
        </Field>
        <Button className="h-11 w-full" disabled={loading || !recovery}>Salvar</Button>
      </form>
    </div>
  );
}
