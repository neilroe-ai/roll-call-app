#!/bin/bash
# PreToolUse (Bash) guard for git. Returns a permission decision as JSON
# (exit 0). Two tiers:
#   deny  -> destructive local commands, never permitted.
#   ask   -> git push: escalates to the user for manual approval.
# jq-free: extract the command with python3, fall back to scanning raw input
# so a missing interpreter degrades to "still catches", never "silently off".

INPUT=$(cat)
COMMAND=""

if command -v python3 >/dev/null 2>&1; then
  COMMAND=$(printf '%s' "$INPUT" | python3 -c 'import sys, json
try:
    print(json.load(sys.stdin).get("tool_input", {}).get("command", ""))
except Exception:
    pass')
fi
[ -z "$COMMAND" ] && COMMAND="$INPUT"

# Emit a permission decision and exit. Reason must be JSON-safe (no " or \).
emit() {  # $1 = allow|deny|ask   $2 = reason
  printf '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"%s","permissionDecisionReason":"%s"}}\n' "$1" "$2"
  exit 0
}

# Tier 1 - hard deny: destructive local commands, never permitted.
DENY_PATTERNS=(
  "git reset --hard"
  "reset --hard"
  "git clean -fd"
  "git clean -f"
  "git branch -D"
  "git checkout \."
  "git restore \."
)
for p in "${DENY_PATTERNS[@]}"; do
  if printf '%s' "$COMMAND" | grep -qE "$p"; then
    emit deny "This destructive git command is blocked by project policy. Do not attempt it."
  fi
done

# Tier 2 - ask: pushing to a remote requires the user to approve.
ASK_PATTERNS=(
  "git push"
  "push --force"
)
for p in "${ASK_PATTERNS[@]}"; do
  if printf '%s' "$COMMAND" | grep -qE "$p"; then
    emit ask "Push to a remote: approve to allow this push to run."
  fi
done

exit 0
