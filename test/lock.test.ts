import { describe, expect, test } from "bun:test";
import {
  existsSync,
  mkdtempSync,
  unlinkSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { withLock } from "../lib/lock";

const HOLDER = join(import.meta.dir, "fixtures", "hold-lock.ts");

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
    writeFileSync(path, JSON.stringify({ pid: 99_999_999, token: "dead-owner" }));
    expect(withLock(() => "ok", { path, waitMs: 100, staleMs: 60_000 })).toBe("ok");
  });

  test("mtime が古くても owner process が稼働中なら lock を壊さない", () => {
    const path = freshLockPath();
    writeFileSync(path, JSON.stringify({ pid: process.pid, token: "live-owner" }));
    const old = new Date(Date.now() - 120_000);
    utimesSync(path, old, old);

    expect(withLock(() => "unexpected", { path, waitMs: 100, staleMs: 10 })).toBeNull();
    expect(existsSync(path)).toBe(true);
    unlinkSync(path);
  });

  test("先行 owner の finally は後続 owner の lock を削除しない", () => {
    const path = freshLockPath();
    withLock(
      () => {
        // lock path が別 owner に置き換わった競合を再現する。
        unlinkSync(path);
        writeFileSync(path, JSON.stringify({ pid: process.pid, token: "successor" }));
      },
      { path },
    );
    expect(existsSync(path)).toBe(true);
    unlinkSync(path);
  });

  test("通常実行は従来の 5 秒を超えても待ち、解放後に必ず実行する", async () => {
    const path = freshLockPath();
    const holder = Bun.spawn(["bun", HOLDER], {
      env: {
        ...process.env,
        TEST_LOCK_PATH: path,
        TEST_HOLD_MS: "5200",
      },
    });

    const readyDeadline = Date.now() + 2_000;
    while (!existsSync(path) && Date.now() < readyDeadline) {
      await Bun.sleep(10);
    }
    expect(existsSync(path)).toBe(true);

    let ran = false;
    const result = withLock(() => {
      ran = true;
      return "latest";
    }, { path });

    expect(result).toBe("latest");
    expect(ran).toBe(true);
    expect(await holder.exited).toBe(0);
  }, 10_000);
});
