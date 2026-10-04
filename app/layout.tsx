import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/components/theme/ThemeProvider";
import { Toaster } from "@/components/ui/sonner";
import { appName } from "@/lib/branding";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Função (não constante): precisa ler APP_NAME por requisição. Uma constante
// de módulo seria avaliada uma vez no build e congelaria o nome para toda
// cópia do app.
export function generateMetadata(): Metadata {
  const nome = appName();
  return {
    title: `${nome} · Controle Financeiro`,
    description: "Controle financeiro pessoal — contas, cartões e parcelamentos.",
    applicationName: nome,
    // iOS "Adicionar à Tela de Início": abre standalone (sem chrome do Safari),
    // com nome e ícone próprios — comportamento de app nativo.
    appleWebApp: { capable: true, statusBarStyle: "default", title: nome },
    icons: { icon: "/icon-192.png", apple: "/apple-touch-icon.png" },
  };
}

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f6f7f9" },
    { media: "(prefers-color-scheme: dark)", color: "#101216" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="pt-BR"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col font-sans">
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          {children}
          <Toaster richColors position="top-center" />
        </ThemeProvider>
      </body>
    </html>
  );
}
