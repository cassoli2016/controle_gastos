import { Wallet } from "lucide-react";
import { signIn } from "@/lib/auth";
import { redirect } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background p-4">
      {/* Glow futurista de fundo (azul + violeta + ciano) */}
      <div className="pointer-events-none absolute -top-32 -left-32 size-[28rem] rounded-full bg-primary/25 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-40 -right-24 size-[26rem] rounded-full bg-violet-600/20 blur-3xl" />
      <div className="pointer-events-none absolute top-1/3 right-1/4 size-56 rounded-full bg-cyan-400/15 blur-3xl" />

      <div className="relative w-full max-w-sm space-y-7">
        <div className="flex flex-col items-center gap-4 text-center">
          <span className="flex size-16 items-center justify-center rounded-2xl bg-gradient-to-br from-primary to-violet-600 text-white shadow-xl shadow-primary/30">
            <Wallet className="size-8" />
          </span>
          <div className="space-y-1">
            <h1 className="bg-gradient-to-r from-primary via-violet-500 to-cyan-500 bg-clip-text text-4xl font-extrabold tracking-tight text-transparent">
              Grana
            </h1>
            <p className="text-sm text-muted-foreground">Seu dinheiro, no controle.</p>
          </div>
        </div>

        <Card className="border-border/60 bg-card/80 shadow-2xl shadow-primary/10 backdrop-blur-xl">
          <CardContent className="p-6">
            <form
              action={async (formData: FormData) => {
                "use server";
                try {
                  await signIn("credentials", {
                    password: formData.get("password"),
                    redirectTo: "/dashboard",
                  });
                } catch (e) {
                  if (
                    e &&
                    typeof e === "object" &&
                    "digest" in e &&
                    String((e as { digest?: unknown }).digest).startsWith("NEXT_REDIRECT")
                  ) {
                    throw e;
                  }
                  redirect("/login?error=1");
                }
              }}
              className="flex flex-col gap-4"
            >
              {/* Campo de usuário oculto: dá contexto ao gerenciador de senhas
                  do navegador/iPhone para OFERECER salvar e preencher a senha. */}
              <input
                type="text"
                name="username"
                autoComplete="username"
                defaultValue="grana"
                hidden
                readOnly
              />
              <div className="flex flex-col gap-2">
                <Label htmlFor="password">Senha</Label>
                <Input
                  id="password"
                  name="password"
                  type="password"
                  required
                  placeholder="••••••••"
                  autoFocus
                  autoComplete="current-password"
                  className="h-11"
                />
                {error && <p className="text-sm text-destructive">Senha incorreta.</p>}
              </div>
              <Button
                type="submit"
                className="h-11 w-full bg-gradient-to-r from-primary to-violet-600 text-white hover:opacity-95"
              >
                Entrar
              </Button>
            </form>
          </CardContent>
        </Card>

        <p className="text-center text-xs text-muted-foreground">gastos.cassolitech.com.br</p>
      </div>
    </main>
  );
}
