import { PLACEHOLDER, type Config } from "./config";

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
