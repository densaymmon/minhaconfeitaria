import { createServerFn } from "@tanstack/react-start";
import { getRequest, setResponseHeader } from "@tanstack/react-start/server";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { DOCUMENT_MAX_BYTES, normalizeInvoice, validateDocumentFile, validateVisualBytes } from "./purchase-document";

export const extractPurchaseDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({
    name: z.string().min(1).max(240), mime: z.enum(["application/pdf", "image/jpeg", "image/png", "image/webp"]),
    base64: z.string().min(1).max(Math.ceil(DOCUMENT_MAX_BYTES / 3) * 4).regex(/^[A-Za-z0-9+/]+={0,2}$/),
  }).strict().parse(input))
  .handler(async ({ data, context }) => {
    setResponseHeader("Cache-Control", "no-store");
    const key = process.env["LOVABLE_API_KEY"];
    if (!key) return { ok: false as const, error: "A leitura visual não está configurada no Lovable Cloud. O responsável pelo projeto precisa habilitar Lovable AI; o XML continua disponível." };
    try {
      const bytes = Uint8Array.from(atob(data.base64), (c) => c.charCodeAt(0));
      validateDocumentFile({ name: data.name, type: data.mime, size: bytes.length });
      validateVisualBytes(bytes, data.mime);
      const { data: ingredients, error } = await context.supabase.from("insumos").select("id,nome,unidade,unidade_embalagem");
      if (error) return { ok: false as const, error: "Não foi possível consultar os seus insumos. Nenhum registro foi alterado." };
      const { readInvoice } = await import("./ai/invoice.server");
      const output = await readInvoice(getRequest(), key, data);
      const document = normalizeInvoice(output, ingredients ?? []);
      if (!document.linhas.length) return { ok: false as const, error: "Não foram encontrados itens legíveis. Envie uma foto nítida, o PDF completo ou use o cadastro manual." };
      return { ok: true as const, document };
    } catch (error) {
      const { safeInvoiceError } = await import("./ai/invoice.server");
      return { ok: false as const, error: safeInvoiceError(error) };
    }
  });