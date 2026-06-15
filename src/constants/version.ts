/**
 * 包版本与包名（运行时从 package.json 读，单一事实源）。
 * auto-embedded 是 CommonJS（见 paths.ts 的 __dirname 用法），故用 PKG_ROOT 拼 package.json，
 * 不用 ESM 的 import.meta.url。
 */
import * as fs from "fs";
import * as path from "path";
import { PKG_ROOT } from "./paths";

interface PkgJson {
  version?: string;
  name?: string;
}

let pkg: PkgJson = {};
try {
  pkg = JSON.parse(fs.readFileSync(path.join(PKG_ROOT, "package.json"), "utf-8")) as PkgJson;
} catch {
  /* 读不到则回退默认 */
}

export const VERSION: string = pkg.version ?? "0.0.0";
export const PACKAGE_NAME: string = pkg.name ?? "auto-embedded";
