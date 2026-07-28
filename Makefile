.PHONY: check typecheck test

check: typecheck test

typecheck:
	bun run typecheck

test:
	bun test
