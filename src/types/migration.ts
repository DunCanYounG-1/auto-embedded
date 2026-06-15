/**
 * 运行时布局迁移项（对标 Trellis 的 MigrationItem，按整数版本号精简）。
 *
 * auto-embedded 的 .auto-embedded/.version 是单调递增整数（非 semver），故无需 compare-versions，
 * 整数比较即可。每次破坏性改动运行时布局（重命名/删除 managed 文件）时 bump RUNTIME_VERSION 并在
 * src/migrations/index.ts 的 MIGRATIONS 追加一条，update 会按版本升序、在 (installed, RUNTIME_VERSION] 区间重放。
 */
export interface MigrationItem {
  /** 该迁移随哪个 RUNTIME_VERSION 引入；仅 version ∈ (from, to] 的迁移会被重放。 */
  version: number;
  /** rename = 移动文件/目录；delete = 删除过时的 managed 文件。 */
  type: "rename" | "delete";
  /** 工程根内的 POSIX 相对路径（如 ".auto-embedded/old.md"）。越界路径会被安全闸拒绝。 */
  from: string;
  /** rename 的目标相对路径（type=rename 必填）。 */
  to?: string;
  /** 仅 delete：仅当现文件 sha256 ∈ hashes 才删（防误删用户改过的内容）；省略=无条件删除该过时文件。 */
  hashes?: string[];
  /** 人类可读说明（打印到 update 日志）。 */
  description?: string;
}
