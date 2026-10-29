/**
 * Lê o parâmetro `duplicar` da rota /produtos/$id.
 *
 * O roteador converte a busca da URL com JSON: `?duplicar=true` chega como o booleano `true`
 * (é o que o botão "Duplicar" envia) e `?duplicar=1` chega como o número `1`. Comparar apenas com
 * a string "1" fazia a tela nunca entrar no modo cópia: salvar atualizava o produto ORIGINAL em vez
 * de criar um novo e esbarrava na trava de receita com pedido em aberto.
 */
export function lerDuplicar(valor: unknown): boolean {
  return valor === true || valor === 1 || valor === "1" || valor === "true";
}
