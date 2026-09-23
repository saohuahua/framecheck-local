import type { VueExportFactsInput } from './types'

/**
 * Vue 导出与目标项目之间的端口定义。
 *
 * 生成器本体是纯函数（不碰文件系统）；写入目标项目需要桌面端原生能力，
 * 通过这里定义的端口注入：
 * - 桌面端：TauriVueExportWriter / TauriVueExportTargetChooser（desktop-bridge 提供）
 * - 测试：内存实现的假端口
 * - 浏览器端：不注入（功能置灰，与转换页同模式）
 */

/** 目标项目根目录选择器（桌面端为系统目录选择框） */
export interface VueExportTargetChooser {
  chooseProjectRoot(): Promise<string | undefined>
}

/** 待写入目标项目的文件：text / base64 / appendText 三选一 */
export interface VueExportWriteFile {
  /** 目标项目内的相对路径（POSIX 风格，拒绝绝对路径与 ..） */
  path: string
  /** 新建文本文件内容（目标必须不存在） */
  text?: string
  /** 新建二进制文件内容，base64 编码（目标必须不存在） */
  base64?: string
  /**
   * 追加到既有文件末尾的内容（路由补丁场景）：
   * 不改动既有内容的任何字节，文件不存在时按新建处理。
   */
  appendText?: string
}

/**
 * 目标项目写入端口。
 *
 * 安全约定（与产品决策一致）：只新增文件、绝不覆盖已有文件；
 * writeFiles 在写入前整体校验冲突，任一路径已存在则整体失败、不落任何文件。
 */
export interface VueExportProjectWriter {
  /** 读取项目内文本文件（相对路径）；文件不存在返回 null */
  readTextFile(projectRoot: string, path: string): Promise<string | null>
  /** 返回 paths 中已经存在的条目（用于写入前的冲突清单） */
  filterExisting(projectRoot: string, paths: string[]): Promise<string[]>
  /** 写入文件（自动创建所需目录）；见上方安全约定 */
  writeFiles(projectRoot: string, files: VueExportWriteFile[]): Promise<void>
}

/** 当前 Bundle 的设计事实与切图字节访问（由宿主注入，避免对话框直接耦合存储层） */
export interface VueExportBundleAccess {
  /** 加载已打开 Bundle 的 design.json + assets.json 校验产物 */
  loadFacts(): Promise<VueExportFactsInput>
  /** 读取 bundle 内切图字节（sourcePath 如 assets/xxx.png）；不可用时返回 undefined */
  readAssetBytes(sourcePath: string): Promise<Uint8Array | undefined>
}

/** 桌面端 Vue 导出能力的组合：写入端口 + 目录选择器；浏览器端为 undefined */
export interface VueExportPort {
  writer: VueExportProjectWriter
  chooser: VueExportTargetChooser
}
