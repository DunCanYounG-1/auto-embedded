#!/usr/bin/env node
/*
 * auto-embedded (aemb) CLI —— 全平台嵌入式 AI 开发 harness 脚手架（零运行时依赖，对标 Trellis 的 trellis 命令）。
 *
 *   aemb init   [工程] [-u 名] [--platforms a,b | --claude --cursor ... | --all] [--force]
 *   aemb update [工程]
 *   aemb status [工程]
 *   aemb doctor [工程]
 *   aemb check  [工程] [--arch|--hw|--spec|--json]
 *   aemb backup [工程]
 *   aemb uninstall [工程]
 *   aemb mem    <list|search|context|extract|projects> ...   跨会话记忆（本地索引 Claude/Codex 历史）
 *   aemb channel <create|send|spawn|wait|messages|kill|interrupt|list|rm> ...   多 agent 协作（supervisor+worker）
 */
import { ALL_TOOLS, RESERVED_TOOLS, resolveCliFlag, type AITool } from "../types/ai-tools";
import { implementedTools } from "../configurators/index";
import { resolveTarget } from "../commands/engine";
import { cmdInit } from "../commands/init";
import { cmdUpdate } from "../commands/update";
import { cmdUninstall } from "../commands/uninstall";
import { cmdUpgrade } from "../commands/upgrade";
import { cmdWorkflow } from "../commands/workflow";
import { cmdMem } from "../commands/mem";
import { dispatchChannel } from "../channel/index";
import { cmdBackup, cmdCheck, cmdDoctor, cmdStatus } from "../commands/misc";

const USAGE = `auto-embedded (aemb) —— 全平台嵌入式 AI 开发 harness 脚手架

用法:
  aemb init   [工程] [-u 名] [--platforms a,b,... | --<平台> ... | --all] [--force]
  aemb update [工程]
  aemb status [工程]
  aemb doctor [工程]
  aemb check  [工程] [--arch|--hw|--spec|--json]
  aemb backup [工程]
  aemb uninstall [工程]
  aemb upgrade [--tag latest|beta|rc] [--dry-run]
  aemb workflow [<id>] [--list] [--force|--create-new]
  aemb mem <list|search|context|extract|projects> [--global] [--since YYYY-MM-DD] [--grep KW] ...
  aemb channel <create|send|spawn|wait|messages|kill|interrupt|list|rm> ...

平台（已实现）: ${implementedTools().join(", ")}
平台（预留位，暂不可装）: ${RESERVED_TOOLS.join(", ")}
init 不指定平台时默认 claude。--all = 安装全部已实现平台。`;

function dedupe(xs: AITool[]): AITool[] {
  return [...new Set(xs)];
}

function main(argv: string[]): number | void {
  if (!argv.length) {
    console.log(USAGE);
    return 0;
  }
  const cmd = argv[0];
  const rest = argv.slice(1);

  // check：透传 --arch/--hw/... 给内核脚本，不当作平台 flag 解析
  if (cmd === "check") {
    let tgt: string | undefined;
    const extra: string[] = [];
    for (const a of rest) {
      if (!tgt && !a.startsWith("-")) tgt = a;
      else extra.push(a);
    }
    return cmdCheck(resolveTarget(tgt), extra);
  }

  // mem：自带子命令 + 自有 flag 语法（--grep/--since/--phase 等），整体透传，勿当平台 flag 解析。
  if (cmd === "mem") {
    return cmdMem(rest);
  }

  // channel：异步子命令组（spawn 起 detached supervisor / wait 长驻 tail）。在同步 main 之外自管 process.exit，
  // 否则底部的同步 process.exit(main()) 会在 Promise 完成前退出、杀掉异步工作。
  if (cmd === "channel") {
    dispatchChannel(rest)
      .then((c) => process.exit(c))
      .catch((e) => {
        // 普通 Error 只打干净的一行（多数 channel 错误已带 ✗ 前缀）；非 Error 异常才退化为 String。
        const msg = e instanceof Error ? e.message : String(e);
        process.stderr.write((/^✗/.test(msg) ? msg : "✗ " + msg) + "\n");
        process.exit(1);
      });
    return;
  }

  // upgrade：自带 --tag/--dry-run 子语法（且无 target），早分支，勿当平台 flag 解析。
  if (cmd === "upgrade") {
    let tag: string | undefined;
    let dryRun = false;
    for (let i = 0; i < rest.length; i++) {
      const a = rest[i];
      if (a === "--tag" || a === "-t") {
        const v = rest[i + 1];
        if (v === undefined || v.startsWith("-")) {
          process.stderr.write("✗ --tag 需要一个 dist-tag 或版本（如 beta / rc / 1.2.0-beta.3）\n");
          return 1;
        }
        tag = v;
        i++;
        continue;
      }
      if (a === "--dry-run" || a === "-n") {
        dryRun = true;
        continue;
      }
      process.stderr.write(`✗ upgrade 未知选项: ${a}\n`);
      return 1;
    }
    return cmdUpgrade({ tag, dryRun });
  }

  // workflow：自带 [<id>] [--list] [--force|--create-new] 子语法，早分支（--list/--create-new 不是平台 flag）。
  if (cmd === "workflow") {
    let id: string | undefined;
    let tgt: string | undefined;
    let list = false;
    let force = false;
    let createNew = false;
    for (const a of rest) {
      if (a === "--list" || a === "-l") {
        list = true;
        continue;
      }
      if (a === "--force" || a === "-f") {
        force = true;
        continue;
      }
      if (a === "--create-new") {
        createNew = true;
        continue;
      }
      if (a.startsWith("-")) {
        process.stderr.write(`✗ workflow 未知选项: ${a}\n`);
        return 1;
      }
      if (!id) id = a; // 第一个位置参数 = workflow id
      else tgt = a; // 第二个 = 工程目录（可选）
    }
    return cmdWorkflow(resolveTarget(tgt), { id, list, force, createNew });
  }

  let user: string | undefined;
  let force = false;
  const platforms: AITool[] = [];
  const positional: string[] = [];
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i];
    if (a === "-u" || a === "--user") {
      const v = rest[i + 1];
      if (v === undefined || v.startsWith("-")) {
        process.stderr.write("✗ -u/--user 需要一个开发者名\n");
        return 1;
      }
      user = v;
      i++;
      continue;
    }
    if (a === "--platforms") {
      const v = rest[i + 1];
      if (v === undefined || v.startsWith("-")) {
        process.stderr.write("✗ --platforms 需要逗号分隔的平台列表（如 claude,cursor）\n");
        return 1;
      }
      for (const f of v.split(",").map((s) => s.trim()).filter(Boolean)) {
        const id = resolveCliFlag(f);
        if (!id) {
          process.stderr.write(`✗ 未知平台: ${f}；可选: ${ALL_TOOLS.join(",")}\n`);
          return 1;
        }
        platforms.push(id);
      }
      i++;
      continue;
    }
    if (a === "--all") {
      platforms.push(...implementedTools());
      continue;
    }
    if (a === "--force" || a === "-f") {
      force = true;
      continue;
    }
    if (a === "-y" || a === "--yes") continue;
    if (a.startsWith("--")) {
      const id = resolveCliFlag(a.slice(2));
      if (id) {
        platforms.push(id);
        continue;
      }
      process.stderr.write(`✗ 未知选项: ${a}\n`);
      return 1;
    }
    positional.push(a);
  }

  const target = resolveTarget(positional[0]);
  switch (cmd) {
    case "init":
      return cmdInit(target, {
        platforms: platforms.length ? dedupe(platforms) : ["claude"],
        user,
        force,
      });
    case "update":
      return cmdUpdate(target);
    case "status":
      return cmdStatus(target);
    case "doctor":
      return cmdDoctor(target);
    case "backup":
      return cmdBackup(target);
    case "uninstall":
      return cmdUninstall(target);
    default:
      process.stderr.write(`未知命令: ${cmd}\n${USAGE}\n`);
      return 1;
  }
}

const code = main(process.argv.slice(2));
if (typeof code === "number") process.exit(code);
