import "server-only";

/**
 * Credentials for the legacy pickabook.lk MySQL database.
 *
 * Read-only by grant: the `pickaook_portal` user holds SELECT and nothing
 * else, verified by a write probe that was correctly refused. Even a bug in
 * this codebase cannot alter the live shop data.
 *
 * Access is also whitelisted by the VPS's outbound IP in cPanel -> Remote
 * Database Access. A changed VPS IP kills the catalogue with a connect
 * timeout and no other symptom.
 */

function required(name: string, value: string | undefined): string {
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

export function getLegacyMysqlConfig() {
  return {
    host: required("LEGACY_MYSQL_HOST", process.env.LEGACY_MYSQL_HOST),
    port: Number(process.env.LEGACY_MYSQL_PORT ?? 3306),
    user: required("LEGACY_MYSQL_USER", process.env.LEGACY_MYSQL_USER),
    password: required("LEGACY_MYSQL_PASSWORD", process.env.LEGACY_MYSQL_PASSWORD),
    database: required("LEGACY_MYSQL_DATABASE", process.env.LEGACY_MYSQL_DATABASE),
  };
}

/** Whether the catalogue is configured at all. Local dev usually has no access. */
export function isLegacyConfigured(): boolean {
  return Boolean(
    process.env.LEGACY_MYSQL_HOST &&
      process.env.LEGACY_MYSQL_USER &&
      process.env.LEGACY_MYSQL_PASSWORD &&
      process.env.LEGACY_MYSQL_DATABASE,
  );
}

/** Where a bare image filename lives on the legacy site. */
export const LEGACY_UPLOAD_BASE = "https://www.pickabook.lk/buybooks/uploads/";
