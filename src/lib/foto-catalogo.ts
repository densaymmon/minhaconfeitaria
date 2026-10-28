import { supabase } from "@/integrations/supabase/client";

const LADO_MAXIMO = 1200;
const TAMANHO_MAXIMO = 2 * 1024 * 1024; // limite do bucket "catalogo"

/** Reduz a foto para no máximo 1200 px e JPEG, para carregar rápido no celular do cliente. */
export async function comprimirFoto(arquivo: File): Promise<Blob> {
  if (!arquivo.type.startsWith("image/")) throw new Error("Escolha um arquivo de imagem.");
  try {
    const bitmap = await createImageBitmap(arquivo);
    const escala = Math.min(1, LADO_MAXIMO / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * escala);
    canvas.height = Math.round(bitmap.height * escala);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("canvas");
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const blob = await new Promise<Blob | null>((ok) => canvas.toBlob(ok, "image/jpeg", 0.82));
    if (blob && blob.size <= TAMANHO_MAXIMO) return blob;
  } catch {
    /* formato que o navegador não abre: tenta enviar o original */
  }
  if (arquivo.size > TAMANHO_MAXIMO) throw new Error("A foto é grande demais. Use uma imagem de até 2 MB.");
  return arquivo;
}

/** Envia a foto para a pasta da confeitaria e devolve o endereço público. */
export async function enviarFotoProduto(userId: string, produtoId: string, arquivo: File): Promise<string> {
  const foto = await comprimirFoto(arquivo);
  const tipo = foto.type || "image/jpeg";
  const extensao = tipo === "image/png" ? "png" : tipo === "image/webp" ? "webp" : "jpg";
  const caminho = `${userId}/${produtoId}-${Date.now()}.${extensao}`;
  const { error } = await supabase.storage.from("catalogo").upload(caminho, foto, { contentType: tipo, upsert: false, cacheControl: "31536000" });
  if (error) throw new Error(`Não foi possível enviar a foto: ${error.message}`);
  return supabase.storage.from("catalogo").getPublicUrl(caminho).data.publicUrl;
}
