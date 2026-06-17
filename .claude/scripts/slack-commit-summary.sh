#!/usr/bin/env bash
# PostToolUse hook — fires after a git commit in the WorthIT project.
# Sends a bilingual Slack summary (Hebrew + English) to #worthit-dev.
# Requires ONE of:
#   SLACK_WEBHOOK_URL  — Incoming Webhook URL (recommended, no scopes needed)
#   SLACK_BOT_TOKEN    — Bot/user token with chat:write scope

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

SLACK_CHANNEL="${SLACK_CHANNEL:-#worthit-dev}"
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
TEST_SUMMARY="אין שינויים בטסטים"
if [ -n "$TEST_FILES" ]; then
  TEST_COUNT=$(echo "$TEST_FILES" | wc -l | tr -d ' ')
  TEST_NAMES=$(echo "$TEST_FILES" | tr '\n' ', ' | sed 's/, $//')
  TEST_SUMMARY="${TEST_COUNT} קבצי טסט שונו: ${TEST_NAMES}"
fi

# Hebrew commit type
COMMIT_TYPE_HE="שינוי"
case "$MSG" in
  feat*)    COMMIT_TYPE_HE="פיצ׳ר חדש" ;;
  fix*)     COMMIT_TYPE_HE="תיקון באג" ;;
  docs*)    COMMIT_TYPE_HE="עדכון תיעוד בלבד" ;;
  refactor*) COMMIT_TYPE_HE="ריפקטורינג" ;;
  test*)    COMMIT_TYPE_HE="עדכון טסטים" ;;
  chore*)   COMMIT_TYPE_HE="תחזוקה" ;;
esac

# Risk detection
RISKS="אין סיכונים ידועים"
RISK_FLAGS=()
if git -C "$REPO_DIR" diff --name-only HEAD~1..HEAD 2>/dev/null | grep -qE 'shared/types'; then
  RISK_FLAGS+=("שינוי בטיפוסים משותפים — בדוק תאימות עם ה-extension")
fi
if git -C "$REPO_DIR" diff --name-only HEAD~1..HEAD 2>/dev/null | grep -q 'run\.ts'; then
  RISK_FLAGS+=("run.ts שונה — צינור הניתוח הראשי הושפע")
fi
if git -C "$REPO_DIR" diff --name-only HEAD~1..HEAD 2>/dev/null | grep -qE '\.env|env\.example'; then
  RISK_FLAGS+=("קובץ env שונה — ודא שמשתני הסביבה מוגדרים")
fi
ONLY_DOCS=$(git -C "$REPO_DIR" diff --name-only HEAD~1..HEAD 2>/dev/null | grep -vE '\.(md|txt|docx|png|jpg)$' || true)
if [ -z "$ONLY_DOCS" ]; then
  RISK_FLAGS+=("docs/formatting only — אין השפעה על runtime")
fi
if [ ${#RISK_FLAGS[@]} -gt 0 ]; then
  RISKS=$(printf "• %s\n" "${RISK_FLAGS[@]}")
fi

# Next step
NEXT_STEP="המשך לתהליך הפיתוח הבא"
case "$MSG" in
  *tavily*|*aiAnalysis*|*priceGathering*)
    NEXT_STEP="הוסף TAVILY_API_KEY ל-.env ובדוק עם listing אמיתי" ;;
  feat*)
    NEXT_STEP="בדוק את הפיצ׳ר החדש end-to-end ב-extension" ;;
  fix*)
    NEXT_STEP="ודא שהתיקון פותר את הבעיה ב-production" ;;
  docs*)
    NEXT_STEP="ממשיך — אין שינויי קוד" ;;
esac

# --- Build Slack blocks payload ---
# Safe JSON escaping via jq
build_payload() {
  jq -n \
    --arg channel "$SLACK_CHANNEL" \
    --arg hash "$HASH" \
    --arg msg "$MSG" \
    --arg author "$AUTHOR" \
    --arg date "$DATE" \
    --arg type_he "$COMMIT_TYPE_HE" \
    --arg files_changed "$FILES_CHANGED" \
    --arg files_list "$FILES_LIST" \
    --arg tests "$TEST_SUMMARY" \
    --arg risks "$RISKS" \
    --arg next "$NEXT_STEP" \
    '{
      channel: $channel,
      blocks: [
        {
          type: "header",
          text: { type: "plain_text", text: "🚀 WorthIT Commit Summary", emoji: true }
        },
        {
          type: "section",
          fields: [
            { type: "mrkdwn", text: ("*Hash:*\n`" + $hash + "`") },
            { type: "mrkdwn", text: ("*Message:*\n" + $msg) },
            { type: "mrkdwn", text: ("*Author:*\n" + $author) },
            { type: "mrkdwn", text: ("*Date:*\n" + $date) }
          ]
        },
        { type: "divider" },
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: ("🇮🇱 *סיכום בעברית*\n• *מה השתנה:* " + $type_he + " — " + $msg + "\n• *למה זה חשוב:* כל commit מקדם את WorthIT לניתוח עסקאות חכם יותר")
          }
        },
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: ("🇺🇸 *Technical Summary*\n• *What changed:* " + $msg + "\n• *Implementation notes:* " + $files_changed)
          }
        },
        { type: "divider" },
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
  # Incoming Webhook — no scopes needed, simplest approach
  HTTP_STATUS=$(curl -s -o /tmp/slack-response.txt -w "%{http_code}" \
    -X POST "$SLACK_WEBHOOK_URL" \
    -H "Content-Type: application/json" \
    --data "$PAYLOAD")
  if [ "$HTTP_STATUS" = "200" ]; then
    echo "[slack-commit-summary] ✅ Posted to ${SLACK_CHANNEL} for commit ${HASH}" >&2
  else
    echo "[slack-commit-summary] ❌ Webhook HTTP ${HTTP_STATUS} for commit ${HASH}: $(cat /tmp/slack-response.txt)" >&2
  fi
else
  # Bot/user token fallback
  RESPONSE=$(curl -s -X POST "https://slack.com/api/chat.postMessage" \
    -H "Authorization: Bearer ${SLACK_BOT_TOKEN}" \
    -H "Content-Type: application/json; charset=utf-8" \
    --data "$PAYLOAD")
  OK=$(echo "$RESPONSE" | jq -r '.ok // "false"')
  if [ "$OK" = "true" ]; then
    echo "[slack-commit-summary] ✅ Posted to ${SLACK_CHANNEL} for commit ${HASH}" >&2
  else
    ERROR=$(echo "$RESPONSE" | jq -r '.error // "unknown"')
    echo "[slack-commit-summary] ❌ Slack error: ${ERROR} (commit ${HASH})" >&2
  fi
fi
