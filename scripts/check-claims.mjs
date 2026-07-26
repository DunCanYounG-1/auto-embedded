#!/usr/bin/env node
/**
 * check-claims —— 声明一致性门禁。
 *
 * 规则只有一条：**文档里写的数量和日期，必须能从磁盘和 git 推导出来。**
 * 数量声明（24 个工具技能 / 13 个专项流程 / 80+ 篇知识库 / 7 平台）是 README 的卖点，
 * 也是 SKILL.md 喂给 AI 的自我描述——一漂移，AI 就在用错误的自我认知干活。
 *
 * 设计借鉴 awesome-LangGraph/scripts/repo-checks.mjs：
 *   报告优先（先出 Markdown 表，再决定退出码）、阈值走环境变量、CI 里写 Step Summary、
 *   拿不到外部信息时 warn 而不是 fail（这里对应 git 不可用时跳过日期检查）。
 *
 * 环境变量：
 *   FAIL_ON_FINDINGS    默认 true  —— 精确计数漂移时 exit 1
 *   FAIL_ON_STALE_DATE  默认 false —— project.yaml 的 updated 落后于内容提交时是否也算失败
 *   OPEN_CLAIM_SLACK    默认 15    —— "N+ 篇" 这类开放声明允许比实际落后多少
 *
 * 豁免：某行确实要写与真值不同的数字时，在该行加 `claims-ignore` 注释即可跳过。
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FAIL_ON_FINDINGS = (process.env.FAIL_ON_FINDINGS || 'true').toLowerCase() !== 'false';
const FAIL_ON_STALE_DATE = (process.env.FAIL_ON_STALE_DATE || 'false').toLowerCase() === 'true';
const OPEN_CLAIM_SLACK = Number.parseInt(process.env.OPEN_CLAIM_SLACK || '15', 10);

const abs = (...p) => path.join(REPO, ...p);
const rel = (p) => path.relative(REPO, p).split(path.sep).join('/');

/** 声明面：被扫描的文件（内容真值来自 templates/ 与 src/，声明来自这些）。 */
const DECLARATION_FILES = [
  'README.md',
  'README_EN.md',
  'SKILL.md',
  'INSTALL.md',
  'CLAUDE.md',
  'project.yaml',
  'package.json',
  'docs/architecture.md',
  'docs/architecture_CN.md',
  'docs/concepts.md',
  'docs/concepts_CN.md',
  'docs/quick-start.md',
  'docs/quick-start_CN.md',
];

// ---------------------------------------------------------------- 磁盘真值

function mdFiles(dir, { recursive = false, excludeBasenames = [] } = {}) {
  const out = [];
  const walk = (d) => {
    for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, entry.name);
      if (entry.isDirectory()) {
        if (recursive) walk(p);
      } else if (entry.name.endsWith('.md') && !excludeBasenames.includes(entry.name)) {
        out.push(p);
      }
    }
  };
  walk(dir);
  return out;
}

function subdirs(dir) {
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name);
}

/** 已实现平台数 = src/configurators/index.ts 的 CONFIGURATORS 注册表条目数（预留位不算）。 */
function countPlatforms() {
  const src = fs.readFileSync(abs('src/configurators/index.ts'), 'utf8');
  const start = src.indexOf('export const CONFIGURATORS');
  if (start === -1) throw new Error('src/configurators/index.ts 里找不到 CONFIGURATORS 注册表');
  const open = src.indexOf('{', start);
  const close = src.indexOf('};', open);
  if (open === -1 || close === -1) throw new Error('CONFIGURATORS 注册表边界解析失败');
  const body = src.slice(open, close);
  return [...body.matchAll(/^\s*([a-z][\w-]*)\s*:\s*configure/gm)].length;
}

function collectFacts() {
  const toolSkillBodies = mdFiles(abs('templates/common/tool-skills')).length;
  const toolScriptDirs = subdirs(abs('templates/auto-embedded/tools')).filter((n) => n !== 'shared').length;

  return {
    toolSkillBodies,
    toolScriptDirs,
    tools: toolSkillBodies,
    refs: mdFiles(abs('templates/auto-embedded/refs'), {
      recursive: true,
      excludeBasenames: ['index.md'],
    }).length,
    modes: mdFiles(abs('templates/auto-embedded/modes'), { excludeBasenames: ['index.md'] }).length,
    platforms: countPlatforms(),
  };
}

// ---------------------------------------------------------------- 声明规则

const ENTITIES = {
  tools: { label: '工具技能 / 工具脚本', source: 'templates/common/tool-skills/*.md ↔ templates/auto-embedded/tools/*/' },
  refs: { label: 'refs 知识库篇数', source: 'templates/auto-embedded/refs/**/*.md（不含 index.md）' },
  modes: { label: 'modes 专项流程数', source: 'templates/auto-embedded/modes/*.md（不含 index.md）' },
  platforms: { label: '已实现平台数', source: 'src/configurators/index.ts → CONFIGURATORS' },
};

/**
 * kind: 'exact' —— 必须等于真值；'open' —— "N+" 形式，允许 N ≤ 真值 且落后不超过 OPEN_CLAIM_SLACK。
 * 数字与关键词之间允许夹最多 14 个「非数字」字符，这样 "22 个编译/烧录/调试工具技能" 也能被抓到，
 * 同时因为不跨数字，"13 个专项流程 + 24 个工具技能" 不会被错误配对。
 */
const RULES = [
  { entity: 'tools', kind: 'exact', re: /(\d+)\s*(?:个\s*)?[^\d\n]{0,14}?(?:工具(?:调用)?技能|工具脚本)/g },
  { entity: 'tools', kind: 'exact', re: /(\d+)\s+tool[-\s](?:skill|script)/gi },
  { entity: 'modes', kind: 'exact', re: /(\d+)\s*(?:个\s*)?专项流程/g },
  { entity: 'modes', kind: 'exact', re: /(\d+)\s+specialized\s+workflow/gi },
  // 平台：排除 "3 个平台无关 Python 钩子" / "3 platform-agnostic hooks"
  { entity: 'platforms', kind: 'exact', re: /(\d+)\s*(?:个\s*)?(?:AI\s*)?平台(?!无关)/g },
  { entity: 'platforms', kind: 'exact', re: /(\d+)\s+(?:AI\s+)?(?:coding\s+)?platforms?(?!\s*-?\s*agnostic)/gi },
  { entity: 'refs', kind: 'open', re: /(\d+)\+\s*篇/g },
  { entity: 'refs', kind: 'open', re: /(\d+)\+\s+article/gi },
];

function scanDeclarations(facts) {
  const findings = [];
  let checked = 0;

  for (const file of DECLARATION_FILES) {
    const full = abs(file);
    if (!fs.existsSync(full)) {
      findings.push({ file, line: 0, kind: 'missing', detail: '声明文件不存在（DECLARATION_FILES 需同步）' });
      continue;
    }

    const lines = fs.readFileSync(full, 'utf8').split(/\r?\n/);
    lines.forEach((text, i) => {
      if (text.includes('claims-ignore')) return;

      for (const rule of RULES) {
        rule.re.lastIndex = 0;
        for (const m of text.matchAll(rule.re)) {
          const declared = Number.parseInt(m[1], 10);
          const actual = facts[rule.entity];
          checked += 1;

          const bad =
            rule.kind === 'exact'
              ? declared !== actual
              : declared > actual || actual - declared > OPEN_CLAIM_SLACK;

          if (bad) {
            findings.push({
              file,
              line: i + 1,
              kind: rule.kind === 'exact' ? 'count' : 'open-count',
              entity: rule.entity,
              declared: rule.kind === 'open' ? `${declared}+` : declared,
              actual,
              detail: m[0].trim(),
            });
          }
        }
      }
    });
  }

  return { findings, checked };
}

// ---------------------------------------------------------------- 事实自洽 + 日期

function checkInternalConsistency(facts) {
  if (facts.toolSkillBodies === facts.toolScriptDirs) return [];
  return [
    {
      file: 'templates/',
      line: 0,
      kind: 'inconsistent',
      detail:
        `工具技能 body 数（${facts.toolSkillBodies}，templates/common/tool-skills/）` +
        ` ≠ 工具脚本目录数（${facts.toolScriptDirs}，templates/auto-embedded/tools/ 去掉 shared）` +
        `——新增工具技能时漏了一半`,
    },
  ];
}

function git(args) {
  return execFileSync('git', args, { cwd: REPO, encoding: 'utf8' }).trim();
}

/** project.yaml 的 updated 不得早于最后一次改动 src/ 或 templates/ 的提交日期。 */
function checkUpdatedDate() {
  const yaml = fs.readFileSync(abs('project.yaml'), 'utf8');
  const lines = yaml.split(/\r?\n/);
  const idx = lines.findIndex((l) => /^updated:/.test(l));
  if (idx === -1) {
    return { findings: [{ file: 'project.yaml', line: 0, kind: 'date', detail: '缺 updated 字段' }], note: null };
  }

  const declared = (lines[idx].match(/^updated:\s*(\S+)/) || [])[1] || '';

  let lastContentCommit;
  try {
    lastContentCommit = git(['log', '-1', '--format=%cs', '--', 'src', 'templates']);
  } catch {
    return { findings: [], note: '⚠️ git 不可用或无历史，跳过 updated 日期检查（浅克隆需 fetch-depth: 0）' };
  }
  if (!lastContentCommit) {
    return { findings: [], note: '⚠️ 未找到改动 src/ 或 templates/ 的提交，跳过 updated 日期检查' };
  }

  if (declared >= lastContentCommit) {
    return { findings: [], note: `updated=${declared} ≥ 最后内容提交 ${lastContentCommit}` };
  }

  return {
    findings: [
      {
        file: 'project.yaml',
        line: idx + 1,
        kind: 'date',
        detail: `updated=${declared} 落后于最后一次 src/·templates/ 提交 ${lastContentCommit}`,
        soft: !FAIL_ON_STALE_DATE,
      },
    ],
    note: null,
  };
}

// ---------------------------------------------------------------- 报告

function factsTable(facts) {
  return [
    '## 磁盘真值',
    '',
    '| 实体 | 实际 | 推导来源 |',
    '|---|---|---|',
    ...Object.entries(ENTITIES).map(([k, v]) => `| ${v.label} | ${facts[k]} | \`${v.source}\` |`),
    '',
  ];
}

function findingsTable(findings) {
  const lines = ['## 漂移', ''];
  if (findings.length === 0) {
    lines.push('None found.', '');
    return lines;
  }
  lines.push('| 位置 | 类型 | 声明 | 实际 | 命中文本 / 说明 |', '|---|---|---|---|---|');
  for (const f of findings) {
    const where = f.line ? `\`${f.file}:${f.line}\`` : `\`${f.file}\``;
    lines.push(
      `| ${where} | ${f.kind}${f.soft ? ' (warn)' : ''} | ${f.declared ?? '—'} | ${f.actual ?? '—'} | ${f.detail.replace(/\|/g, '\\|')} |`,
    );
  }
  lines.push('');
  return lines;
}

async function writeStepSummary(markdown) {
  const p = process.env.GITHUB_STEP_SUMMARY;
  if (!p) return;
  await fs.promises.appendFile(p, `${markdown}\n`, 'utf8');
}

async function main() {
  const facts = collectFacts();
  const { findings: countFindings, checked } = scanDeclarations(facts);
  const consistency = checkInternalConsistency(facts);
  const { findings: dateFindings, note: dateNote } = checkUpdatedDate();

  const all = [...consistency, ...countFindings, ...dateFindings].sort(
    (a, b) => a.file.localeCompare(b.file) || a.line - b.line,
  );
  const hard = all.filter((f) => !f.soft);

  const out = [
    '# Claim Checks',
    '',
    `- 扫描声明文件：${DECLARATION_FILES.length}`,
    `- 命中数量声明：${checked}`,
    `- 漂移：${all.length}（硬失败 ${hard.length} / 仅告警 ${all.length - hard.length}）`,
    `- 开放声明（N+）允许落后：${OPEN_CLAIM_SLACK}`,
    ...(dateNote ? [`- ${dateNote}`] : []),
    '',
    ...factsTable(facts),
    ...findingsTable(all),
  ].join('\n');

  console.log(out);
  await writeStepSummary(out);

  if (hard.length > 0 && FAIL_ON_FINDINGS) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : error);
  process.exitCode = 1;
});
