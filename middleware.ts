export { auth as middleware } from "@/lib/auth";

export const config = {
  matcher: ["/dashboard/:path*", "/mes/:path*", "/itens/:path*", "/categorias/:path*", "/cartoes/:path*", "/reservas/:path*"],
};
