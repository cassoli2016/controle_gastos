import { Wallet, TrendingUp, CreditCard, PiggyBank } from "lucide-react";
import { signIn } from "@/lib/auth";
import { redirect } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { FinanceIllustration } from "./FinanceIllustration";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  return (
    <main className="grid min-h-screen lg:grid-cols-2">
      {/* Painel da marca (desktop): fundo escuro com a ilustração da proposta */}
      <section className="relative hidden overflow-hidden bg-slate-950 text-slate-100 lg:flex lg:flex-col lg:justify-between lg:p-10">
        <div className="pointer-events-none absolute -top-32 -left-32 size-[30rem] rounded-full bg-blue-600/25 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-40 -right-24 size-[28rem] rounded-full bg-violet-600/25 blur-3xl" />
        <div className="pointer-events-none absolute top-1/3 right-1/4 size-56 rounded-full bg-cyan-400/15 blur-3xl" />

        <div className="relative flex items-center gap-3">
          <span className="flex size-11 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-violet-600 text-white shadow-lg shadow-blue-500/30">
            <Wallet className="size-6" />
          </span>
          <span className="text-2xl font-extrabold tracking-tight">Grana</span>
        </div>

        <div className="relative mx-auto w-full max-w-lg text-slate-300">
          <FinanceIllustration className="w-full" idPrefix="gi-desk" />
          <h2 className="mt-6 text-3xl font-bold leading-tight text-white">
            Seu dinheiro, <span className="bg-gradient-to-r from-blue-400 via-violet-400 to-cyan-400 bg-clip-text text-transparent">no controle</span>.
          </h2>
          <ul className="mt-5 space-y-2.5 text-sm">
            <li className="flex items-center gap-2.5">
              <CreditCard className="size-4 shrink-0 text-blue-400" />
              Cartões com fatura consolidada e parcelas nos meses certos
            </li>
            <li className="flex items-center gap-2.5">
              <TrendingUp className="size-4 shrink-0 text-violet-400" />
              Provisionamento mensal com reajuste anual automático
            </li>
            <li className="flex items-center gap-2.5">
              <PiggyBank className="size-4 shrink-0 text-cyan-400" />
              Caixinhas de reserva e lançamentos direto do Telegram
            </li>
          </ul>
        </div>

        <p className="relative text-xs text-slate-500">gastos.cassolitech.com.br</p>
      </section>

      {/* Formulário */}
      <section className="relative flex items-center justify-center overflow-hidden bg-background p-4">
        <div className="pointer-events-none absolute -top-32 -right-32 size-[26rem] rounded-full bg-primary/20 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-40 -left-24 size-[24rem] rounded-full bg-violet-600/15 blur-3xl" />

        <div className="relative w-full max-w-sm space-y-6">
          <div className="flex flex-col items-center gap-4 text-center">
            <span className="flex size-16 items-center justify-center rounded-2xl bg-gradient-to-br from-primary to-violet-600 text-white shadow-xl shadow-primary/30 lg:hidden">
              <Wallet className="size-8" />
            </span>
            <div className="space-y-1">
              <h1 className="bg-gradient-to-r from-primary via-violet-500 to-cyan-500 bg-clip-text text-4xl font-extrabold tracking-tight text-transparent">
                Grana
              </h1>
              <p className="text-sm text-muted-foreground">Seu dinheiro, no controle.</p>
            </div>
          </div>

          {/* Hero compacto no mobile (a coluna da ilustração fica oculta) */}
          <div className="mx-auto max-w-[17rem] text-primary lg:hidden">
            <FinanceIllustration className="w-full" idPrefix="gi-mob" />
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

          <p className="text-center text-xs text-muted-foreground lg:hidden">gastos.cassolitech.com.br</p>
        </div>
      </section>
    </main>
  );
}
