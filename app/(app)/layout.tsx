import { redirect } from "next/navigation";
import { auth, signOut } from "@/lib/auth";
import { Sidebar } from "@/components/app-shell/Sidebar";
import { Topbar } from "@/components/app-shell/Topbar";
import { MobileNav } from "@/components/app-shell/MobileNav";
import { hasPasskeys } from "@/lib/passkey";
import { isUnlocked } from "@/lib/passkey-session";
import { LockScreen } from "./LockScreen";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session) redirect("/login");

  // Trava biométrica: só existe depois que algum aparelho é registrado, então
  // quem nunca usou passkey não vê diferença nenhuma. Ela protege a interface —
  // a sessão continua válida por trás, e a saída pela senha fica na própria
  // tela de trava.
  if ((await hasPasskeys()) && !(await isUnlocked())) {
    return <LockScreen />;
  }

  async function doSignOut() {
    "use server";
    await signOut({ redirectTo: "/login" });
  }
  return (
    <div className="flex min-h-screen flex-col">
      <Topbar signOutAction={doSignOut} />
      <div className="flex flex-1">
        <Sidebar />
        {/* min-w-0 + overflow-x-clip: nenhum conteúdo largo pode estourar a
            largura da tela no mobile (proteção além dos fixes por página). */}
        <main className="flex-1 min-w-0 overflow-x-clip p-4 pb-20 md:pb-4">{children}</main>
      </div>
      <MobileNav />
    </div>
  );
}
