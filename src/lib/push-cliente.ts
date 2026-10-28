import { supabase } from "@/integrations/supabase/client";
import { deBase64Url } from "./web-push";

/** Chave pública VAPID (a privada fica só no banco, em plataforma_segredos). */
export const VAPID_PUBLICA = "BBOE7Nf2kyoknJxpTuBCYFcROfRqxGi4eVDEuh6SUj_Q6XlaKd31b_Y6ocz9fOucCgQyBRPqTrNOwD-8FyX5DFs";

export type EstadoPush = "indisponivel" | "precisa-instalar" | "bloqueado" | "desligado" | "ligado";

function ehIOS() {
  return typeof navigator !== "undefined" && /iPad|iPhone|iPod/.test(navigator.userAgent);
}
function instalado() {
  return typeof window !== "undefined" && (window.matchMedia?.("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true);
}

/** Registra o service worker (seguro chamar várias vezes). */
export async function registrarServiceWorker() {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return null;
  try {
    return await navigator.serviceWorker.register("/sw.js", { scope: "/" });
  } catch {
    return null;
  }
}

export async function estadoPush(): Promise<EstadoPush> {
  if (typeof window === "undefined") return "indisponivel";
  const suporta = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
  // No iPhone/iPad, o aviso só funciona com o app adicionado à Tela de Início (iOS 16.4+).
  if (!suporta) return ehIOS() && !instalado() ? "precisa-instalar" : "indisponivel";
  if (Notification.permission === "denied") return "bloqueado";
  const reg = await navigator.serviceWorker.getRegistration("/");
  const inscricao = await reg?.pushManager.getSubscription();
  return inscricao && Notification.permission === "granted" ? "ligado" : "desligado";
}

function nomeDoAparelho() {
  const ua = navigator.userAgent;
  const sistema = /Android/.test(ua) ? "Android" : /iPhone|iPad|iPod/.test(ua) ? "iPhone/iPad" : /Windows/.test(ua) ? "Windows" : /Mac OS X/.test(ua) ? "Mac" : /Linux/.test(ua) ? "Linux" : "Aparelho";
  const navegador = /Edg\//.test(ua) ? "Edge" : /SamsungBrowser/.test(ua) ? "Samsung Internet" : /Firefox\//.test(ua) ? "Firefox" : /Chrome\//.test(ua) ? "Chrome" : /Safari\//.test(ua) ? "Safari" : "";
  return `${sistema}${navegador ? ` · ${navegador}` : ""}${instalado() ? " (app)" : ""}`;
}

/** Pede permissão, inscreve este aparelho e guarda a inscrição da confeitaria. */
export async function ativarPush(): Promise<{ ok: true } | { ok: false; erro: string }> {
  const estado = await estadoPush();
  if (estado === "precisa-instalar") return { ok: false, erro: "No iPhone, primeiro toque em Compartilhar → “Adicionar à Tela de Início” e abra o sistema pelo ícone." };
  if (estado === "indisponivel") return { ok: false, erro: "Este navegador não recebe notificações. Use o Chrome ou instale o app." };
  const permissao = await Notification.requestPermission();
  if (permissao !== "granted") return { ok: false, erro: "As notificações foram bloqueadas. Libere nas configurações do navegador para este site." };
  const reg = await registrarServiceWorker();
  if (!reg) return { ok: false, erro: "Não foi possível preparar as notificações neste navegador." };
  await navigator.serviceWorker.ready;
  try {
    let inscricao = await reg.pushManager.getSubscription();
    if (!inscricao) {
      inscricao = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: deBase64Url(VAPID_PUBLICA).slice().buffer as ArrayBuffer });
    }
    const json = inscricao.toJSON();
    const p256dh = json.keys?.["p256dh"], auth = json.keys?.["auth"];
    if (!json.endpoint || !p256dh || !auth) return { ok: false, erro: "O navegador não devolveu a inscrição. Tente de novo." };
    const { error } = await supabase.rpc("salvar_inscricao_push", { p_endpoint: json.endpoint, p_p256dh: p256dh, p_auth: auth, p_aparelho: nomeDoAparelho() });
    if (error) return { ok: false, erro: `Não foi possível salvar: ${error.message}` };
    return { ok: true };
  } catch (e) {
    return { ok: false, erro: e instanceof Error ? `Não foi possível ativar: ${e.message}` : "Não foi possível ativar as notificações." };
  }
}

/** Para de receber neste aparelho. */
export async function desativarPush() {
  const reg = await navigator.serviceWorker?.getRegistration("/");
  const inscricao = await reg?.pushManager.getSubscription();
  if (!inscricao) return;
  await supabase.from("push_inscricoes").delete().eq("endpoint", inscricao.endpoint);
  await inscricao.unsubscribe().catch(() => false);
}
