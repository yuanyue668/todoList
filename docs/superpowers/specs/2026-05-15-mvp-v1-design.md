# Edge Todos — MVP v1.0 设计规范

**日期**: 2026-05-15  
**版本**: v1.0  
**目标**: 将现有 demo 转化为可在 Windows 和 macOS 双平台发布的桌面应用

---

## 1. 产品范围

### 1.1 已有功能（demo 现状，保持不变）

| 模块 | 功能 |
|------|------|
| 页签管理 | 新建、关闭、重命名、着色、拖拽排序、批量删除、页签管理面板 |
| 待办管理 | 按优先级分组、增删改、完成切换、跨组拖拽排序、Markdown emoji 渲染 |
| 图片附件 | 粘贴/文件选择、缩略图条（最多3个+N）、大图预览/翻页/删除 |
| 模板 | 两套内置模板、自定义模板、优先级增删改排序 |
| 数据 | JSON 全量/单页导出导入、localStorage 持久化（schema v2）|
| 桌面集成 | 无边框窗口、始终置顶、贴边检测、手动贴边隐藏、悬浮唤出 |

### 1.2 MVP v1.0 新增功能（本规范范围）

| ID | 功能 | 类别 | 复杂度 |
|----|------|------|--------|
| F0 | 鼠标离开自动隐藏 | 体验打磨 | 低 |
| F1 | 拖拽插入位置指示线 | 体验打磨 | 低 |
| F2 | 分组折叠/展开 | 体验打磨 | 低 |
| F3 | 键盘快捷键（创建待办） | 体验打磨 | 中 |
| F4 | 系统托盘图标 | 桌面必备 | 高 |
| F5 | 窗口位置/尺寸记忆 | 桌面必备 | 中 |
| F6 | Tauri 文件对话框（导入/导出） | 桌面必备 | 低 |
| F7 | 关于对话框 | 桌面必备 | 低 |
| F8 | 应用图标 + 品牌资源 | 发布工程 | 低 |
| F9 | GitHub Actions 双平台 CI | 发布工程 | 高 |

### 1.3 推迟到 v1.x

图片迁移至 IndexedDB/文件系统、深色模式、待办截止日期/提醒、搜索/筛选、开机自启动、自动更新。

---

## 2. 工作流程

采用**方案 B — 以功能为单位的完整角色链**。每个功能按以下顺序执行：

```
产品（需求 + 验收标准）
  → 架构（技术方案 + 接口定义）
    → 前端（交互设计 + 视觉细节）
      → 开发（编码实现）
        → 测试（功能验证 + 边界测试）
          → 完成，进入下一功能
```

功能执行顺序：F0 → F1 → F2 → F3 → F4 → F5 → F6 → F7 → F8 → F9

---

## 3. 系统架构

### 3.1 技术栈

- **前端**: React 18 + TypeScript + Vite 8
- **桌面壳**: Tauri v2
- **持久化**: localStorage（现有）+ Tauri 插件（新增）

### 3.2 三层结构

```
┌─────────────────────────────────────────┐
│  前端层 (React + TypeScript)             │
│  src/App.tsx · styles.css · types.ts    │
│  F0 F1 F2 F3 F7                         │
├─────────────────────────────────────────┤
│  Tauri 前端 API 层 (JS ↔ IPC)           │
│  @tauri-apps/api · plugin-dialog        │
│  plugin-fs · src/tauriWindow.ts         │
│  F4(事件接收) F5 F6                      │
├─────────────────────────────────────────┤
│  Rust 层 (Tauri 核心)                    │
│  src-tauri/src/main.rs · Cargo.toml    │
│  tauri.conf.json                        │
│  F4(托盘注册) F8 F9                      │
└─────────────────────────────────────────┘
```

---

## 4. 功能详细设计

### F0 — 鼠标离开自动隐藏

**产品需求**: 窗口贴边时，鼠标离开窗口 1.5 秒后自动隐藏到屏幕边缘外；鼠标重新进入时立即唤出。

**验收标准**:
- 窗口未贴边时，鼠标离开无任何响应
- 窗口已贴边（`windowPrefs.edge !== null`）且在 Tauri 环境中，鼠标离开 1.5s 后自动隐藏
- 1.5s 内鼠标重新进入，取消隐藏计时器，窗口不隐藏
- 隐藏后鼠标进入 8px 条带区域，立即唤出（现有逻辑保持不变）

**架构设计**:
- 改动文件：`src/App.tsx` 唯一
- 在 `<main>` 上增加 `onMouseLeave` 处理函数
- 新增常量 `AUTO_HIDE_DELAY_MS = 1500`
- 使用 `useRef<number>` 存储计时器 id，在 `onMouseLeave` 时启动，在 `onMouseEnter` 时清除
- 调用现有 `handleHide()`，无需新增函数
- 仅当 `hasTauriWindow && state.windowPrefs.edge !== null` 时激活

**前端交互细节**: 无 UI 变化，纯行为逻辑。

---

### F1 — 拖拽插入位置指示线

**产品需求**: 拖拽待办时，在目标插入位置显示蓝色横线，让用户明确知道松手后 todo 会落在哪里。

**验收标准**:
- 拖拽进行中，hovering 的目标 todo 上方出现蓝色 2px 横线
- 拖拽到分组空白区域时，指示线出现在最后一个 todo 下方
- 松手或取消拖拽后，指示线立即消失
- 拖拽跨分组时，指示线跟随鼠标所在分组正确显示

**架构设计**:
- 改动文件：`src/App.tsx`、`src/styles.css`
- App 层新增 `dragOverTodoId: string | null` 和 `dragOverGroupId: string | null` state
- 在 todo 的 `onDragOver` 中更新 `dragOverTodoId`；在 group 的 `onDragOver` 中更新 `dragOverGroupId`
- `onDrop` / `onDragEnd` 时两个 state 均置 null
- CSS：`.todo-item.is-drop-target::before` 伪元素，绝对定位，高度 2px，颜色 `#3b82f6`，宽度 100%，top: -1px
- `is-drop-target` class 由 `dragOverTodoId === todo.id` 控制

**前端交互细节**: 指示线颜色与 primary-button 保持一致（`#3b82f6`）。

---

### F2 — 分组折叠/展开

**产品需求**: 每个优先级分组可以折叠，折叠后只显示标题行和计数，隐藏所有待办。

**验收标准**:
- 分组标题行右侧有折叠/展开图标按钮（ChevronDown / ChevronUp）
- 折叠状态下，group-items 和 composer 不可见，计数徽章仍然显示
- 各分组折叠状态独立，互不影响
- 折叠状态不持久化（刷新/重启后恢复展开）
- 拖拽进入已折叠的分组时，分组自动展开

**架构设计**:
- 改动文件：`src/App.tsx`、`src/styles.css`
- `PriorityGroup` 组件内部新增 `const [collapsed, setCollapsed] = useState(false)`
- 标题行加 `<button onClick={() => setCollapsed(c => !c)}>`，图标用 `ChevronDown`/`ChevronUp`（已引入）
- `group-items` 和 `composer` 在 `collapsed` 为 true 时设 `display: none`
- 折叠分组接受 drop 时（`onDrop` on group）先调用 `setCollapsed(false)` 再执行 `onMoveToGroupEnd`

---

### F3 — 键盘快捷键（创建待办）

**产品需求**: 键盘用户可以快速在指定优先级分组打开输入框，不需要鼠标点击。

**验收标准**:
- `Ctrl+Enter`（Windows）/ `⌘+Enter`（macOS）：在第一个优先级分组打开 composer
- `Ctrl+1` ~ `Ctrl+4`（对应当前模板的第1至第N个分组）打开对应分组 composer
- 当任意 `<input>` 或 `<textarea>` 处于聚焦状态时，快捷键不触发
- 快捷键触发时，自动滚动到目标分组并聚焦输入框

**架构设计**:
- 改动文件：`src/App.tsx`
- App 层 `useEffect` 注册全局 `keydown` 监听器，组件卸载时移除
- 通过 `document.activeElement` 判断当前聚焦元素，若为 input/textarea/[contenteditable] 则跳过
- `PriorityGroup` 通过 `useImperativeHandle` 或将 `openComposer` 通过 ref 暴露给父组件
- App 维护 `priorityGroupRefs: Map<string, { openComposer: () => void }>`
- 平台检测：`navigator.userAgent.includes('Mac')` 区分 Ctrl/⌘（`navigator.platform` 已 deprecated）

---

### F4 — 系统托盘图标

**产品需求**: 应用在系统托盘显示图标，右键菜单提供"显示窗口"和"退出"两个选项。最小化或关闭主窗口后可通过托盘图标唤出。

**验收标准**:
- 应用启动后托盘区域出现 Edge Todos 图标
- 左键单击托盘图标：切换窗口显示/隐藏
- 右键菜单：显示窗口 / 退出应用
- 点击"退出"彻底退出进程（不仅仅关闭窗口）
- 关闭主窗口（点击系统关闭按钮）时，应用不退出，继续在托盘运行
- Windows 和 macOS 均需通过验证

**架构设计**:

*Rust 层*:
- `Cargo.toml` 添加 `tauri-plugin-tray`
- `main.rs` 在 `tauri::Builder` 中注册 `.plugin(tauri_plugin_tray::init())`
- 使用 `TrayIconBuilder` 创建托盘，注册 `on_tray_icon_event` 和 `on_menu_event`
- 菜单项：`show`（显示窗口）、`quit`（退出）
- `on_close_requested` 事件中阻止默认行为，改为隐藏窗口

*前端层*:
- `tauriWindow.ts` 新增 `listenTrayEvent()` 函数，监听来自 Rust 的 tray 事件
- App 初始化时调用，处理 show/hide 窗口操作

*配置*:
- `tauri.conf.json` 添加 `trayIcon` 配置，指向 `icons/tray-icon.png`（32×32）

---

### F5 — 窗口位置/尺寸记忆

**产品需求**: 重启应用后，窗口恢复到上次关闭时的位置和大小。

**验收标准**:
- 移动或缩放窗口后关闭，重启时窗口出现在相同位置和尺寸
- 窗口位置在屏幕可见范围内（不会恢复到屏幕外）
- Windows 和 macOS 均通过验证

**架构设计**:
- 采用 `tauri-plugin-window-state`（官方插件，最小改动方案）
- `Cargo.toml` 添加依赖，`main.rs` 注册 `.plugin(tauri_plugin_window_state::Builder::default().build())`
- `tauri.conf.json` 无需改动
- 前端无需改动
- 插件自动将窗口状态持久化到 Tauri 的 appData 目录

---

### F6 — Tauri 文件对话框（导入/导出）

**产品需求**: 在桌面应用中，导出/导入使用原生文件对话框，而不是浏览器下载/上传机制。

**验收标准**:
- 点击"导出全部"/"导出当前页"：弹出原生"另存为"对话框，默认文件名与现有逻辑一致
- 点击"导入"：弹出原生"打开文件"对话框，过滤 `.json`
- 非 Tauri 环境（浏览器预览）保留原有浏览器 File API 行为
- 导入文件内容处理逻辑不变（仍通过 `normalizeState` 验证）

**架构设计**:
- 安装 `@tauri-apps/plugin-dialog`、`@tauri-apps/plugin-fs`
- `tauriWindow.ts` 中导出现有 `isTauri` 常量（当前仅在模块内使用，未导出）
- `src/App.tsx` 中 `exportState()` 函数：检测 `isTauri`，是则调用 `save()` dialog + `writeTextFile()`，否则走现有 Blob/URL 路径
- `importState()` 函数：检测 `isTauri`，是则调用 `open()` dialog + `readTextFile()`，否则走现有 FileReader 路径
- `tauri.conf.json` capabilities 中添加 `dialog` 和 `fs` 权限

---

### F7 — 关于对话框

**产品需求**: 用户可以查看应用版本号、开源许可证和项目链接。

**验收标准**:
- 顶栏 actions 区域有"关于"图标按钮（`Info` 图标）
- 点击弹出模态对话框，显示：应用名称、版本号、简短描述、MIT 许可证说明、GitHub 仓库链接
- 版本号与 `package.json` / `tauri.conf.json` 中的 version 字段一致
- 点击对话框外部或关闭按钮可关闭

**架构设计**:
- 改动文件：`src/App.tsx`、`src/styles.css`
- 新增 `AboutDialog` 组件，复用现有 `confirm-backdrop` / `confirm-dialog` 样式
- 版本号通过 Vite 的 `import.meta.env.VITE_APP_VERSION` 注入（在 `vite.config.ts` 中配置 `define: { 'import.meta.env.VITE_APP_VERSION': JSON.stringify(pkg.version) }`）
- App state 新增 `aboutOpen: boolean`

---

### F8 — 应用图标 + 品牌资源

**产品需求**: 应用在各平台有专属图标，体现"边缘待办"的产品定位。

**验收标准**:
- Windows：任务栏、窗口标题栏、托盘均显示正确图标（.ico）
- macOS：Dock 栏、菜单栏显示正确图标（.icns）
- 图标设计简洁，在 16×16 至 512×512 各尺寸下均清晰可辨
- `index.html` favicon 更新

**架构设计**:
- 设计主图标 SVG（源文件保存到 `src-tauri/icons/icon.svg`）
- 导出尺寸：32×32、128×128、256×256、512×512 PNG
- Windows：生成 `icon.ico`（含多尺寸）
- macOS：生成 `icon.icns`
- 更新 `tauri.conf.json` 的 `bundle.icon` 数组
- 更新 `index.html` `<link rel="icon">`

---

### F9 — GitHub Actions 双平台 CI

**产品需求**: 推送版本 tag 时，自动在 Windows 和 macOS 上构建安装包并上传到 GitHub Release。

**验收标准**:
- 推送 `v*` 格式 tag 后，Actions 自动触发
- Windows 构建输出 `.msi` 安装包
- macOS 构建输出 `.dmg` 安装包
- 构建产物自动附加到对应 GitHub Release
- 构建失败时有清晰的错误信息

**架构设计**:

文件：`.github/workflows/release.yml`（以下为结构说明，实际实现时由开发角色展开完整 YAML）

```
触发条件：push tag v*
job.build matrix: [windows-latest, macos-latest]
步骤顺序：
  1. actions/checkout
  2. actions/setup-node (v22)
  3. dtolnay/rust-toolchain (stable)
  4. npm ci
  5. tauri-apps/tauri-action@v0  ← 官方 Action，内含 build + upload
  6. softprops/action-gh-release  ← 创建 Release 并附加产物
```

- 使用 `tauri-apps/tauri-action@v0` 官方 Action 简化流程
- macOS 代码签名：v1.0 暂不配置（用户需手动允许运行），后续 v1.1 添加
- Windows 安装包签名：v1.0 暂不配置

---

## 5. 测试策略

每个功能完成后，测试角色执行以下验证：

### 功能测试矩阵

| 功能 | 核心场景 | 边界场景 |
|------|----------|----------|
| F0 | 贴边后离开自动隐藏；进入取消隐藏 | 未贴边时离开无响应；连续快速进出不触发多次隐藏 |
| F1 | 拖拽到 todo 上方显示指示线 | 拖拽到空分组末尾；取消拖拽后指示线消失 |
| F2 | 折叠后 todos 不可见；展开后恢复 | 折叠状态下向分组拖入 todo 自动展开；刷新后恢复展开 |
| F3 | Ctrl+Enter 打开第一分组 | input 聚焦时快捷键不触发；模板只有2个分组时 Ctrl+3 无响应 |
| F4 | 托盘图标显示；右键菜单"退出"彻底退出 | 关闭主窗口不退出进程；托盘左键切换显隐 |
| F5 | 移动窗口后重启，位置恢复 | 外接显示器断开后窗口不越界 |
| F6 | 原生对话框导出 JSON 文件 | 浏览器环境降级为原有行为；导入无效文件给出错误提示 |
| F7 | 关于对话框显示正确版本号 | 点击外部关闭；链接可点击跳转 |
| F8 | 各尺寸图标清晰 | 16×16 下可辨识 |
| F9 | tag 推送后 CI 自动触发 | 构建失败时 Release 不创建 |

### 回归测试
每个新功能完成后，验证以下现有功能未受影响：
- 页签增删改、拖拽排序
- todo 增删改、完成状态、跨组拖拽
- 图片附件粘贴/预览/删除
- JSON 导出导入
- 模板切换应用

---

## 6. 发布说明

- 版本号遵循语义化版本：`1.0.0`
- CHANGELOG 在每个功能合并后更新
- Release tag 格式：`v1.0.0`
- macOS 包未签名，首次运行需要用户在"系统设置 → 安全性"中手动允许
