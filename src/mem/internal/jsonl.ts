/**
 * 持久化会话适配器用的流式 JSONL / JSON 读取器（零依赖，verbatim 自 Trellis core/mem）。
 *
 * 分块同步流式读：256KB 窗口，跨块保留 leftover 拼接被切断的行——多 MB 会话文件下堆占用有界，
 * 且 onLine 返回 "stop" 可短路、避免读完整个文件。
 * 字节前缀快速拒绝：JSONL 事件行几乎总以 '{' 开头，首字节非 '{' 的行（空行/日志前导/半截写入）
 * 在付出 JSON.parse 代价前就被跳过。
 */

import * as fs from "fs";
import { StringDecoder } from "string_decoder";

const CHUNK = 256 * 1024;
const OPEN_BRACE = 0x7b; // '{'

/**
 * 逐行遍历 JSONL，对每个解析出的对象调用 onLine。坏 JSON 行跳过。
 * onLine 返回字面量 "stop" 则停止迭代。
 */
export function readJsonl<T>(file: string, onLine: (obj: T) => unknown): void {
  let fd: number;
  try {
    fd = fs.openSync(file, "r");
  } catch {
    return;
  }
  const buf = Buffer.alloc(CHUNK);
  const decoder = new StringDecoder("utf8"); // 跨 256KB 块边界缓存半截多字节序列，防 CJK/emoji 被切成 U+FFFD
  let leftover = "";
  try {
    let stop = false;
    while (!stop) {
      const n = fs.readSync(fd, buf, 0, CHUNK, null);
      if (n === 0) break;
      const chunk = leftover + decoder.write(buf.subarray(0, n));
      let from = 0;
      while (true) {
        const nl = chunk.indexOf("\n", from);
        if (nl === -1) {
          leftover = chunk.slice(from);
          break;
        }
        const line = chunk.slice(from, nl);
        from = nl + 1;
        if (!line) continue;
        if (line.charCodeAt(0) !== OPEN_BRACE) continue;
        let raw: unknown;
        try {
          raw = JSON.parse(line);
        } catch {
          continue;
        }
        if (onLine(raw as T) === "stop") {
          stop = true;
          break;
        }
      }
    }
    leftover += decoder.end(); // 冲掉解码器缓存的残留字节（文件末尾恰为被截断的多字节序列时）
    if (!stop && leftover) {
      // 文件无尾随换行——处理最后半截行。
      const line = leftover;
      if (line.charCodeAt(0) === OPEN_BRACE) {
        try {
          const raw: unknown = JSON.parse(line);
          onLine(raw as T);
        } catch {
          /* skip */
        }
      }
    }
  } finally {
    fs.closeSync(fd);
  }
}

/** 读第一个可解析的 JSONL 对象（读到一行即停）。 */
export function readJsonlFirst<T>(file: string): T | undefined {
  let result: T | undefined;
  readJsonl<T>(file, (obj) => {
    result = obj;
    return "stop";
  });
  return result;
}

/** 找首个满足 predicate 的 JSONL 对象，最多扫 maxLines 行。 */
export function findInJsonl<T>(
  file: string,
  predicate: (obj: T) => boolean,
  maxLines = 200,
): T | undefined {
  let count = 0;
  let hit: T | undefined;
  readJsonl<T>(file, (obj) => {
    count++;
    if (predicate(obj)) {
      hit = obj;
      return "stop";
    }
    if (count >= maxLines) return "stop";
  });
  return hit;
}

/** 读并 JSON.parse 整个文件；读/解析失败返回 undefined。调用方负责校验形状。 */
export function readJsonFile<T>(file: string): T | undefined {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8")) as T;
  } catch {
    return undefined;
  }
}
