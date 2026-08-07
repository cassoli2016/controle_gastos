"use client";
import { useActionState, useState } from "react";
import { startRegistration } from "@simplewebauthn/browser";
import { Fingerprint, Trash2, Lock } from "lucide-react";
import { useRouter } from "next/navigation";

import {
  startPasskeyRegistration,
  finishPasskeyRegistration,
  removePasskey,
  lockNow,
  type PasskeyState,
} from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Passkey = { id: string; label: string; createdAt: Date; lastUsedAt: Date | null };

export function PasskeyManager({ passkeys }: { passkeys: Passkey[] }) {
  const router = useRouter();
  const [label, setLabel] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [registrando, setRegistrando] = useState(false);
  const [removeState, removeAction] = useActionState<PasskeyState, FormData>(removePasskey, {});

  async function registrar() {
    setErro(null);
    setRegistrando(true);
    try {
      const r = await startPasskeyRegistration();
      if ("error" in r) {
        setErro(r.error);
        return;
      }
      const resposta = await startRegistration({ optionsJSON: r.options });
      const fim = await finishPasskeyRegistration(resposta, label || "Este aparelho");
      if ("error" in fim && fim.error) {
        setErro(fim.error);
        return;
      }
      setLabel("");
      router.refresh();
    } catch (e) {
      const msg = (e as Error).message;
      setErro(/abort|not allowed/i.test(msg) ? null : msg);
    } finally {
      setRegistrando(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="font-semibold">Desbloqueio por Face ID</h2>
        <p className="text-sm text-muted-foreground">
          Registre um aparelho e o app passa a pedir Face ID ao abrir. A senha continua funcionando como saída — sem
          ela, um celular novo te deixaria de fora.
        </p>
      </div>

      {passkeys.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhum aparelho registrado — o app abre direto.</p>
      ) : (
        <ul className="divide-y rounded-md border">
          {passkeys.map((p) => (
            <li key={p.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
              <span className="flex items-center gap-2">
                <Fingerprint className="size-4 text-muted-foreground" />
                <span>{p.label}</span>
                <span className="text-xs text-muted-foreground">
                  {p.lastUsedAt ? `usado em ${p.lastUsedAt.toLocaleDateString("pt-BR")}` : "nunca usado"}
                </span>
              </span>
              <form action={removeAction}>
                <input type="hidden" name="id" value={p.id} />
                <Button type="submit" variant="ghost" size="icon-sm" aria-label={`Remover ${p.label}`}>
                  <Trash2 className="size-4 text-destructive" />
                </Button>
              </form>
            </li>
          ))}
        </ul>
      )}
      {removeState.error && <p className="text-sm text-destructive">{removeState.error}</p>}

      <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <div className="flex flex-1 flex-col gap-1.5">
          <Label htmlFor="passkey-label">Nome do aparelho</Label>
          <Input
            id="passkey-label"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="ex.: iPhone do Cristian"
          />
        </div>
        <Button onClick={registrar} disabled={registrando}>
          {registrando ? "Aguardando…" : "Registrar este aparelho"}
        </Button>
      </div>
      {erro && <p className="text-sm text-destructive">{erro}</p>}

      {passkeys.length > 0 && (
        <div className="flex flex-col gap-1.5 border-t pt-4">
          <p className="text-sm text-muted-foreground">
            Depois de registrar, o app fica destravado por 30 minutos — use o botão abaixo para conferir agora que o
            Face ID está funcionando.
          </p>
          <Button
            variant="secondary"
            className="self-start"
            onClick={async () => {
              await lockNow();
              router.refresh();
            }}
          >
            <Lock className="size-4" />
            Trancar agora
          </Button>
        </div>
      )}
    </div>
  );
}
