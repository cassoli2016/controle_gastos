// Next 16 renomeou Middleware para Proxy; o comportamento é o mesmo.
export { auth as proxy } from "@/lib/auth";

export const config = {
  matcher: ["/dashboard/:path*", "/mes/:path*", "/itens/:path*", "/categorias/:path*", "/cartoes/:path*", "/reservas/:path*", "/investimentos/:path*", "/panorama/:path*", "/novidades/:path*"],
};
