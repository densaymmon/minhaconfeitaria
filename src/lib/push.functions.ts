import { createServerFn } from "@tanstack/react-start";
import { setResponseHeader } from "@tanstack/react-start/server";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { enviarPush, type ChavesVapid } from "./web-push";

type Aviso = { titulo: string; corpo: string; tag: string; url: string };

/** Chaves VAPID guardadas no banco (plataforma_segredos, só o servidor lê). */
async function chavesVapid(): Promise<ChavesVapid | null> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin.from("plataforma_segredos").select("chave,valor").in("chave", ["vapid_publica", "vapid_privada", "vapid_assunto"]);
  const mapa = new Map((data ?? []).map((l) => [l.chave, l.valor]));
  const publica = mapa.get("vapid_publica"), privada = mapa.get("vapid_privada");
  if (!publica || !privada) return null;
  return { publica, privada, assunto: mapa.get("vapid_assunto") ?? "mailto:suporte@docegestao.app" };
}

/** Envia o aviso para todos os aparelhos da confeitaria e apaga inscrições expiradas. */
async function avisarConfeitaria(userId: string, aviso: Aviso) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const vapid = await chavesVapid();
  if (!vapid) return { enviados: 0, aparelhos: 0 };
  const { data: inscricoes } = await supabaseAdmin.from("push_inscricoes").select("id,endpoint,p256dh,auth").eq("user_id", userId).limit(20);
  const lista = inscricoes ?? [];
  const resultados = await Promise.allSettled(lista.map((i) => enviarPush(i, aviso, vapid, { urgencia: "high", ttl: 12 * 3600 })));
  const expiradas: string[] = [];
  const entregues: string[] = [];
  resultados.forEach((r, n) => {
    const id = lista[n]?.id;
    if (!id) return;
    if (r.status === "fulfilled" && (r.value === 404 || r.value === 410)) expiradas.push(id);
    else if (r.status === "fulfilled" && r.value >= 200 && r.value < 300) entregues.push(id);
  });
  if (expiradas.length) await supabaseAdmin.from("push_inscricoes").delete().in("id", expiradas);
  if (entregues.length) await supabaseAdmin.from("push_inscricoes").update({ ultimo_envio_em: new Date().toISOString() }).in("id", entregues);
  return { enviados: entregues.length, aparelhos: lista.length };
}

/**
 * Chamado pela página do catálogo logo depois de criar o pedido. Público, mas só age
 * uma vez por pedido e apenas em pedidos do catálogo criados nos últimos 10 minutos.
 */
export const avisarPedidoNovo = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => z.object({ codigo: z.string().uuid() }).parse(input))
  .handler(async ({ data }) => {
    setResponseHeader("Cache-Control", "no-store");
    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data: pedido } = await supabaseAdmin
        .from("pedidos")
        .update({ push_avisado_em: new Date().toISOString() })
        .eq("codigo_publico", data.codigo)
        .eq("origem", "catalogo")
        .is("push_avisado_em", null)
        .gte("created_at", new Date(Date.now() - 10 * 60_000).toISOString())
        .select("id,numero,user_id,cliente_id,encomenda,data_entrega,tipo_entrega")
        .maybeSingle();
      if (!pedido) return { ok: true };
      const { data: cliente } = pedido.cliente_id
        ? await supabaseAdmin.from("clientes").select("nome").eq("id", pedido.cliente_id).eq("user_id", pedido.user_id).maybeSingle()
        : { data: null };
      const [, m, d] = pedido.data_entrega.split("-");
      const quem = cliente?.nome ? ` de ${cliente.nome.split(/\s+/)[0]}` : "";
      await avisarConfeitaria(pedido.user_id, {
        titulo: pedido.encomenda ? "Pedido de orçamento pelo catálogo" : "Novo pedido pelo catálogo",
        corpo: `Pedido #${pedido.numero}${quem} · ${pedido.tipo_entrega === "entrega" ? "entrega" : "retirada"} em ${d}/${m}`,
        tag: `pedido-${pedido.id}`,
        url: `/pedidos/${pedido.id}`,
      });
    } catch (erro) {
      console.error("[push] aviso de pedido novo falhou", erro instanceof Error ? erro.message : erro);
    }
    return { ok: true };
  });

/** Botão "Enviar teste" da confeitaria: manda um aviso para os aparelhos dela. */
export const testarNotificacao = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    setResponseHeader("Cache-Control", "no-store");
    const r = await avisarConfeitaria(context.userId, {
      titulo: "Notificações ativadas ✅",
      corpo: "É assim que você vai saber de cada pedido novo do catálogo.",
      tag: "teste-notificacao",
      url: "/painel",
    });
    return r;
  });
