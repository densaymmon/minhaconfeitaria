// Regras mínimas de senha usadas em cadastro, convite, recuperação e no painel de administração.
// A regra vale no navegador; a trava definitiva (tamanho mínimo e senhas vazadas) é uma
// configuração do Supabase Auth, que o proprietário confirma no painel (ver docs/conformidade-seguranca-lgpd.md).

export const SENHA_TAMANHO_MINIMO = 10;

const SENHAS_COMUNS = new Set([
  "1234567890", "12345678910", "123456789012", "0123456789", "0987654321", "1q2w3e4r5t", "qwertyuiop", "asdfghjkl1",
  "senha12345", "senha123456", "minhasenha", "mudar12345", "password123", "password1234", "passw0rd123", "abc1234567",
  "confeitaria", "confeitaria1", "confeitaria123", "docegestao", "docegestao1", "docegestao123", "bolodecenoura",
]);

/** Devolve a mensagem de erro em português, ou null quando a senha é aceitável. */
export function validarSenha(senha: string, email?: string | null): string | null {
  if (senha.length < SENHA_TAMANHO_MINIMO) return `A senha precisa ter pelo menos ${SENHA_TAMANHO_MINIMO} caracteres.`;
  const normalizada = senha.trim().toLowerCase();
  if (SENHAS_COMUNS.has(normalizada) || /^(.)\1+$/.test(normalizada)) return "Essa senha é muito comum. Escolha outra, mais difícil de adivinhar.";
  const parteEmail = (email ?? "").trim().toLowerCase().split("@")[0] ?? "";
  if (parteEmail.length >= 4 && normalizada.includes(parteEmail)) return "A senha não pode conter o seu e-mail.";
  return null;
}
