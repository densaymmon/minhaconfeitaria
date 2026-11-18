import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { IngredientForm } from "./ingredient-form";

/** Valor da opção "+ Cadastrar novo ingrediente" nas listas de ingredientes; nunca é salvo. */
export const NOVO_INGREDIENTE = "__novo_ingrediente__";

/**
 * Cadastro rápido de um insumo sem sair da tela (receita do produto, recheio/cobertura, variação).
 * Depois de salvo, devolve o id e a unidade da embalagem para a linha já ficar com o novo insumo.
 */
export function NovoInsumoDialog({ aberto, onFechar, onCriado }: {
  aberto: boolean;
  onFechar: () => void;
  onCriado: (criado: { id: string; unidade_embalagem: string }) => void;
}) {
  return (
    <Dialog open={aberto} onOpenChange={(v) => { if (!v) onFechar(); }}>
      <DialogContent className="max-h-[90dvh] max-w-md overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Novo ingrediente</DialogTitle>
          <DialogDescription>Cadastre o ingrediente com o preço da embalagem. Ele já fica escolhido nesta linha.</DialogDescription>
        </DialogHeader>
        {aberto && <IngredientForm onSaved={onCriado} onDone={onFechar} />}
      </DialogContent>
    </Dialog>
  );
}
