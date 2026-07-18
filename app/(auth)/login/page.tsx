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
    <main className="flex min-h-screen items-center justify-center bg-gradient-to-br from-primary/15 via-background to-background p-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="flex flex-col items-center gap-3 text-center">
          <span className="flex size-14 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-lg">
            <Wallet className="size-7" />
          </span>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Gastos</h1>
            <p className="text-sm text-muted-foreground">Seu controle financeiro pessoal</p>
          </div>
        </div>

        <Card className="shadow-lg">
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
              <div className="flex flex-col gap-2">
                <Label htmlFor="password">Senha</Label>
                <Input
                  id="password"
                  name="password"
                  type="password"
                  required
                  placeholder="••••••••"
                  autoFocus
                />
                {error && <p className="text-sm text-destructive">Senha incorreta.</p>}
              </div>
              <Button type="submit" className="w-full">
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
