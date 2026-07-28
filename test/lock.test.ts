import { describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { withLock } from "../lib/lock";

function freshLockPath(): string {
  return join(mkdtempSync(join(tmpdir(), "jumpnum-lock-")), "renumber.lock");
}

describe("withLock", () => {
  test("ロックを取れたら関数を実行して結果を返す", () => {
    const path = freshLockPath();
    expect(withLock(() => 42, { path })).toBe(42);
  });

  test("実行後にロックを解放する", () => {
    const path = freshLockPath();
    withLock(() => 1, { path });
    expect(existsSync(path)).toBe(false);
  });

  test("関数が例外を投げてもロックを解放する", () => {
    const path = freshLockPath();
    expect(() =>
      withLock(() => {
        throw new Error("boom");
      }, { path }),
    ).toThrow("boom");
    expect(existsSync(path)).toBe(false);
  });

  test("保持中のロックが期限内に空かなければ null を返して何もしない", () => {
    const path = freshLockPath();
    writeFileSync(path, String(process.pid));
    let ran = false;
    const result = withLock(
      () => {
        ran = true;
        return 1;
      },
      { path, waitMs: 100, staleMs: 60_000 },
    );
    expect(result).toBeNull();
    expect(ran).toBe(false);
  });

  test("stale なロックは奪って実行する", () => {
    // ロックを持ったプロセスが落ちた場合に永久に詰まらないようにする。
    const path = freshLockPath();
    writeFileSync(path, "99999");
    const old = new Date(Date.now() - 120_000);
    utimesSync(path, old, old);
    expect(withLock(() => "ok", { path, waitMs: 100, staleMs: 60_000 })).toBe("ok");
  });
});
