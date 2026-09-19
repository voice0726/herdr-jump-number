#!/bin/sh
set -eu

# Herdr のサーバーは対話シェルで追加された PATH を継承しないことがある。
if command -v bun >/dev/null 2>&1; then
  exec bun "$(dirname "$0")/renumber.ts" "$@"
fi

for bun in \
  "${BUN_INSTALL:-$HOME/.bun}/bin/bun" \
  "${MISE_DATA_DIR:-${XDG_DATA_HOME:-$HOME/.local/share}/mise}/shims/bun"
do
  if [ -x "$bun" ]; then
    exec "$bun" "$(dirname "$0")/renumber.ts" "$@"
  fi
done

printf '%s\n' 'jump-number: Bun が見つかりません。Herdr の PATH、BUN_INSTALL、または mise の shim を確認してください。' >&2
exit 127
