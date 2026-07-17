import Link from "next/link";
import { auth, signOut } from "@/lib/auth";
import { redirect } from "next/navigation";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session) redirect("/login");
  return (
    <div className="min-h-screen">
      <nav className="flex gap-4 border-b px-6 py-3">
        <Link href="/dashboard">Dashboard</Link>
        <Link href="/mes">Mês</Link>
        <Link href="/itens">Itens</Link>
        <Link href="/categorias">Categorias</Link>
        <form
          className="ml-auto"
          action={async () => {
            "use server";
            await signOut({ redirectTo: "/login" });
          }}
        >
          <button type="submit">Sair</button>
        </form>
      </nav>
      <main className="p-6">{children}</main>
    </div>
  );
}
