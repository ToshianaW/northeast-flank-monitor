/**
 * Test-only helper for the Phase 4 DB tests: one client, one transaction, always rolled back.
 * Deferred constraint triggers are made immediate so each statement is checked as it runs.
 * `installAsAppPool` points src/lib/db.ts's getPool() at the same transaction, so app reads
 * see the uncommitted test rows without any change to production code.
 */
import { existsSync } from "node:fs";
import { Pool, type PoolClient, type QueryResult, type QueryResultRow } from "pg";

if (!process.env.DATABASE_URL_POOLED && existsSync(".env.local")) process.loadEnvFile(".env.local");

export type RollbackDb = {
  client: PoolClient;
  /** True when migration 0008 has been applied to this database. */
  applied: boolean;
  /** Runs `fn` in a savepoint and returns the error it raised (the savepoint is rolled back). */
  expectError(fn: () => Promise<unknown>): Promise<Error>;
  /** Runs `fn` in a savepoint that is kept on success. */
  step<T>(fn: () => Promise<T>): Promise<T>;
  /** Rolls everything back and closes the connection; returns a fresh pool for after-checks. */
  rollback(): Promise<Pool>;
};

declare global {
  var __nfmPool: Pool | undefined;
}

export async function openRollbackDb(
  options: {
    installAsAppPool?: boolean;
    /**
     * REPEATABLE READ: every query sees one snapshot taken at the first statement, plus the
     * transaction's own writes, so rows committed meanwhile (the live pipeline) never appear.
     */
    repeatableRead?: boolean;
  } = {},
): Promise<RollbackDb> {
  const connectionString = process.env.DATABASE_URL_POOLED;
  if (!connectionString) throw new Error("DATABASE_URL_POOLED is not set (see .env.example).");
  const pool = new Pool({ connectionString, max: 1 });
  const client = await pool.connect();
  await client.query(options.repeatableRead ? "BEGIN ISOLATION LEVEL REPEATABLE READ" : "BEGIN");
  await client.query("SET CONSTRAINTS ALL IMMEDIATE");
  const { rows: [{ applied }] } = await client.query<{ applied: boolean }>(
    "SELECT to_regclass('public.historical_events') IS NOT NULL AS applied",
  );

  if (options.installAsAppPool) {
    const query = <R extends QueryResultRow>(text: string, values?: unknown[]): Promise<QueryResult<R>> =>
      client.query<R>(text, values);
    // App code that opens its own transaction gets a savepoint instead, so its COMMIT can never
    // commit the test transaction.
    const SAVEPOINT_FOR: Record<string, string> = {
      BEGIN: "SAVEPOINT app_tx",
      COMMIT: "RELEASE SAVEPOINT app_tx",
      ROLLBACK: "ROLLBACK TO SAVEPOINT app_tx",
    };
    const appTxQuery = <R extends QueryResultRow>(text: string, values?: unknown[]): Promise<QueryResult<R>> =>
      client.query<R>(SAVEPOINT_FOR[text.trim().toUpperCase()] ?? text, values);
    globalThis.__nfmPool = {
      query,
      connect: async () => ({ query: appTxQuery, release: () => {} }),
      end: async () => {},
    } as unknown as Pool;
  }

  let n = 0;
  return {
    client,
    applied,
    async expectError(fn) {
      const name = `sp_${++n}`;
      await client.query(`SAVEPOINT ${name}`);
      try {
        await fn();
      } catch (error) {
        await client.query(`ROLLBACK TO SAVEPOINT ${name}`);
        return error as Error;
      }
      await client.query(`ROLLBACK TO SAVEPOINT ${name}`);
      throw new Error("expected the statement to be rejected, but it succeeded");
    },
    async step(fn) {
      const name = `sp_${++n}`;
      await client.query(`SAVEPOINT ${name}`);
      try {
        const result = await fn();
        await client.query(`RELEASE SAVEPOINT ${name}`);
        return result;
      } catch (error) {
        await client.query(`ROLLBACK TO SAVEPOINT ${name}`);
        throw error;
      }
    },
    async rollback() {
      await client.query("ROLLBACK");
      client.release();
      await pool.end();
      return new Pool({ connectionString, max: 1 });
    },
  };
}
