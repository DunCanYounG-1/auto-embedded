/**
 * 跨平台终止进程（及其子树）。
 *
 * Windows 上 worker 经 `cmd.exe /d /s /c claude.cmd …` 包裹启动，真正的 claude 是 cmd.exe 的孙进程；
 * process.kill/child.kill 映射到 TerminateProcess，只杀单个 PID（cmd.exe），claude 会变孤儿。
 * 故 win32 一律用 `taskkill /PID <pid> /T /F`（/T 杀整棵树，连孙进程一起），POSIX 用 process.kill(pid, signal)。
 * pid 为 0/缺失或已死则静默。
 */
import { spawnSync } from "child_process";

export function killTree(pid: number | undefined, signal: NodeJS.Signals = "SIGTERM"): void {
  if (!pid) return;
  if (process.platform === "win32") {
    try {
      spawnSync("taskkill", ["/PID", String(pid), "/T", "/F"], { stdio: "ignore", windowsHide: true });
    } catch {
      /* 已退出 */
    }
  } else {
    try {
      process.kill(pid, signal);
    } catch {
      /* 已退出 */
    }
  }
}
