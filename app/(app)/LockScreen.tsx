"use client";
import { useActionState, useEffect, useState } from "react";
import { startAuthentication } from "@simplewebauthn/browser";
import { Fingerprint, KeyRound } from "lucide-react";
import { useRouter } from "next/navigation";

import { startPasskeyUnlock, finishPasskeyUnlock, unlockWithPassword, type PasskeyState } from "./ajustes/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";

/**
 * Trava da INTERFACE. A sessão continua válida por trás — isto existe para que
 * quem pegar o celular desbloqueado não caia direto nas suas contas.
 *
 * A senha aparece sempre como alternativa: passkey é presa ao aparelho e ao
 * domínio, e sem essa saída um celular novo deixaria você de fora.
 */
export function LockScreen() {
  const router = useRouter();
  const [erro, setErro] = useState<string | null>(null);
  const [tentando, setTentando] = useState(false);
  const [mostrarSenha, setMostrarSenha] = useState(false);
  const [senhaState, senhaAction, senhaPending] = useActionState<PasskeyState, FormData>(unlockWithPassword, {});

  async function destravar() {
    setErro(null);
    setTentando(true);
    try {
      const r = await startPasskeyUnlock();
      if ("error" in r) {
        setErro(r.error);
        return;
      }
      const resposta = await startAuthentication({ optionsJSON: r.options });
      const fim = await finishPasskeyUnlock(resposta);
      if ("error" in fim && fim.error) {
        setErro(fim.error);
        return;
      }
      router.refresh();
    } catch (e) {
      // Cancelar o Face ID cai aqui — não é erro que mereça alarde.
      const msg = (e as Error).message;
      setErro(/abort|not allowed/i.test(msg) ? null : msg);
    } finally {
      setTentando(false);
    }
  }

  // NÃO dispara sozinho ao montar: o Safari exige gesto do usuário para
  // `navigator.credentials.get()` na maior parte dos casos, e um disparo
  // automático seria recusado com NotAllowedError — que é indistinguível de
  // "cancelou o Face ID". Um toque no botão resolve e é honesto sobre o que vai
  // acontecer.
  useEffect(() => {
    if (senhaState.ok) router.refresh();
  }, [senhaState.ok, router]);

  return (
    <div className="flex min-h-dvh items-center justify-center p-6">
      <Card className="w-full max-w-sm">
        <CardContent className="flex flex-col items-center gap-4 py-8">
          <div className="rounded-full bg-primary/10 p-4">
            <Fingerprint className="size-8 text-primary" />
          </div>
          <div className="text-center">
            <p className="font-semibold">Grana está trancado</p>
            <p className="text-sm text-muted-foreground">Use o Face ID para entrar.</p>
          </div>

          {erro && <p className="text-center text-sm text-destructive">{erro}</p>}

          <Button onClick={destravar} disabled={tentando} className="w-full">
            {tentando ? "Aguardando…" : "Destravar"}
          </Button>

          {mostrarSenha ? (
            <form action={senhaAction} className="flex w-full flex-col gap-2">
              <Label htmlFor="unlock-password" className="text-xs text-muted-foreground">
                Senha do app
              </Label>
              <Input id="unlock-password" name="password" type="password" autoComplete="current-password" required />
              {senhaState.error && <p className="text-sm text-destructive">{senhaState.error}</p>}
              <Button type="submit" variant="secondary" disabled={senhaPending}>
                {senhaPending ? "Conferindo…" : "Entrar com a senha"}
              </Button>
            </form>
          ) : (
            <Button variant="ghost" size="sm" onClick={() => setMostrarSenha(true)} className="text-muted-foreground">
              <KeyRound className="size-4" />
              Usar a senha
            </Button>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
