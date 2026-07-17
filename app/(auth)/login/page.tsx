import { signIn } from "@/lib/auth";
import { redirect } from "next/navigation";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  return (
    <main className="flex min-h-screen items-center justify-center">
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
        className="flex flex-col gap-3 w-72"
      >
        <h1 className="text-lg font-semibold">Entrar</h1>
        {error && <p className="text-red-600 text-sm">Senha incorreta.</p>}
        <input
          name="password"
          type="password"
          required
          placeholder="Senha"
          className="border rounded px-2 py-1"
        />
        <button type="submit" className="border rounded px-3 py-1">
          Entrar
        </button>
      </form>
    </main>
  );
}
