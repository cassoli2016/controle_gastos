"use client";
import { useActionState } from "react";
import { Camera } from "lucide-react";
import { takeSnapshotAction, type ActionState } from "./actions";
import { Button } from "@/components/ui/button";
import { useActionToast } from "@/hooks/use-action-toast";

export function SnapshotButton() {
  const [state, action, pending] = useActionState<ActionState, FormData>(takeSnapshotAction, {});
  useActionToast(state, { success: "Patrimônio de hoje registrado." });
  return (
    <form action={action}>
      <Button type="submit" variant="outline" size="sm" disabled={pending}>
        <Camera className="size-4" />
        Registrar hoje
      </Button>
    </form>
  );
}
