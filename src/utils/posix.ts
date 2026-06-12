/** 把任意分隔符的路径归一成 POSIX（/），用于 manifest key / 跨平台匹配（Windows 反斜杠 → /）。 */
export function toPosix(p: string): string {
  return p.replace(/\\/g, "/");
}
