import { closeSync, openSync, statSync, unlinkSync, writeSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const DEFAULT_WAIT_MS = 5_000;
const DEFAULT_STALE_MS = 30_000;
const POLL_MS = 50;

export type LockOptions = {
  path?: string;
  waitMs?: number;
  staleMs?: number;
};

export function defaultLockPath(): string {
  const dir = process.env.HERDR_PLUGIN_STATE_DIR ?? tmpdir();
  return join(dir, "renumber.lock");
}

function tryAcquire(path: string): number | null {
  try {
    // "wx" は排他生成。既に存在すれば EEXIST で失敗する。
    return openSync(path, "wx");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") return null;
    throw error;
  }
}

function breakIfStale(path: string, staleMs: number): void {
  try {
    if (Date.now() - statSync(path).mtimeMs > staleMs) unlinkSync(path);
  } catch {
    // 競合で既に消えている場合は無視してよい。次の取得試行で決着する。
  }
}

/**
 * 排他ロックを取得して fn を実行する。
 *
 * 一覧を読む「前」に呼ぶこと。読んだ後にロックしても、古い一覧で新しい番号を
 * 上書きする競合は防げない。待たされた実行がロック取得後に読み直すことで、
 * 常に最新の一覧を見ることが保証される。
 *
 * 期限内にロックを取れなかった場合は null を返して何もしない。
 * 先行する実行が最新状態で処理するため、取りこぼしにはならない。
 */
export function withLock<T>(fn: () => T, options: LockOptions = {}): T | null {
  const path = options.path ?? defaultLockPath();
  const waitMs = options.waitMs ?? DEFAULT_WAIT_MS;
  const staleMs = options.staleMs ?? DEFAULT_STALE_MS;
  const deadline = Date.now() + waitMs;

  for (;;) {
    const fd = tryAcquire(path);
    if (fd !== null) {
      try {
        writeSync(fd, String(process.pid));
        closeSync(fd);
        return fn();
      } finally {
        try {
          unlinkSync(path);
        } catch {
          // 既に消えていても問題ない。
        }
      }
    }
    breakIfStale(path, staleMs);
    if (Date.now() >= deadline) return null;
    Bun.sleepSync(POLL_MS);
  }
}
