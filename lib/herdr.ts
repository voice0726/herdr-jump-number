export const SOURCE = "voice0726.jump-number";

export type WorkspaceInfo = {
  workspace_id: string;
  number: number;
  label: string;
};

export type TabInfo = {
  tab_id: string;
  workspace_id: string;
  number: number;
  label: string;
};

export class HerdrError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "HerdrError";
  }
}

function herdrBin(): string {
  return process.env.HERDR_BIN_PATH ?? "herdr";
}

/** herdr CLI を実行し result オブジェクトを返す。失敗時は HerdrError。 */
export function run(args: string[]): Record<string, unknown> {
  const proc = Bun.spawnSync([herdrBin(), ...args]);
  const stdout = proc.stdout.toString();
  if (proc.exitCode !== 0) {
    throw new HerdrError(
      `herdr ${args.join(" ")} が exit ${proc.exitCode}: ${proc.stderr.toString().trim()}`,
    );
  }

  if (stdout.trim() === "") return {};

  let parsed: { result?: Record<string, unknown>; error?: { message?: string } };
  try {
    parsed = JSON.parse(stdout);
  } catch {
    throw new HerdrError(
      `herdr ${args.join(" ")} の出力が JSON ではない: ${stdout.slice(0, 200)}`,
    );
  }

  if (parsed.error) {
    throw new HerdrError(
      `herdr ${args.join(" ")} がエラー応答: ${parsed.error.message ?? JSON.stringify(parsed.error)}`,
    );
  }
  if (!parsed.result) {
    throw new HerdrError(`herdr ${args.join(" ")} の応答に result が無い`);
  }
  return parsed.result;
}

export function listWorkspaces(): WorkspaceInfo[] {
  const result = run(["workspace", "list"]);
  return (result.workspaces ?? []) as WorkspaceInfo[];
}

/** herdr tab list は全 workspace の tab を返す。 */
export function listTabs(): TabInfo[] {
  const result = run(["tab", "list"]);
  return (result.tabs ?? []) as TabInfo[];
}

export function setWorkspaceToken(id: string, name: string, value: string): void {
  run([
    "workspace",
    "report-metadata",
    id,
    "--source",
    SOURCE,
    "--token",
    `${name}=${value}`,
  ]);
}

export function clearWorkspaceToken(id: string, name: string): void {
  run(["workspace", "report-metadata", id, "--source", SOURCE, "--clear-token", name]);
}

export function renameTab(tabId: string, label: string): void {
  run(["tab", "rename", tabId, label]);
}
