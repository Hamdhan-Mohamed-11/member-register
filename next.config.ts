import type { NextConfig } from "next";
import { securityHeaders } from "./src/lib/security/headers";

const isDev = process.env.NODE_ENV !== "production";

const nextConfig: NextConfig = {
  // mysql2 must not be bundled into the server chunk — it resolves its own
  // native-ish internals at runtime and Turbopack mangles them if it tries.
  serverExternalPackages: ["mysql2"],

  async headers() {
    return [
      {
        // Everything, including API routes. The PayHere webhook is a POST from
        // another server and is unaffected by any of these.
        source: "/:path*",
        headers: securityHeaders(isDev),
      },
    ];
  },
};

export default nextConfig;
