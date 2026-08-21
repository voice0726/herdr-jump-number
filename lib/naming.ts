import { PLACEHOLDER, type Config } from "./config";
import type { WorkspaceInfo } from "./herdr";

/** 正規表現メタ文字を無害化する。書式のリテラル部分をパターンに埋め込むために使う。 */
export function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * tab_prefix の書式から prefix 除去用のパターンを導出する。
 * リテラル部分はエスケープし、{n} だけを \\d+ に置き換える。
 * 既定値 "{n}:" なら /^\\d+:/ になる。
 */
export function tabPrefixPattern(cfg: Config): RegExp {
  const index = cfg.tabPrefix.indexOf(PLACEHOLDER);
  const head = escapeRegExp(cfg.tabPrefix.slice(0, index));
  const tail = escapeRegExp(cfg.tabPrefix.slice(index + PLACEHOLDER.length));
  return new RegExp(`^${head}\\d+${tail}`);
}

/**
 * ラベルから prefix を繰り返し剥がして base を得る。
 * null は「このラベルには触らない」を意味する:
 *   - 空ラベル
 *   - prefix だけで base が空になるラベル(剥がすと空ラベルを作ってしまう)
 */
export function tabBase(cfg: Config, label: string): string | null {
  const pattern = tabPrefixPattern(cfg);
  let current = label;
  for (;;) {
    const next = current.replace(pattern, "");
    if (next === current) return current === "" ? null : current;
    if (next === "") return null;
    current = next;
  }
}

/** null = その tab に触らない。 */
export function desiredTabLabel(
  cfg: Config,
  current: string,
  number: number,
): string | null {
  // 全桁数字は herdr の既定ラベル(= tab 番号そのもの)。既に番号が出ているので触らない。
  if (/^\d+$/.test(current)) return null;

  const base = tabBase(cfg, current);
  if (base === null) return null;

  const desired =
    number <= cfg.maxNumber
      ? cfg.tabPrefix.replace(PLACEHOLDER, String(number)) + base
      : base;

  return desired === current ? null : desired;
}

/** null = トークンを消す。 */
export function desiredWorkspaceToken(
  cfg: Config,
  number: number,
): string | null {
  if (number > cfg.maxNumber) return null;
  return cfg.workspaceToken.replace(PLACEHOLDER, String(number));
}

/** repo 本体 checkout(グループの親)かどうか。 */
function isRepoCheckout(workspace: WorkspaceInfo): boolean {
  return workspace.worktree?.is_linked_worktree === false;
}

/**
 * herdr sidebar の表示順を再現する。jump key はこの順の位置で workspace を
 * 解決するため、worktree のグループ化で flat 順とズレる。
 * 折りたたみ状態は API に露出しないため、全グループ展開を前提とする。
 */
export function displayOrder(workspaces: WorkspaceInfo[]): WorkspaceInfo[] {
  const membersByKey = new Map<string, WorkspaceInfo[]>();
  for (const workspace of workspaces) {
    const key = workspace.worktree?.repo_key;
    if (key === undefined) continue;
    const members = membersByKey.get(key);
    if (members) members.push(workspace);
    else membersByKey.set(key, [workspace]);
  }

  // グループ化されるのは、メンバーが 2 個以上かつ親を含むキーだけ。
  const groupedKeys = new Set<string>();
  for (const [key, members] of membersByKey) {
    if (members.length >= 2 && members.some(isRepoCheckout)) groupedKeys.add(key);
  }

  const emitted = new Set<string>();
  const ordered: WorkspaceInfo[] = [];
  for (const workspace of workspaces) {
    const key = workspace.worktree?.repo_key;
    if (key === undefined || !groupedKeys.has(key)) {
      ordered.push(workspace);
      continue;
    }
    if (emitted.has(key)) continue;
    emitted.add(key);

    const members = membersByKey.get(key);
    const parent = members?.find(isRepoCheckout);
    if (!members || !parent) {
      ordered.push(workspace);
      continue;
    }
    // 親を先頭に、残りのメンバーを flat 順で続ける。
    ordered.push(parent, ...members.filter((member) => member !== parent));
  }
  return ordered;
}
