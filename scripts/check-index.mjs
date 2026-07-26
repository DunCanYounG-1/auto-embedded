#!/usr/bin/env node
/**
 * check-index —— refs/ 与 modes/ 索引双向校验。
 *
 * 交付形态是「AI 按需查表读取」，`index.md` 就是那张表，两个方向都会坏：
 *   · 漏登记（orphan）  —— 文件装进工程了，但索引里没有 → AI 永远不会打开它，等于没交付；
 *   · 悬空登记（dead）  —— 索引里有，磁盘上没了 → AI 拿着不存在的路径去读。
 * 领域包（refs/ 下的子目录）同理，必须在「领域包」段登记。
 *
 * 表格行是权威登记面，散文里的反引号文件名按「basename 在整棵树里能否找到」宽松判定
 * ——`refs/index.md` 描述 `stm32-hal/` 内容时会提到 `overview.md`，那是子目录里的真实文件，
 * 严格按顶层路径判会误报（这个坑踩过一次）。
 *
 * 环境变量：
 *   FAIL_ON_FINDINGS  默认 true —— orphan/dead/未登记领域包时 exit 1（散文悬空只告警）
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FAIL_ON_FINDINGS = (process.env.FAIL_ON_FINDINGS || 'true').toLowerCase() !== 'false';

const TARGETS = [
  { dir: 'templates/auto-embedded/refs', label: 'refs 知识库', packHeading: '## 领域包' },
  { dir: 'templates/auto-embedded/modes', label: 'modes 专项流程', packHeading: null },
];

/** 递归收集某目录下所有 .md 的 basename（判定散文引用是否真的不存在）。 */
function allBasenames(dir) {
  const out = new Set();
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith('.md')) out.add(e.name);
    }
  };
  walk(dir);
  return out;
}

/** 取「领域包」段正文（到下一个 `## ` 标题为止），避免把开头介绍里的 `xxx/` 当成登记。 */
function sectionBody(text, heading) {
  if (!heading) return '';
  const start = text.indexOf(heading);
  if (start === -1) return '';
  const after = text.slice(start + heading.length);
  const next = after.search(/^## /m);
  return next === -1 ? after : after.slice(0, next);
}

function parseIndex(text, packHeading) {
  // 权威登记面：表格行 | `x.md` | 说明 |
  const table = new Set([...text.matchAll(/^\|\s*`([^`]+\.md)`\s*\|/gm)].map((m) => m[1]));
  // 全文反引号里的 .md（含散文）
  const mentioned = new Set([...text.matchAll(/`([^`\s]+\.md)`/g)].map((m) => m[1]));
  // 领域包登记：仅「领域包」段里的 `xxx/`
  const packs = new Set([...sectionBody(text, packHeading).matchAll(/`([^`\s/]+)\/`/g)].map((m) => m[1]));
  return { table, mentioned, packs };
}

function checkTarget({ dir, label, packHeading }) {
  const full = path.join(REPO, dir);
  const indexPath = path.join(full, 'index.md');
  const findings = [];

  if (!fs.existsSync(indexPath)) {
    return { findings: [{ where: `${dir}/index.md`, kind: 'missing', detail: '索引文件不存在' }], stats: null };
  }

  const text = fs.readFileSync(indexPath, 'utf8');
  const { table, mentioned, packs } = parseIndex(text, packHeading);

  const entries = fs.readdirSync(full, { withFileTypes: true });
  const files = entries.filter((e) => e.isFile() && e.name.endsWith('.md') && e.name !== 'index.md').map((e) => e.name);
  const subdirs = entries.filter((e) => e.isDirectory()).map((e) => e.name);
  const basenames = allBasenames(full);

  // 方向一：磁盘有，索引无
  for (const f of files.filter((f) => !table.has(f)).sort()) {
    findings.push({ where: `${dir}/index.md`, kind: 'orphan', detail: `\`${f}\` 装进工程但索引未登记 → AI 查不到` });
  }

  // 方向二：索引有，磁盘无
  for (const f of [...table].filter((f) => !fs.existsSync(path.join(full, f))).sort()) {
    findings.push({ where: `${dir}/index.md`, kind: 'dead', detail: `登记了 \`${f}\` 但文件不存在` });
  }

  // 领域包（子目录）登记
  if (packHeading) {
    const hasHeading = text.includes(packHeading);
    if (!hasHeading && subdirs.length > 0) {
      findings.push({ where: `${dir}/index.md`, kind: 'dead', detail: `有子目录但缺「${packHeading}」段` });
    }
    for (const d of subdirs.filter((d) => !packs.has(d)).sort()) {
      findings.push({ where: `${dir}/index.md`, kind: 'orphan', detail: `领域包 \`${d}/\` 未在「${packHeading}」段登记` });
    }
  } else if (subdirs.length > 0) {
    findings.push({
      where: dir,
      kind: 'orphan',
      detail: `出现子目录 ${subdirs.map((d) => `\`${d}/\``).join(' ')}，但该索引无领域包段（需补登记规则）`,
    });
  }

  // 散文引用（宽松）：basename 在整棵树里都找不到才算悬空
  for (const m of [...mentioned].filter((f) => !table.has(f) && !basenames.has(path.basename(f))).sort()) {
    findings.push({
      where: `${dir}/index.md`,
      kind: 'prose-dead',
      soft: true,
      detail: `散文里提到 \`${m}\`，整棵 ${path.basename(dir)}/ 里找不到同名文件`,
    });
  }

  return {
    findings,
    stats: { label, dir, files: files.length, registered: table.size, subdirs: subdirs.length, packs: packs.size },
  };
}

function statsTable(rows) {
  return [
    '## 索引覆盖',
    '',
    '| 目录 | 顶层内容文件 | 表格登记 | 子目录 | 领域包登记 |',
    '|---|---|---|---|---|',
    ...rows.map((s) => `| \`${s.dir}\` | ${s.files} | ${s.registered} | ${s.subdirs} | ${s.packs} |`),
    '',
  ];
}

function findingsTable(findings) {
  const lines = ['## 索引漂移', ''];
  if (findings.length === 0) {
    lines.push('None found.', '');
    return lines;
  }
  lines.push('| 位置 | 类型 | 说明 |', '|---|---|---|');
  for (const f of findings) {
    lines.push(`| \`${f.where}\` | ${f.kind}${f.soft ? ' (warn)' : ''} | ${f.detail.replace(/\|/g, '\\|')} |`);
  }
  lines.push('');
  return lines;
}

async function main() {
  const results = TARGETS.map(checkTarget);
  const findings = results.flatMap((r) => r.findings);
  const stats = results.map((r) => r.stats).filter(Boolean);
  const hard = findings.filter((f) => !f.soft);

  const out = [
    '# Index Checks',
    '',
    `- 校验索引：${TARGETS.length}`,
    `- 漂移：${findings.length}（硬失败 ${hard.length} / 仅告警 ${findings.length - hard.length}）`,
    '',
    ...statsTable(stats),
    ...findingsTable(findings),
  ].join('\n');

  console.log(out);
  const summary = process.env.GITHUB_STEP_SUMMARY;
  if (summary) await fs.promises.appendFile(summary, `${out}\n`, 'utf8');

  if (hard.length > 0 && FAIL_ON_FINDINGS) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : error);
  process.exitCode = 1;
});
