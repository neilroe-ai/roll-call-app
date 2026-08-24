#!/bin/bash
# PreToolUse (Bash) guard: block destructive git commands before they run.
# Exit 2 => Claude Code refuses the command and shows stderr as the reason.
# jq-free: extract the command with python3, fall back to scanning raw input
# so a missing interpreter degrades to "still catches", never "silently off".

INPUT=$(cat)
COMMAND=""

if command -v python3 >/dev/null 2>&1; then
  COMMAND=$(printf '%s' "$INPUT" | python3 -c 'import sys, json
try:
    data = json.load(sys.stdin)
    print(data.get("tool_input", {}).get("command", ""))
except Exception:
    pass')
fi

# Fallback: if extraction produced nothing, scan the raw hook input instead.
[ -z "$COMMAND" ] && COMMAND="$INPUT"

DANGEROUS_PATTERNS=(
  "git push"
  "git reset --hard"
  "git clean -fd"
  "git clean -f"
  "git branch -D"
  "git checkout \."
  "git restore \."
  "push --force"
  "reset --hard"
)

for pattern in "${DANGEROUS_PATTERNS[@]}"; do
  if printf '%s' "$COMMAND" | grep -qE "$pattern"; then
    echo "BLOCKED: command matches dangerous git pattern '$pattern'. The user has prevented you from doing this." >&2
    exit 2
  fi
done

exit 0
