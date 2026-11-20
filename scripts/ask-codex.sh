#!/usr/bin/env bash
# Claude Code → Codex 질문/작업 위임 (codex exec). Codex CLI 0.171+ 필요.
# 사용: scripts/ask-codex.sh [read|write] "질문 또는 작업"
#   read  (기본): 읽기 전용 샌드박스 — 리뷰·질문
#   write       : 작업폴더 쓰기 허용 — 파일 담당이 Codex인 작업만
# 답은 표준출력, 전체 로그는 $TMPDIR/codex_last.log
set -euo pipefail
CODEX_BIN="${CODEX_BIN:-$HOME/.local/codex-cli/codex.exe}"
MODE="read"; if [[ "${1:-}" == "read" || "${1:-}" == "write" ]]; then MODE="$1"; shift; fi
SANDBOX=$([[ "$MODE" == "write" ]] && echo workspace-write || echo read-only)
ROOT="$(cd "$(dirname "$0")/.." && (pwd -W 2>/dev/null || pwd))"
LOG="${TMPDIR:-/tmp}/codex_last.log"; OUT="${TMPDIR:-/tmp}/codex_last_answer.txt"
"$CODEX_BIN" exec --sandbox "$SANDBOX" -C "$ROOT" -o "$OUT" "[Claude Code에서 보낸 요청 · 모드:$MODE] $*" > "$LOG" 2>&1
cat "$OUT"
