#!/usr/bin/env bash
# PostToolUse hook — fires after a git commit in the WorthIT project.
# Sends an English commit summary to #worthit-dev.
# Requires: SLACK_WEBHOOK_URL env var (set in ~/.claude/settings.json, never in git).

set -euo pipefail

# --- Read hook stdin ---
HOOK_INPUT=$(cat)
COMMAND=$(echo "$HOOK_INPUT" | jq -r '.tool_input.command // ""')

# Only proceed if this was a git commit command
if ! echo "$COMMAND" | grep -qE '^git commit'; then
  exit 0
fi

# --- Validate credentials ---
if [ -z "${SLACK_WEBHOOK_URL:-}" ] && [ -z "${SLACK_BOT_TOKEN:-}" ]; then
  echo "[slack-commit-summary] No SLACK_WEBHOOK_URL or SLACK_BOT_TOKEN set — skipping" >&2
  exit 0
fi

REPO_DIR="/Users/shaishargal/worthIT"

# --- Gather commit data ---
HASH=$(git -C "$REPO_DIR" rev-parse --short HEAD 2>/dev/null) || exit 0
MSG=$(git -C "$REPO_DIR" log -1 --format="%s" 2>/dev/null) || exit 0
AUTHOR=$(git -C "$REPO_DIR" log -1 --format="%an" 2>/dev/null) || exit 0
DATE=$(git -C "$REPO_DIR" log -1 --format="%cd" --date=format:"%Y-%m-%d %H:%M" 2>/dev/null) || exit 0
FILES_CHANGED=$(git -C "$REPO_DIR" diff --stat HEAD~1..HEAD 2>/dev/null | tail -1 || echo "N/A")
FILES_LIST=$(git -C "$REPO_DIR" diff --name-status HEAD~1..HEAD 2>/dev/null | head -20 || echo "N/A")

# Tests changed
TEST_FILES=$(git -C "$REPO_DIR" diff --name-only HEAD~1..HEAD 2>/dev/null | grep -E '(test|spec)\.' || true)
TEST_SUMMARY="No test files changed"
if [ -n "$TEST_FILES" ]; then
  TEST_COUNT=$(echo "$TEST_FILES" | wc -l | tr -d ' ')
  TEST_NAMES=$(echo "$TEST_FILES" | tr '\n' ', ' | sed 's/, $//')
  TEST_SUMMARY="${TEST_COUNT} test file(s): ${TEST_NAMES}"
fi

# Commit type label
COMMIT_TYPE="Change"
case "$MSG" in
  feat*)     COMMIT_TYPE="New Feature" ;;
  fix*)      COMMIT_TYPE="Bug Fix" ;;
  docs*)     COMMIT_TYPE="Docs / Formatting only" ;;
  refactor*) COMMIT_TYPE="Refactor" ;;
  test*)     COMMIT_TYPE="Tests" ;;
  chore*)    COMMIT_TYPE="Chore / Maintenance" ;;
esac

# Risk detection
RISKS="None"
RISK_FLAGS=()
if git -C "$REPO_DIR" diff --name-only HEAD~1..HEAD 2>/dev/null | grep -qE 'shared/types'; then
  RISK_FLAGS+=("Shared types changed — verify extension compatibility")
fi
if git -C "$REPO_DIR" diff --name-only HEAD~1..HEAD 2>/dev/null | grep -q 'run\.ts'; then
  RISK_FLAGS+=("run.ts changed — core analysis pipeline affected")
fi
if git -C "$REPO_DIR" diff --name-only HEAD~1..HEAD 2>/dev/null | grep -qE '\.env|env\.example'; then
  RISK_FLAGS+=("env file changed — make sure env vars are set")
fi
ONLY_DOCS=$(git -C "$REPO_DIR" diff --name-only HEAD~1..HEAD 2>/dev/null | grep -vE '\.(md|txt|docx|png|jpg)$' || true)
if [ -z "$ONLY_DOCS" ]; then
  RISK_FLAGS+=("Docs/formatting only — no runtime impact")
fi
if [ ${#RISK_FLAGS[@]} -gt 0 ]; then
  RISKS=$(printf "• %s\n" "${RISK_FLAGS[@]}")
fi

# Next step
NEXT_STEP="Continue with the next development task"
case "$MSG" in
  *tavily*|*aiAnalysis*|*priceGathering*)
    NEXT_STEP="Add TAVILY_API_KEY to .env and test with a real listing" ;;
  feat*)
    NEXT_STEP="Test the new feature end-to-end in the extension" ;;
  fix*)
    NEXT_STEP="Verify the fix resolves the issue in production" ;;
  docs*)
    NEXT_STEP="No code changes — continue" ;;
esac

# --- Build Slack payload ---
build_payload() {
  jq -n \
    --arg hash "$HASH" \
    --arg msg "$MSG" \
    --arg author "$AUTHOR" \
    --arg date "$DATE" \
    --arg type "$COMMIT_TYPE" \
    --arg files_changed "$FILES_CHANGED" \
    --arg files_list "$FILES_LIST" \
    --arg tests "$TEST_SUMMARY" \
    --arg risks "$RISKS" \
    --arg next "$NEXT_STEP" \
    '{
      blocks: [
        {
          type: "header",
          text: { type: "plain_text", text: "🚀 WorthIT Commit Summary", emoji: true }
        },
        {
          type: "section",
          fields: [
            { type: "mrkdwn", text: ("*Hash:*\n`" + $hash + "`") },
            { type: "mrkdwn", text: ("*Type:*\n" + $type) },
            { type: "mrkdwn", text: ("*Author:*\n" + $author) },
            { type: "mrkdwn", text: ("*Date:*\n" + $date) }
          ]
        },
        {
          type: "section",
          text: { type: "mrkdwn", text: ("*Message:*\n" + $msg) }
        },
        { type: "divider" },
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: ("🔧 *Technical Summary*\n• *What changed:* " + $msg + "\n• *Scope:* " + $files_changed)
          }
        },
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: ("📁 *Files Changed*\n```" + $files_list + "```")
          }
        },
        {
          type: "section",
          fields: [
            { type: "mrkdwn", text: ("🧪 *Tests:*\n" + $tests) },
            { type: "mrkdwn", text: ("⚠️ *Risks / Open Issues:*\n" + $risks) }
          ]
        },
        {
          type: "section",
          text: { type: "mrkdwn", text: ("➡️ *Next Step:* " + $next) }
        }
      ]
    }'
}

PAYLOAD=$(build_payload)

# --- Send to Slack ---
if [ -n "${SLACK_WEBHOOK_URL:-}" ]; then
  HTTP_STATUS=$(curl -s -o /tmp/slack-response.txt -w "%{http_code}" \
    -X POST "$SLACK_WEBHOOK_URL" \
    -H "Content-Type: application/json" \
    --data "$PAYLOAD")
  if [ "$HTTP_STATUS" = "200" ]; then
    echo "[slack-commit-summary] ✅ Posted to #worthit-dev for commit ${HASH}" >&2
  else
    echo "[slack-commit-summary] ❌ Webhook HTTP ${HTTP_STATUS}: $(cat /tmp/slack-response.txt)" >&2
  fi
else
  RESPONSE=$(curl -s -X POST "https://slack.com/api/chat.postMessage" \
    -H "Authorization: Bearer ${SLACK_BOT_TOKEN}" \
    -H "Content-Type: application/json; charset=utf-8" \
    --data "$PAYLOAD")
  OK=$(echo "$RESPONSE" | jq -r '.ok // "false"')
  if [ "$OK" = "true" ]; then
    echo "[slack-commit-summary] ✅ Posted to #worthit-dev for commit ${HASH}" >&2
  else
    ERROR=$(echo "$RESPONSE" | jq -r '.error // "unknown"')
    echo "[slack-commit-summary] ❌ Slack error: ${ERROR}" >&2
  fi
fi
