import "server-only";

import mysql from "mysql2/promise";
import { getLegacyMysqlConfig } from "./env";

let pool: mysql.Pool | undefined;

/**
 * Connection pool for the legacy catalogue.
 *
 * connectionLimit is deliberately small. Shared HostGator plans cap
 * max_user_connections (commonly around 25) and exceeding it throttles the
 * USER, not just the connection -- which would take out the live shop site
 * too, since it uses the same database. Two Next apps on one VPS serving ~300
 * members come nowhere near needing more than this.
 */
export function getLegacyPool(): mysql.Pool {
  if (!pool) {
    pool = mysql.createPool({
      ...getLegacyMysqlConfig(),
      waitForConnections: true,
      connectionLimit: 4,
      queueLimit: 20,
      connectTimeout: 8_000,
      enableKeepAlive: true,
      keepAliveInitialDelay: 30_000,
      timezone: "Z",
      // DECIMAL stays a string. Rupee amounts through a JS float and back are
      // how invoices end up a cent off.
      decimalNumbers: false,
    });
  }
  return pool;
}

/**
 * Runs a query with a hard timeout.
 *
 * HostGator's own TCP timeout can be 30s or more, and nobody waits that long
 * for a book list. Promise.race caps it at something a person will tolerate.
 */
export async function legacyQuery<T>(
  sql: string,
  params: unknown[],
  timeoutMs = 6_000,
): Promise<T> {
  const pool = getLegacyPool();

  return (await Promise.race([
    pool.query(sql, params).then(([rows]) => rows as T),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("legacy_timeout")), timeoutMs),
    ),
  ])) as T;
}
