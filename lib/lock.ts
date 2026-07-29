import {
  closeSync,
  openSync,
  readFileSync,
  statSync,
  unlinkSync,
  writeSync,
} from "node:fs";
import { randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";

const DEFAULT_STALE_MS = 30_000;
const POLL_MS = 50;

export type LockOptions = {
  path?: string;
  /** 省略時は取得できるまで待つ。テストや呼び出し側で明示した場合だけ timeout する。 */
  waitMs?: number;
  staleMs?: number;
};

type LockOwner = {
  pid: number;
  token: string;
};

type LockSnapshot = {
  owner: LockOwner | null;
  raw: string;
  dev: number;
  ino: number;
  mtimeMs: number;
};

export function defaultLockPath(): string {
  const dir = process.env.HERDR_PLUGIN_STATE_DIR ?? tmpdir();
  return join(dir, "renumber.lock");
}

function tryAcquire(path: string): LockOwner | null {
  const owner = { pid: process.pid, token: randomUUID() };
  let fd: number;
  try {
    // "wx" は排他生成。既に存在すれば EEXIST で失敗する。
    fd = openSync(path, "wx");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") return null;
    throw error;
  }

  try {
    writeSync(fd, JSON.stringify(owner));
  } finally {
    closeSync(fd);
  }
  return owner;
}

function snapshot(path: string): LockSnapshot | null {
  try {
    const stat = statSync(path);
    const raw = readFileSync(path, "utf8");
    let owner: LockOwner | null = null;
    try {
      const parsed = JSON.parse(raw) as Partial<LockOwner>;
      if (
        Number.isInteger(parsed.pid) &&
        (parsed.pid as number) > 0 &&
        typeof parsed.token === "string" &&
        parsed.token.length > 0
      ) {
        owner = { pid: parsed.pid as number, token: parsed.token };
      }
    } catch {
      // v0.1.0 の PID だけの lock も安全に回収できるよう読み取る。
      const legacyPid = Number(raw);
      if (Number.isInteger(legacyPid) && legacyPid > 0) {
        owner = { pid: legacyPid, token: "" };
      }
    }
    return { owner, raw, dev: stat.dev, ino: stat.ino, mtimeMs: stat.mtimeMs };
  } catch {
    return null;
  }
}

function processIsAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code !== "ESRCH";
  }
}

/**
 * 読み取った所有者から変わっていない場合だけ unlink する。
 * token と inode の両方を見ることで、古い所有者が後続の lock を消すのを防ぐ。
 */
function unlinkIfUnchanged(path: string, expected: LockSnapshot): void {
  try {
    const current = snapshot(path);
    if (
      current !== null &&
      current.raw === expected.raw &&
      current.dev === expected.dev &&
      current.ino === expected.ino
    ) {
      unlinkSync(path);
    }
  } catch {
    // 競合で既に消えている場合は、次の取得試行に任せる。
  }
}

function breakIfAbandoned(path: string, staleMs: number): void {
  const current = snapshot(path);
  if (current === null) return;

  if (current.owner !== null) {
    // 経過時間ではなく owner process の生存を stale 判定の根拠にする。
    if (!processIsAlive(current.owner.pid)) unlinkIfUnchanged(path, current);
    return;
  }

  // 書き込み途中や未知形式の lock を即座に壊さない。
  if (Date.now() - current.mtimeMs > staleMs) {
    unlinkIfUnchanged(path, current);
  }
}

function release(path: string, owner: LockOwner): void {
  const current = snapshot(path);
  if (
    current !== null &&
    current.owner?.pid === owner.pid &&
    current.owner.token === owner.token
  ) {
    unlinkIfUnchanged(path, current);
  }
}

/**
 * 排他ロックを取得して fn を実行する。
 *
 * 一覧を読む「前」に呼ぶこと。読んだ後にロックしても、古い一覧で新しい番号を
 * 上書きする競合は防げない。待たされた実行がロック取得後に読み直すことで、
 * 常に最新の一覧を見ることが保証される。
 *
 * 通常はロックを取得できるまで待つ。これにより、待機中に発生したイベントの実行も
 * ロック取得後に最新状態を読み直せる。waitMs を明示した呼び出しだけ、期限内に
 * 取得できなかった場合に null を返す。
 */
export function withLock<T>(fn: () => T, options: LockOptions = {}): T | null {
  const path = options.path ?? defaultLockPath();
  const waitMs = options.waitMs;
  const staleMs = options.staleMs ?? DEFAULT_STALE_MS;
  const deadline = waitMs === undefined ? null : Date.now() + waitMs;

  for (;;) {
    const owner = tryAcquire(path);
    if (owner !== null) {
      try {
        return fn();
      } finally {
        release(path, owner);
      }
    }
    breakIfAbandoned(path, staleMs);
    if (deadline !== null && Date.now() >= deadline) return null;
    Bun.sleepSync(POLL_MS);
  }
}
