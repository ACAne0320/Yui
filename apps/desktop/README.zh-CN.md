# Yui Desktop

`apps/desktop` 是 Yui 的 Electron 桌面端。它不是独立 runtime，而是通过 main
process 持有共享 `AppRuntime`，再经 preload 暴露受控的 `window.yui` API 给 React
renderer。

## 启动和验证

在仓库根目录运行：

```bash
pnpm desktop:dev
pnpm desktop:build
pnpm typecheck
```

`desktop:build` 只构建 Electron main、preload 和 renderer 产物，不生成可分发安装包；
`pnpm desktop:dist` 通过 electron-builder 打出未签名的 macOS `.dmg`。推送 `v*.*.*`
标签会触发 `.github/workflows/release.yml` 构建该 DMG 并创建 GitHub Release。仓库当前仍未配置签名、公证和自动更新。

## 当前界面能力

- 聊天主界面：创建/恢复会话、发送 prompt、follow-up、abort、流式消息、reasoning、工具执行链、自动重试和 compaction 状态；多个会话可同时保持运行，切换视图不会中断后台流式输出。
- Composer：选择工作目录、使用 profile 下的临时 scratch 工作区、选择模型、切换思考等级、粘贴/拖拽/选择图片附件、展示扩展 status/widget。
- 会话列表：显示持久化会话，支持按时间/工作区查看、打开、删除和命令面板搜索。
- 设置面板：
  - General：界面语言等通用设置。
  - Providers：API key、OAuth/subscription login、默认模型、可用模型列表。
  - Subagents：查看内置角色，创建/保存/重置 `<YUI_HOME>/agent/agents/*.md` 子代理定义。
  - Extensions：查看全局 Pi 扩展目录、settings 路径和 packages；启用/禁用目录扩展、删除目录扩展、增删 settings 路径。
- 扩展 UI：支持 select、confirm、input、editor dialog，notice toast，status chips，widgets，title 和 working message。

## 进程边界

Electron 不是普通网页应用，当前结构是：

```text
React renderer
  -> window.yui
preload
  -> fixed IPC channels
main
  -> Electron / Node.js / packages/runtime
```

### `src/main`

主进程负责应用生命周期、单实例锁、窗口创建、网络代理、IPC 注册和唯一共享
`AppRuntime`。这里可以访问 Electron 和 Node.js API。

主进程在窗口创建前初始化 runtime，并在退出时依次撤销 IPC handler、清理 agent 事件订阅、
dispose runtime。

### `src/preload`

preload 使用 `contextBridge` 暴露经过选择的 `window.yui` 方法。Renderer 不能自由选择
IPC channel，也不能拿到完整 `ipcRenderer`。

### `src/renderer`

Renderer 是 React + Vite 应用。它没有 Node/Electron 类型，不直接访问文件系统、进程或
`@yui/runtime`。跨进程能力都通过 `@renderer/lib/api` 调用 preload API。

## `window.yui` API

当前 preload 暴露这些分组：

```text
desktop    getAppInfo / selectDirectory / createScratchDirectory / openPath
profile    get
auth       listProviders / API key / OAuth login flow
models     listAvailable
settings   getDefaults / setDefaultModel / setDefaultThinkingLevel
subagents  list / save / delete
extensions list / setEnabled / delete / addPath / removePath
sessions   list / getInfo / getHistory / delete
agents     openSession / prompt / steer / followUp / abort / title / model /
           thinking / close / subscribe / extension UI
```

新增 runtime 能力时按这个顺序改：

1. 在 `packages/contracts` 定义或复用 schema、DTO 和服务接口。
2. 在 `src/shared/ipc-channels.ts` 增加固定 channel。
3. 在 `src/shared/desktop-api.ts` 增加公开 API 类型。
4. 在 `src/main/ipc/*-ipc.ts` 校验输入并调用 runtime。
5. 在 `src/preload/api/create-yui-api.ts` 暴露具体白名单方法。
6. 在 renderer 的 `data/` hook 或 feature 组件中消费。

不要暴露通用 `invoke(channel, input)`，也不要让 renderer 导入 `@yui/runtime`。

## Runtime 和 Profile

Desktop 与 CLI 都使用 `resolveRuntimeConfig()`，默认 profile 是 `~/.yui`，可用
`YUI_HOME` 覆盖。仓库根目录的 `pnpm desktop:dev` 会在未显式设置时将其设为
`~/.yui-dev`，避免开发数据和正式应用数据混用。

Desktop 启动时会把 runtime 的 `cwd` 绑定到 profile home，而不是 Electron 进程 cwd。这样设置面板读写的是全局 profile settings，不会因为 Finder/桌面启动位置不同而混入某个项目的
`.pi/settings.json`。真实会话不受影响；每个会话打开时会按自己的工作目录创建 Pi services。

临时工作区由 main process 创建在：

```text
<YUI_HOME>/scratch/ws-*
```

它们不会自动删除。

## 安全策略

当前窗口配置：

- `contextIsolation: true`
- `sandbox: true`
- `nodeIntegration: false`
- 只接受主窗口 webContents 发出的 IPC 请求。
- 所有输入经 schema 校验。
- 新窗口请求默认拒绝，http(s) 链接交给系统浏览器。
- 导航被阻止。
- 权限请求默认拒绝，只允许 sanitized clipboard write。

## 构建配置

`electron.vite.config.ts` 显式配置 main、preload 和 renderer 入口。

构建时会把 `@yui/contracts` 和 `@yui/runtime` 打进 main bundle，因为这些 workspace 包在开发期直接暴露 TypeScript 源码；Electron 不能把它们当普通外部依赖执行。

Pi 相关包保持 external。Pi 的扩展加载器依赖真实包路径解析 jiti aliases，打包进去会破坏用户扩展加载。

两份 TypeScript 配置分别保护边界：

- `tsconfig.node.json`：main、preload 和构建配置，可使用 Node/Electron 类型。
- `tsconfig.web.json`：renderer，只使用 DOM 和 Vite 类型。

## 尚未覆盖

- 签名、公证和自动更新（release 仅产出未签名的 macOS DMG）。
- 自定义模型创建 UI（当前按钮是占位）。
- CLI 中的交互式扩展 dialog（CLI 会自动取消扩展 dialog，并提示使用 Desktop）。
