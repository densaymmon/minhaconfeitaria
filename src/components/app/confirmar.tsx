import { useEffect, useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { registrarConfirmacao, type PedidoConfirmacao } from "@/lib/confirmar";

export function Confirmacao() {
  const [pedido, setPedido] = useState<PedidoConfirmacao | null>(null);
  const [aberto, setAberto] = useState(false);

  useEffect(() => {
    registrarConfirmacao((novo) => {
      setPedido((anterior) => {
        anterior?.responder(false);
        return novo;
      });
      setAberto(true);
    });
    return () => registrarConfirmacao(null);
  }, []);

  function responder(ok: boolean) {
    // A promessa só aceita a primeira resposta; o texto fica até a animação de fechar terminar.
    pedido?.responder(ok);
    setAberto(false);
  }

  return (
    <AlertDialog open={aberto} onOpenChange={(open) => { if (!open) responder(false); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{pedido?.titulo}</AlertDialogTitle>
          {pedido?.mensagem ? <AlertDialogDescription>{pedido.mensagem}</AlertDialogDescription> : null}
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel className="min-h-11" onClick={() => responder(false)}>{pedido?.cancelar ?? "Voltar"}</AlertDialogCancel>
          <AlertDialogAction
            className={cn("min-h-11", pedido?.destrutivo && buttonVariants({ variant: "destructive" }))}
            onClick={() => responder(true)}
          >
            {pedido?.acao ?? "Confirmar"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
