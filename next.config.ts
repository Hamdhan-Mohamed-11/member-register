import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // mysql2 must not be bundled into the server chunk — it resolves its own
  // native-ish internals at runtime and Turbopack mangles them if it tries.
  serverExternalPackages: ["mysql2"],
};

export default nextConfig;
