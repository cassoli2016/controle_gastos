import type { MetadataRoute } from "next";
import { appName } from "@/lib/branding";

export default function manifest(): MetadataRoute.Manifest {
  const nome = appName();
  return {
    name: `${nome} — Controle Financeiro`,
    short_name: nome,
    description: "Controle financeiro pessoal — contas, cartões e parcelamentos.",
    start_url: "/",
    display: "standalone",
    background_color: "#f6f7f9",
    theme_color: "#2563eb",
    orientation: "portrait",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icon-512-maskable.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
