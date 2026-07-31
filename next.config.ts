import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // Upload do PDF da fatura (o padrão de 1MB é apertado p/ faturas longas).
      bodySizeLimit: "4mb",
    },
  },
};

export default nextConfig;
