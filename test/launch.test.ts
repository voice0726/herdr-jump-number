import { afterEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

const launcher = join(import.meta.dir, "..", "bin", "launch.sh");
const temporaryDirs: string[] = [];

function fixture() {
  const home = mkdtempSync(join(tmpdir(), "jumpnum launch "));
  temporaryDirs.push(home);
  const env: Record<string, string> = { HOME: home, PATH: "/usr/bin:/bin" };
  function install(relativePath: string, name = "fallback", exitCode = 0) {
    const path = join(home, relativePath, "bun");
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, `#!/bin/sh\nprintf '%s\\n' '${name}' "$@"\nexit ${exitCode}\n`, { mode: 0o755 });
    return dirname(path);
  }
  function run(args: string[] = []) {
    return Bun.spawnSync(["/bin/sh", launcher, ...args], { env });
  }
  return { home, env, install, run };
}

afterEach(() => {
  for (const dir of temporaryDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe("Bun の起動経路", () => {
  test("PATH の bun を標準配置より優先する", () => {
    const f = fixture();
    f.install(".bun/bin");
    f.env.PATH = `${f.install("path", "path")}:${f.env.PATH}`;
    const result = f.run();
    expect(result.exitCode).toBe(0);
    expect(result.stdout.toString().split("\n")[0]).toBe("path");
  });

  test.each([".bun/bin", ".local/share/mise/shims"])("PATH にない %s から起動し、引数を保つ", (path) => {
    const f = fixture();
    f.install(path);
    const result = f.run(["--config-dir", "directory with spaces", "--reset"]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout.toString().trimEnd().split("\n")).toEqual([
      "fallback", join(dirname(launcher), "renumber.ts"),
      "--config-dir", "directory with spaces", "--reset",
    ]);
  });

  test.each([
    ["BUN_INSTALL", "custom bun", "bin"],
    ["MISE_DATA_DIR", "custom mise", "shims"],
    ["XDG_DATA_HOME", "custom data", "mise/shims"],
  ])("%s の指定先を使う", (key, dir, suffix) => {
    const f = fixture();
    f.env[key] = join(f.home, dir);
    f.install(join(dir, suffix));
    expect(f.run().exitCode).toBe(0);
  });

  test("Bun の終了コードを呼び出し元へ返す", () => {
    const f = fixture();
    f.install(".bun/bin", "failure", 42);
    expect(f.run().exitCode).toBe(42);
  });

  test("Bun が見つからない場合は原因を stderr に出す", () => {
    const f = fixture();
    const result = f.run();
    expect(result.exitCode).toBe(127);
    expect(result.stderr.toString()).toContain("Bun が見つかりません");
  });

  test("制限された PATH でも実際の Bun で採番処理を実行する", () => {
    const f = fixture();
    const bin = join(f.home, ".bun/bin");
    mkdirSync(bin, { recursive: true });
    symlinkSync(process.execPath, join(bin, "bun"));
    const herdr = join(f.home, "herdr");
    writeFileSync(herdr, `#!/bin/sh
case "$1" in
  workspace) printf '%s\\n' '{"result":{"workspaces":[]}}' ;;
  tab) printf '%s\\n' '{"result":{"tabs":[]}}' ;;
  *) exit 1 ;;
esac
`, { mode: 0o755 });
    f.env.HERDR_BIN_PATH = herdr;
    f.env.HERDR_PLUGIN_STATE_DIR = f.home;
    f.env.HERDR_PLUGIN_CONFIG_DIR = f.home;
    const result = f.run();
    expect(result.stderr.toString()).toBe("");
    expect(result.exitCode).toBe(0);
  });
});
