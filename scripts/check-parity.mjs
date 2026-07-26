#!/usr/bin/env node
/**
 * check-parity —— 7 平台交付 parity 检查。
 *
 * 「一次写、全平台交付」是本框架的核心承诺，而它最典型的腐化方式是：
 * 新增一个 tool-skill / command / agent，改了 Claude 的 configurator，忘了 Codex 或 Windsurf。
 * 这种漏装没有任何报错——那个平台的用户只是永远看不到这个技能。
 *
 * 判定策略（不需要我拍板"谁该有什么"，只认自明的矛盾）：
 *   · 声明 full 却只装了一部分  → 硬失败，并列出缺哪几个（这就是"忘了某平台"的形态）
 *   · 声明 full 却一个没装      → 硬失败
 *   · 声明 none 却装了          → 只告警（说明平台能力扩了，更新基线即可）
 *   · STABLE_TOOLS 里出现基线未声明的新平台 → 硬失败（新平台必须显式声明 parity）
 *
 * 平台清单与纳管路径全部取自 dist/types/ai-tools.js 的 AEMB_TOOLS（唯一事实源，不另建矩阵）。
 *
 * 用法：
 *   node scripts/check-parity.mjs --print          # 只打印实测矩阵（用来定/更新基线）
 *   node scripts/check-parity.mjs                  # 自己建临时工程跑 init --all --full 再校验
 *   PARITY_DIR=<已 init 好的工程> node scripts/check-parity.mjs   # 复用现成工程（自测里用这个，省一次 init）
 *
 * 环境变量：FAIL_ON_FINDINGS（默认 true）、PARITY_DIR、KEEP_TMP（默认 false）
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FAIL_ON_FINDINGS = (process.env.FAIL_ON_FINDINGS || 'true').toLowerCase() !== 'false';
const KEEP_TMP = (process.env.KEEP_TMP || 'false').toLowerCase() === 'true';
const PRINT_ONLY = process.argv.includes('--print');

/** common 下按种类分组的共享 body —— 全平台交付的源头 */
const KINDS = {
  commands: 'templates/common/commands',
  skills: 'templates/common/skills',
  'tool-skills': 'templates/common/tool-skills',
  agents: 'templates/common/agents',
};

/**
 * 交付基线：平台 × 种类 → 'full'（该种类全部单元都必须落地）| 'none'（该平台不交付此种类）。
 * 由 `--print` 实测得出并人工确认，作为回归基线；平台能力变化时更新这里。
 * 基线确认于 2026-07-26（commit 44e85df，CI 全绿）。
 */
const BASELINE = {
  claude: { commands: 'full', skills: 'full', 'tool-skills': 'full', agents: 'full' },
  cursor: { commands: 'full', skills: 'full', 'tool-skills': 'full', agents: 'full' },
  codex: { commands: 'full', skills: 'full', 'tool-skills': 'full', agents: 'full' },
  opencode: { commands: 'full', skills: 'full', 'tool-skills': 'full', agents: 'full' },
  copilot: { commands: 'full', skills: 'full', 'tool-skills': 'full', agents: 'full' },
  gemini: { commands: 'full', skills: 'full', 'tool-skills': 'full', agents: 'full' },
  // windsurf: injectClass 'command'，无 hook / 无子 Agent 能力，configurator 文件头明写"无 agents"。
  // 模板里 {{#AGENT_CAPABLE}} 块会被 resolvePlaceholders 隐去，所以不装 agent 定义是设计而非漏装。
  windsurf: { commands: 'full', skills: 'full', 'tool-skills': 'full', agents: 'none' },
};

// ---------------------------------------------------------------- 采集

function unitNames() {
  const out = {};
  for (const [kind, dir] of Object.entries(KINDS)) {
    out[kind] = fs
      .readdirSync(path.join(REPO, dir))
      .filter((f) => f.endsWith('.md'))
      .map((f) => f.replace(/\.md$/, ''))
      .sort();
  }
  return out;
}

function walk(dir, acc = []) {
  if (!fs.existsSync(dir)) return acc;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, acc);
    else acc.push(p);
  }
  return acc;
}

/**
 * 归一化：去掉 aemb- / aemb_ 前缀，再去掉所有点后缀。
 * 两侧（common 单元名、平台落地文件名）必须用同一套，否则 `aemb-builder.md` 这个单元
 * 会永远匹配不上 `.claude/agents/aemb-builder.md` —— 两边都要剥，不能只剥一边。
 * 点后缀要整段剥（不是只剥最后一个）：Copilot 落地成 `aemb-start.prompt.md`。
 */
function norm(name) {
  return name.replace(/^aemb[-_]/, '').split('.')[0];
}

/**
 * 一个文件"承载"哪些单元名：它的文件名 stem + 每一层目录名，各自归一化。
 * 按整段比对，不做子串匹配——子串匹配会让 `arch-check.ps1` 假装成 `check` 单元，把真窟窿盖住。
 */
function carriedNames(relPath) {
  return new Set(relPath.split(/[\\/]/).map(norm));
}

function platformRoots(cfg) {
  return [cfg.configDir, ...(cfg.extraManagedPaths || []), ...(cfg.supportsAgentSkills ? ['.agents'] : [])];
}

function measure(projectDir, tools, specs, units) {
  const matrix = {};
  for (const t of tools) {
    const files = platformRoots(specs[t]).flatMap((r) => walk(path.join(projectDir, r)));
    const carried = new Set();
    for (const f of files) for (const k of carriedNames(path.relative(projectDir, f))) carried.add(k);

    matrix[t] = {};
    for (const [kind, list] of Object.entries(units)) {
      const present = list.filter((u) => carried.has(norm(u)));
      matrix[t][kind] = { present, missing: list.filter((u) => !carried.has(norm(u))) };
    }
  }
  return matrix;
}

// ---------------------------------------------------------------- 判定

function evaluate(matrix, units, tools) {
  const findings = [];

  for (const t of tools) {
    if (!BASELINE[t]) {
      findings.push({ platform: t, kind: '—', detail: '新平台未在 parity 基线里声明 —— 必须显式声明每类交付 full/none' });
      continue;
    }
    for (const [kind, list] of Object.entries(units)) {
      const want = BASELINE[t][kind];
      const { present, missing } = matrix[t][kind];

      if (want === 'full' && missing.length > 0) {
        findings.push({
          platform: t,
          kind,
          detail:
            present.length === 0
              ? `声明 full 但一个都没装（0/${list.length}）`
              : `声明 full 但缺 ${missing.length} 个（${present.length}/${list.length}）：${missing.map((m) => `\`${m}\``).join(' ')}`,
        });
      } else if (want === 'none' && present.length > 0) {
        findings.push({
          platform: t,
          kind,
          soft: true,
          detail: `声明 none 但装了 ${present.length} 个 —— 平台能力扩了？更新基线`,
        });
      } else if (want !== 'full' && want !== 'none') {
        findings.push({ platform: t, kind, detail: `基线值非法：${JSON.stringify(want)}（只能是 full / none）` });
      }
    }
  }
  return findings;
}

function matrixTable(matrix, units, tools) {
  const kinds = Object.keys(units);
  return [
    '## 交付矩阵',
    '',
    `| 平台 | ${kinds.map((k) => `${k} (${units[k].length})`).join(' | ')} |`,
    `|---|${kinds.map(() => '---').join('|')}|`,
    ...tools.map(
      (t) =>
        `| \`${t}\` | ${kinds
          .map((k) => {
            const { present } = matrix[t][k];
            const want = BASELINE[t]?.[k];
            const mark = want === 'none' ? (present.length ? '⚠️' : '—') : present.length === units[k].length ? '✅' : '❌';
            return `${mark} ${present.length}/${units[k].length}`;
          })
          .join(' | ')} |`,
    ),
    '',
  ];
}

function findingsTable(findings) {
  const lines = ['## parity 漂移', ''];
  if (findings.length === 0) {
    lines.push('None found.', '');
    return lines;
  }
  lines.push('| 平台 | 种类 | 说明 |', '|---|---|---|');
  for (const f of findings) {
    lines.push(`| \`${f.platform}\` | ${f.kind}${f.soft ? ' (warn)' : ''} | ${f.detail.replace(/\|/g, '\\|')} |`);
  }
  lines.push('');
  return lines;
}

// ---------------------------------------------------------------- main

async function main() {
  const { AEMB_TOOLS, STABLE_TOOLS } = require(path.join(REPO, 'dist/types/ai-tools.js'));
  const units = unitNames();

  let projectDir = process.env.PARITY_DIR;
  let tmp = null;
  if (!projectDir) {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'aemb-parity-'));
    execFileSync('node', [path.join(REPO, 'dist/cli/index.js'), 'init', tmp, '-u', 'parity', '--all', '--full'], {
      cwd: REPO,
      stdio: 'ignore',
    });
    projectDir = tmp;
  }

  try {
    const matrix = measure(projectDir, STABLE_TOOLS, AEMB_TOOLS, units);
    const findings = PRINT_ONLY ? [] : evaluate(matrix, units, STABLE_TOOLS);
    const hard = findings.filter((f) => !f.soft);

    const out = [
      '# Parity Checks',
      '',
      `- 平台（STABLE_TOOLS）：${STABLE_TOOLS.length}`,
      `- common 单元：${Object.entries(units).map(([k, v]) => `${k} ${v.length}`).join(' / ')}`,
      `- 探测工程：\`${projectDir}\`${tmp ? '（本次自建）' : '（复用 PARITY_DIR）'}`,
      ...(PRINT_ONLY ? ['- **--print 模式：只打印矩阵，不判定**'] : [`- 漂移：${findings.length}（硬失败 ${hard.length} / 仅告警 ${findings.length - hard.length}）`]),
      '',
      ...matrixTable(matrix, units, STABLE_TOOLS),
      ...(PRINT_ONLY ? [] : findingsTable(findings)),
    ].join('\n');

    console.log(out);
    const summary = process.env.GITHUB_STEP_SUMMARY;
    if (summary) await fs.promises.appendFile(summary, `${out}\n`, 'utf8');

    if (!PRINT_ONLY && hard.length > 0 && FAIL_ON_FINDINGS) process.exitCode = 1;
  } finally {
    if (tmp && !KEEP_TMP) fs.rmSync(tmp, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : error);
  process.exitCode = 1;
});
