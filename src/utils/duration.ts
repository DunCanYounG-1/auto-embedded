/**
 * 解析时长字符串 Ns/Nm/Nh/Nms（也接受纯数字=秒）。返回毫秒；非法返回 undefined。
 * 用于 channel wait 的 --timeout 与 spawn 超时。
 */
export function parseDuration(v: string | undefined): number | undefined {
  if (v === undefined) return undefined;
  const s = v.trim().toLowerCase();
  const m = s.match(/^(\d+(?:\.\d+)?)(ms|s|m|h)?$/);
  if (!m) return undefined;
  const n = parseFloat(m[1]);
  switch (m[2]) {
    case "ms":
      return Math.round(n);
    case "m":
      return Math.round(n * 60_000);
    case "h":
      return Math.round(n * 3_600_000);
    case "s":
    case undefined:
    default:
      return Math.round(n * 1000);
  }
}
