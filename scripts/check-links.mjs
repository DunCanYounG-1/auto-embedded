#!/usr/bin/env node
/**
 * check-links —— 交付内容里的外链腐化审计（月度 cron）。
 *
 * 为什么这个比一般的 link checker 重要：`templates/` 里的链接不是装饰，是**选型推荐**
 * （SOTA 姿态解算实现、逐飞开源库、FOC 参考工程……）。仓库被归档或删了，AI 还会用
 * 「查表干活」的姿态把死代码推给正在做电赛的人——比自己瞎编更可信、危害更大。
 *
 * 分级严重度（照 awesome-LangGraph/repo-checks.mjs 的思路，按可信度分层）：
 *   gone     404/删除/改名      → 硬失败，必须改
 *   archived 上游明确归档       → 硬失败，必须换或标注
 *   stale    长期没 push        → 默认只告警（嵌入式库长期稳定不动是常态，硬失败会变噪音）
 *   unknown  限流/网络/被挡     → 只告警，永不失败（审计要能长期活着，不能一红就被 disable）
 *
 * 环境变量：
 *   GITHUB_TOKEN / GH_TOKEN  强烈建议给（匿名 60 次/小时，本仓 60+ 个 GitHub 链接必被限流）
 *   MAX_AGE_MONTHS   默认 24 —— 超过多久没 push 算 stale
 *   FAIL_ON_FINDINGS 默认 true  —— gone/archived 时 exit 1
 *   FAIL_ON_STALE    默认 false —— stale 是否也算硬失败
 *   CHECK_HTTP       默认 false —— 是否对非 GitHub/Gitee 的普通 URL 做存活探测（只报告，不失败）
 *   SCAN_DIR         默认 templates —— 扫描根（缩小范围可用于本地冒烟测试）
 *   CONCURRENCY      默认 4
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SCAN_DIR = process.env.SCAN_DIR || 'templates';
const MAX_AGE_MONTHS = Number.parseInt(process.env.MAX_AGE_MONTHS || '24', 10);
const FAIL_ON_FINDINGS = (process.env.FAIL_ON_FINDINGS || 'true').toLowerCase() !== 'false';
const FAIL_ON_STALE = (process.env.FAIL_ON_STALE || 'false').toLowerCase() === 'true';
const CHECK_HTTP = (process.env.CHECK_HTTP || 'false').toLowerCase() === 'true';
const CONCURRENCY = Math.max(1, Number.parseInt(process.env.CONCURRENCY || '4', 10));
const TOKEN = process.env.GITHUB_TOKEN || process.env.GH_TOKEN || '';

const TEXT_EXT = new Set([
  '.md', '.py', '.js', '.mjs', '.json', '.yaml', '.yml', '.toml',
  '.c', '.h', '.ps1', '.cmd', '.sh', '.txt',
]);

/** github.com 下这些首段不是仓库 */
const GH_RESERVED = new Set([
  'orgs', 'topics', 'features', 'marketplace', 'search', 'settings', 'apps', 'sponsors',
  'about', 'blog', 'login', 'notifications', 'explore', 'collections', 'pricing', 'security',
  'site', 'contact', 'readme', 'customer-stories', 'enterprise', 'trending', 'new', 'account',
]);

/** gitee.com 下这些首段不是仓库（`gitee.com/api/v5/...` 这种 API 端点会被误判成 api/v5 仓库） */
const GITEE_RESERVED = new Set([
  'api', 'explore', 'organizations', 'orgs', 'enterprises', 'help', 'login', 'notice',
  'oschina', 'search', 'projects', 'settings', 'gitee', 'events', 'trending',
]);

// ---------------------------------------------------------------- 采集

function walkTextFiles(dir) {
  const out = [];
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (TEXT_EXT.has(path.extname(e.name).toLowerCase())) out.push(p);
    }
  };
  walk(dir);
  return out;
}

/** URL → 引用它的文件集合 */
function collectUrls(root) {
  const urls = new Map();
  for (const file of walkTextFiles(root)) {
    const text = fs.readFileSync(file, 'utf8');
    for (const m of text.matchAll(/https?:\/\/[^\s)>\]"'`]+/g)) {
      // 去掉句末标点（中英文）
      const url = m[0].replace(/[.,;:!?。，、；：！？】）]+$/u, '');
      const cite = path.relative(REPO, file).split(path.sep).join('/');
      if (!urls.has(url)) urls.set(url, new Set());
      urls.get(url).add(cite);
    }
  }
  return urls;
}

/**
 * 占位符 URL 不是链接，是模板：`git clone https://gitee.com/seekfree/<仓库名>.git`。
 * 不排掉会被当成 404 死链（踩过）。
 */
function isPlaceholder(url) {
  return /[<>{}$]|%s|\.\.\./.test(url);
}

/** 认出仓库形态：{ host: 'github'|'gitee', slug } 或 null */
function asRepo(url) {
  const m = url.match(/^https?:\/\/(?:www\.)?(github|gitee)\.com\/([^/\s?#]+)\/([^/\s?#]+)/i);
  if (!m) return null;
  const [, host, owner, rawRepo] = m;
  const reserved = host.toLowerCase() === 'github' ? GH_RESERVED : GITEE_RESERVED;
  if (reserved.has(owner.toLowerCase())) return null;
  const repo = rawRepo.replace(/\.git$/i, '');
  return { host: host.toLowerCase(), slug: `${owner}/${repo}` };
}

// ---------------------------------------------------------------- 探测

let rateLimited = false;

/**
 * Gitee 对匿名 API 卡得很死，并发一冲就整片 403 —— 结果全落 unknown，审计等于白跑。
 * 按 host 串行 + 最小间隔，403 再退避重试一次；GitHub 有 token，不需要这层。
 */
const GITEE_MIN_INTERVAL_MS = Number.parseInt(process.env.GITEE_MIN_INTERVAL_MS || '700', 10);
const hostQueue = new Map();

function throttle(host, fn) {
  const prev = hostQueue.get(host) || Promise.resolve();
  const next = prev.then(async () => {
    const r = await fn();
    await new Promise((res) => setTimeout(res, GITEE_MIN_INTERVAL_MS));
    return r;
  });
  // 让队列只串行、不因为某次失败而断链
  hostQueue.set(host, next.then(() => {}, () => {}));
  return next;
}

async function fetchJson(url, headers) {
  const res = await fetch(url, { headers, redirect: 'follow' });
  if (res.status === 404) return { status: 404 };
  if (res.status === 403 || res.status === 429) {
    if (res.headers.get('x-ratelimit-remaining') === '0') rateLimited = true;
    return { status: res.status };
  }
  if (!res.ok) return { status: res.status };
  return { status: 200, body: await res.json() };
}

function monthsAgo(months) {
  const d = new Date();
  d.setUTCMonth(d.getUTCMonth() - months);
  return d;
}

async function probeRepo({ host, slug }, url) {
  const api =
    host === 'github'
      ? `https://api.github.com/repos/${slug}`
      : `https://gitee.com/api/v5/repos/${slug}`;
  const headers = {
    'User-Agent': 'auto-embedded-link-checks',
    Accept: host === 'github' ? 'application/vnd.github+json' : 'application/json',
    ...(host === 'github' && TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {}),
  };

  const call = () => fetchJson(api, headers);
  let r;
  try {
    r = host === 'gitee' ? await throttle('gitee', call) : await call();
    if (host === 'gitee' && r.status === 403) {
      // 被卡了，退避一次再试；还不行就落 unknown（绝不误判成死链）
      await new Promise((res) => setTimeout(res, 3000));
      r = await throttle('gitee', call);
    }
  } catch (e) {
    return { state: 'unknown', note: `请求失败：${e instanceof Error ? e.message : e}` };
  }

  if (r.status === 404) {
    // GitHub（带 token）的 404 是权威的；Gitee 会对匿名/爬虫返回 404 或 403，
    // 必须回网页确认一次再判死，否则 gone 这个硬失败会被误报冲垮。
    if (host === 'github') return { state: 'gone', note: '404（删除 / 改名 / 转私有）' };
    const web = await probeHttp(url);
    if (web.state === 'gone') return { state: 'gone', note: 'API + 网页双 404（删除 / 改名 / 转私有）' };
    return { state: 'unknown', note: `Gitee API 404 但网页 ${web.note || web.state} —— 无法判定，请人工看` };
  }
  if (r.status !== 200) return { state: 'unknown', note: `HTTP ${r.status}${rateLimited ? '（限流）' : ''}` };

  const body = r.body || {};
  if (body.archived === true) return { state: 'archived', note: '上游已归档（只读）', pushedAt: body.pushed_at };

  const pushed = body.pushed_at || body.updated_at || null;
  if (!pushed) return { state: 'unknown', note: 'API 未返回 push 时间', pushedAt: null };
  if (new Date(pushed) < monthsAgo(MAX_AGE_MONTHS)) {
    return { state: 'stale', note: `超过 ${MAX_AGE_MONTHS} 个月没 push`, pushedAt: pushed };
  }
  return { state: 'ok', pushedAt: pushed };
}

async function probeHttp(url) {
  try {
    let res = await fetch(url, { method: 'HEAD', redirect: 'follow', headers: { 'User-Agent': 'auto-embedded-link-checks' } });
    if (res.status === 405 || res.status === 501) {
      res = await fetch(url, { method: 'GET', redirect: 'follow', headers: { 'User-Agent': 'auto-embedded-link-checks' } });
    }
    if (res.status === 404 || res.status === 410) return { state: 'gone', note: `HTTP ${res.status}` };
    if (!res.ok) return { state: 'unknown', note: `HTTP ${res.status}（站点可能挡爬）` };
    return { state: 'ok' };
  } catch (e) {
    return { state: 'unknown', note: `请求失败：${e instanceof Error ? e.message : e}` };
  }
}

/** 简易并发池 */
async function mapPool(items, limit, fn) {
  const out = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (true) {
        const i = next++;
        if (i >= items.length) return;
        out[i] = await fn(items[i], i);
      }
    }),
  );
  return out;
}

// ---------------------------------------------------------------- 报告

function table(title, rows) {
  const lines = [`## ${title}`, ''];
  if (rows.length === 0) {
    lines.push('None found.', '');
    return lines;
  }
  lines.push('| 链接 | 最后 push | 说明 | 被引用于 |', '|---|---|---|---|');
  for (const r of rows) {
    const last = r.pushedAt ? String(r.pushedAt).slice(0, 10) : '—';
    const cites = [...r.cites].sort().slice(0, 3).join('<br>') + (r.cites.size > 3 ? `<br>…共 ${r.cites.size} 处` : '');
    lines.push(`| ${r.url} | ${last} | ${r.note || ''} | ${cites} |`);
  }
  lines.push('');
  return lines;
}

async function main() {
  const root = path.join(REPO, SCAN_DIR);
  if (!fs.existsSync(root)) throw new Error(`扫描根不存在：${SCAN_DIR}`);

  const urls = collectUrls(root);
  const all0 = [...urls.entries()].map(([url, cites]) => ({ url, cites, repo: asRepo(url) }));
  const placeholders = all0.filter((t) => isPlaceholder(t.url)).map((t) => ({ ...t, state: 'placeholder' }));
  const targets = all0.filter((t) => !isPlaceholder(t.url));
  const repoTargets = targets.filter((t) => t.repo);
  const plainTargets = targets.filter((t) => !t.repo);

  if (!TOKEN) {
    console.warn('⚠️  未设置 GITHUB_TOKEN：匿名 60 次/小时，大概率被限流（结果会落到 unknown，不会误判为死链）');
  }

  const results = await mapPool(repoTargets, CONCURRENCY, async (t) => ({ ...t, ...(await probeRepo(t.repo, t.url)) }));

  let plainResults = plainTargets.map((t) => ({ ...t, state: 'skipped' }));
  if (CHECK_HTTP) {
    plainResults = await mapPool(plainTargets, CONCURRENCY, async (t) => ({ ...t, ...(await probeHttp(t.url)) }));
  }

  const all = [...results, ...plainResults, ...placeholders];
  const by = (s) => all.filter((r) => r.state === s).sort((a, b) => a.url.localeCompare(b.url));

  const gone = by('gone');
  const archived = by('archived');
  const stale = by('stale');
  const unknown = by('unknown');

  const hardCount = gone.length + archived.length + (FAIL_ON_STALE ? stale.length : 0);

  // 某个站点整片 unknown → 是被挡了，不是链接都好；必须说出来，否则 "gone 0" 会被误读成全绿
  const blocked = [...unknown.reduce((m, r) => {
    const h = new URL(r.url).host;
    m.set(h, (m.get(h) || 0) + 1);
    return m;
  }, new Map())].filter(([, n]) => n >= 3);

  const out = [
    '# Link Rot Checks',
    '',
    `- 扫描根：\`${SCAN_DIR}\`（唯一外链 ${all0.length}，其中占位符模板 ${placeholders.length} 个不探测）`,
    `- 仓库形态链接（GitHub/Gitee）：${repoTargets.length}`,
    `- 普通 URL：${plainTargets.length}${CHECK_HTTP ? '（已探测，仅报告）' : '（未探测，CHECK_HTTP=true 打开）'}`,
    `- stale 判定线：${MAX_AGE_MONTHS} 个月（${monthsAgo(MAX_AGE_MONTHS).toISOString().slice(0, 10)} 之前）`,
    `- 结果：gone ${gone.length} / archived ${archived.length} / stale ${stale.length} / unknown ${unknown.length} / ok ${by('ok').length}`,
    ...(rateLimited ? ['- ⚠️ 触发了 GitHub API 限流，部分结果为 unknown —— 请提供 GITHUB_TOKEN 后重跑'] : []),
    ...blocked.map(
      ([host, n]) =>
        `- ⚠️ \`${host}\` 有 ${n} 条无法判定（大概率整片被挡/限流）—— **本次对该站点的审计结果不可信**，` +
        `调大 GITEE_MIN_INTERVAL_MS 或隔一段时间重跑`,
    ),
    '',
    ...table('死链（gone）—— 必须改', gone),
    ...table('已归档（archived）—— 必须换或标注', archived),
    ...table(`停更（stale，>${MAX_AGE_MONTHS} 个月）${FAIL_ON_STALE ? '' : '—— 仅告警'}`, stale),
    ...table('无法判定（unknown）—— 仅告警', unknown),
  ].join('\n');

  console.log(out);
  const summary = process.env.GITHUB_STEP_SUMMARY;
  if (summary) await fs.promises.appendFile(summary, `${out}\n`, 'utf8');

  if (hardCount > 0 && FAIL_ON_FINDINGS) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : error);
  process.exitCode = 1;
});
