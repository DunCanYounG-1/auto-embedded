#!/usr/bin/env bash
# auto-embedded 端到端自测：编译 → init --all（7 平台）→ 结构/doctor/幂等/内核/工具脚本/注入/卸载 全链路断言。
# 跨平台：CLI 用 node，内核/hook 用探测到的 python（py/python3/python）。
set -euo pipefail
cd "$(dirname "$0")/.."

PY="${AEMB_PY:-}"
if [ -z "$PY" ]; then PY=$(command -v py 2>/dev/null || command -v python3 2>/dev/null || command -v python 2>/dev/null || true); fi
[ -n "$PY" ] || { echo "✗ 未找到 python（py/python3/python）" >&2; exit 1; }

fail() { echo "✗ FAIL: $*" >&2; exit 1; }
ok()   { echo "  ✓ $*"; }

echo "== 1) build =="
npm run build >/dev/null 2>&1 || npx tsc >/dev/null
CLI=(node dist/cli/index.js)

TMP=$(mktemp -d); trap 'rm -rf "$TMP"' EXIT
echo "== 2) init --all（7 平台）=="
"${CLI[@]}" init "$TMP" -u tester --all >/dev/null

echo "== 3) 结构断言 =="
for f in \
  .auto-embedded/scripts/aemb_core.py .auto-embedded/workflow.md .auto-embedded/config.yaml \
  .claude/settings.json .cursor/hooks.json .codex/config.toml .codex/hooks.json \
  .opencode/package.json .opencode/plugins/aemb-session-start.js \
  .github/copilot/hooks.json .github/hooks/aemb.json .gemini/settings.json \
  .windsurf/workflows/aemb-start.md .agents/skills/aemb-brainstorm/SKILL.md; do
  [ -f "$TMP/$f" ] || fail "缺文件 $f"
done; ok "7 平台关键文件齐全"

n=$(find "$TMP/.claude/skills" -mindepth 1 -maxdepth 1 -type d | wc -l)
[ "$n" -eq 25 ] || fail "claude 技能数=$n，应=25（3 工作流 + 22 工具）"; ok "claude 25 技能（3 工作流 + 22 工具）"

tn=$(find "$TMP/.auto-embedded/tools" -name '*.py' | wc -l)
[ "$tn" -ge 25 ] || fail "工具脚本数=$tn，应≥25"; ok "22 工具脚本 + shared 装入运行时"

# 知识库与专项流程随框架装入运行时（自上一代 embedded-dev 吸收）
rn=$(find "$TMP/.auto-embedded/refs" -name '*.md' | wc -l)
[ "$rn" -ge 40 ] || fail "refs 知识库篇数=$rn，应≥40"; ok "refs 知识库装入运行时（$rn 篇）"
mn=$(find "$TMP/.auto-embedded/modes" -name '*.md' | wc -l)
[ "$mn" -ge 12 ] || fail "modes 专项流程篇数=$mn，应≥12"; ok "modes 专项流程装入运行时（$mn 篇）"
[ -d "$TMP/.claude/agents" ] && [ -f "$TMP/.claude/agents/embedded-arch.md" ] || fail "缺比赛 subagent embedded-arch"; ok "6 比赛 subagent 随平台安装"

echo "== 4) doctor =="
"${CLI[@]}" doctor "$TMP" | grep -q "ALL OK" || fail "doctor 未 ALL OK"; ok "doctor ALL OK（7 平台接线）"

echo "== 4b) 完整 check（ARCH 分层门禁 + HW + SPEC；Windows 走 pwsh+arch-check.ps1）=="
"${CLI[@]}" check "$TMP" >/dev/null 2>&1 || fail "完整 aemb check 失败（exit≠0）——arch-check 解释器选择/路径问题"
ok "完整 check 通过（ARCH + HW + SPEC，跨平台解释器）"

echo "== 5) 幂等（再 init 不累积）=="
"${CLI[@]}" init "$TMP" --all >/dev/null
g=$(grep -c 'aemb-' "$TMP/.gemini/settings.json"); [ "$g" -eq 2 ] || fail "gemini settings 非幂等（aemb 引用=$g，应=2）"
ssg=$(node -e "console.log(JSON.parse(require('fs').readFileSync(process.argv[1],'utf8')).hooks.SessionStart.length)" "$TMP/.claude/settings.json")
[ "$ssg" -eq 3 ] || fail "claude SessionStart 组=$ssg，应=3"; ok "重复 init 幂等（gemini/claude 未累积）"

echo "== 6) 内核脚本可跑 =="
( cd "$TMP" && "$PY" .auto-embedded/scripts/task.py start '自测任务' >/dev/null && \
  "$PY" .auto-embedded/scripts/task.py phase PLAN >/dev/null ) || fail "task.py 失败"; ok "task.py start/phase 可跑"

echo "== 7) 工具脚本可跑（shared 导入在重定位后仍解析）=="
"$PY" "$TMP/.auto-embedded/tools/build-cmake/scripts/cmake_builder.py" --help >/dev/null 2>&1 \
  || fail "工具脚本 shared 导入失败（cmake_builder.py --help）"; ok "工具脚本 shared 导入 OK"

echo "== 8) SessionStart hook 注入（JSON 信封）=="
out=$(cd "$TMP" && CLAUDE_PROJECT_DIR="$TMP" "$PY" .claude/hooks/aemb-session-start.py)
echo "$out" | "$PY" -c "import sys,json; j=json.load(sys.stdin); h=j['hookSpecificOutput']; assert h['hookEventName']=='SessionStart'; a=h['additionalContext']; assert 'auto-embedded-session' in a and 'MODE: PLAN' in a; assert j['additional_context']==a" \
  || fail "SessionStart 输出不是合法 JSON 信封（hookSpecificOutput.additionalContext + additional_context）"
ok "SessionStart 注入合法 JSON 信封（现场 + 阶段 + Cursor 兼容字段）"

echo "== 9) 每轮面包屑 + 子 Agent 注入（JSON 信封）=="
( cd "$TMP" && "$PY" .auto-embedded/scripts/task.py select builder spec/architecture/index.md '分层约束' >/dev/null )
wf=$(cd "$TMP" && "$PY" .claude/hooks/aemb-inject-workflow-state.py)
echo "$wf" | "$PY" -c "import sys,json; j=json.load(sys.stdin); h=j['hookSpecificOutput']; assert h['hookEventName']=='UserPromptSubmit'; assert 'workflow-state' in h['additionalContext']" \
  || fail "每轮面包屑输出不是合法 JSON 信封"
wfg=$(cd "$TMP" && "$PY" .gemini/hooks/aemb-inject-workflow-state.py BeforeAgent)
echo "$wfg" | "$PY" -c "import sys,json; j=json.load(sys.stdin); assert j['hookSpecificOutput']['hookEventName']=='BeforeAgent'" \
  || fail "Gemini 面包屑 hookEventName 应为 BeforeAgent"
sa=$(cd "$TMP" && echo '{"tool_input":{"subagent_type":"aemb-builder","prompt":"ORIG"}}' | "$PY" .claude/hooks/aemb-inject-subagent-context.py)
echo "$sa" | "$PY" -c "import sys,json; j=json.load(sys.stdin); h=j['hookSpecificOutput']; assert h['permissionDecision']=='allow'; p=h['updatedInput']['prompt']; assert 'auto-embedded-subagent' in p and 'ORIG' in p" \
  || fail "子 Agent updatedInput 不合法（未改写 prompt / 未保留原 prompt）"
ok "面包屑(UserPromptSubmit/BeforeAgent) + 子 Agent updatedInput 注入合法 JSON"

echo "== 9b) Copilot hooks.json schema（version:1 + sessionStart + timeoutSec，无 userPromptSubmitted）=="
"$PY" -c "import json,sys; d=json.load(open(sys.argv[1])); assert d.get('version')==1, 'missing version:1'; h=d['hooks']; assert 'sessionStart' in h and 'userPromptSubmitted' not in h; it=h['sessionStart'][0]; assert 'timeoutSec' in it and 'timeout' not in it; assert 'aemb-session-start.py' in it['command']" "$TMP/.github/copilot/hooks.json" \
  || fail "Copilot hooks.json schema 不符（version:1 / timeoutSec / sessionStart）"
"$PY" -c "import json,sys; d=json.load(open(sys.argv[1])); assert d.get('version')==1" "$TMP/.github/hooks/aemb.json" \
  || fail ".github/hooks/aemb.json 缺 version:1"
ok "Copilot hook 文件符合 Copilot CLI schema"

echo "== 9c) 卸载不误删用户损坏的 package.json（回归：opencode invalid JSON scrub）=="
RT=$(mktemp -d)
"${CLI[@]}" init "$RT" --opencode >/dev/null
printf '{ this is NOT valid json ' > "$RT/.opencode/package.json"
"${CLI[@]}" uninstall "$RT" >/dev/null 2>&1 || true
[ -f "$RT/.opencode/package.json" ] || fail "卸载误删了用户损坏的 package.json（数据丢失）"
grep -q 'NOT valid json' "$RT/.opencode/package.json" || fail "损坏的 package.json 内容被改动"
rm -rf "$RT"; ok "卸载保留用户损坏的 package.json（不误删/不改动）"

echo "== 10) uninstall 全清 =="
"${CLI[@]}" uninstall "$TMP" >/dev/null
for d in .claude .cursor .codex .opencode .github .gemini .windsurf .agents .auto-embedded; do
  [ -e "$TMP/$d" ] && fail "卸载残留 $d"
done; ok "uninstall 全清（含空父目录）"
[ -d "$TMP/.auto-embedded.bak.1" ] || fail "卸载未备份"; ok "卸载前已备份"

echo "== 11) 增量 init 后 uninstall 清全部平台（回归：union .platforms/manifest）=="
IT=$(mktemp -d)
"${CLI[@]}" init "$IT" --claude >/dev/null
"${CLI[@]}" init "$IT" --opencode >/dev/null
grep -q claude "$IT/.auto-embedded/.platforms" && grep -q opencode "$IT/.auto-embedded/.platforms" \
  || fail "增量 init 后 .platforms 丢了旧平台"
grep -q '.claude/settings.json' "$IT/.auto-embedded/.template-manifest.json" \
  || fail "增量 init 后 manifest 丢了旧平台的 merges 记账"
"${CLI[@]}" uninstall "$IT" >/dev/null
for d in .claude .opencode .auto-embedded; do
  [ -e "$IT/$d" ] && fail "增量装(claude+opencode)后 uninstall 残留 $d"
done
rm -rf "$IT"; ok "增量 init(claude+opencode) 后 uninstall 清全部平台"

echo "== 12) 防 symlink 越界写（安全回归）=="
ST=$(mktemp -d); VICTIM="$(mktemp)"; printf 'USER_SECRET_DO_NOT_TOUCH' > "$VICTIM"
mkdir -p "$ST/.claude"
if ln -s "$VICTIM" "$ST/.claude/settings.json" 2>/dev/null && [ -L "$ST/.claude/settings.json" ]; then
  "${CLI[@]}" init "$ST" --claude >/dev/null 2>&1 || true
  grep -q 'USER_SECRET_DO_NOT_TOUCH' "$VICTIM" || fail "symlink 攻击：工程外 victim 被覆盖（数据丢失/越界写）!"
  [ -L "$ST/.claude/settings.json" ] && fail "settings.json 仍是 symlink（未替换为真实文件，仍可被跟随）"
  ok "merge 文件 symlink 未被跟随覆盖，工程外 victim 安全"

  # 12b) .auto-embedded 是指向工程外的目录 symlink → init 应拒绝，工程外不被写
  EXT=$(mktemp -d); printf 'EXTERNAL_RUNTIME_DATA' > "$EXT/pre.txt"; ST2=$(mktemp -d)
  if ln -s "$EXT" "$ST2/.auto-embedded" 2>/dev/null && [ -L "$ST2/.auto-embedded" ]; then
    "${CLI[@]}" init "$ST2" --claude >/dev/null 2>&1 && fail "init 未拒绝 .auto-embedded 越界 symlink" || true
    [ -f "$EXT/config.yaml" ] && fail "经 .auto-embedded symlink 写穿到工程外!"
    grep -q 'EXTERNAL_RUNTIME_DATA' "$EXT/pre.txt" || fail "工程外数据被改"
    ok ".auto-embedded 越界 symlink → init 拒绝，工程外安全"
  fi
  rm -rf "$EXT" "$ST2"
else
  echo "  · 跳过（本环境无法创建 symlink，需管理员/开发者模式）"
fi
rm -f "$VICTIM"; rm -rf "$ST"

echo "== ALL PASS =="
