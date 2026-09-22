# 从零开始配置本地开发环境

本文面向 Windows + PowerShell，适用于开发「预兆之屋」的界面、剧本、物品和规则机制。所有 npm 命令均在项目根目录执行；每一步成功后再继续下一步。

## 1. 准备基础软件

| 软件 | 用途与要求 |
| --- | --- |
| Node.js | 项目要求 `>=22.13.0`，新环境建议安装 Node.js 24 LTS；npm 随安装程序提供 |
| Git | 获取代码、查看改动；发布检查也会读取 Git 历史 |
| 浏览器 | 使用 Edge 或 Chrome 进行界面、存档和联机试玩 |
| 代码编辑器 | 使用自己熟悉的编辑器即可 |

从 [Node.js 官方下载页](https://nodejs.org/en/download)选择 Node.js 24、Windows 和对应电脑架构的安装程序，完成安装并保留 PATH 配置。Git 可使用 [Git 官方 Windows 安装页](https://git-scm.com/install/windows)的安装程序，或执行官方提供的命令：

```powershell
winget install --id Git.Git -e --source winget
```

安装后重新打开 PowerShell，检查：

```powershell
node --version
npm --version
git --version
```

本项目使用 React、Vinext、Vite 和 Wrangler，这些工具由项目依赖提供，无需全局安装。普通本地开发不需要 Docker、Python、独立数据库服务或 Cloudflare 账号。Worker 本地测试由 Wrangler 模拟运行；云端部署另见[远程联机发布手册](remote-release-runbook.md)。

## 2. 获取并进入项目

如果项目已经在本机，直接进入：

```powershell
Set-Location 'D:\dev\games\house-of-omens'
```

新电脑需要先取得仓库地址，替换下面的占位文本后执行。若目标目录已经包含项目，不要重复克隆：

```powershell
git clone <替换为实际仓库地址> 'D:\dev\games\house-of-omens'
Set-Location 'D:\dev\games\house-of-omens'
```

路径可按电脑实际情况调整。确认根目录包含 `package.json`、`package-lock.json`、`app`、`lib`、`tests`，并先阅读 `AGENTS.md`：

```powershell
Get-Content AGENTS.md
git status --short
```

`game-server/` 当前是独立的 Durable Object 示例。实际游戏使用根目录的 `worker.mjs`、`vite.config.ts` 和 `lib/network/`，无需进入示例目录安装或启动。

## 3. 安装项目依赖

```powershell
npm ci
```

此命令按照锁文件安装已有依赖，需要网络访问 npm 包源。已有 `node_modules` 会被重新安装，不会修改游戏源码。不要删除锁文件或改用其他包管理器来绕过安装错误。

当前本地配置无需自行创建 `.env` 或填写云端密钥。保留仓库中的 `.openai/hosting.json`，因为 Vite 配置会读取它；当前 D1 和 R2 均未启用。

## 4. 首次验证并启动开发界面

依次执行，遇到错误先查看输出再继续：

```powershell
npm test
npm run lint
npm run build
npm run dev
```

- `npm test`：运行 Node.js 测试，包括规则、流程、存档、联机和部分界面渲染测试。
- `npm run lint`：运行项目配置的 Oxlint 检查。
- `npm run build`：检查生产构建是否成功，输出到 `dist/`。
- `npm run dev`：启动开发服务，按照终端打印的网址打开浏览器；开发时支持热更新。

开发服务会持续占用终端，使用 `Ctrl+C` 停止。需要同时执行测试时，另开一个终端并进入同一根目录。

浏览器打开后，先确认大厅能显示，再用首页的「定向测试」进入现有剧本，验证地图、掷骰、行动和回合推进。详细操作见[快速作祟测试](quick-playtest.md)。命令通过不能替代人工试玩。

## 5. 生成离线版与局域网试玩

```powershell
npm run build:portable
npm run demo
```

第一条命令先构建，再生成 `outputs/预兆之屋-demo.html`；第二条启动试玩主机。主机浏览器访问：

[http://127.0.0.1:4173/](http://127.0.0.1:4173/)

同一局域网的其他设备使用终端打印的 `LAN` 地址，不能填写它们自己的 `127.0.0.1`。主机需允许受信任的专用网络访问 TCP `4173` 端口，设备所在网络也需允许互访，无需关闭整个防火墙。

先由房主创建房间，再由其他浏览器或设备使用房间码加入。测试不同玩家时可用普通窗口和无痕窗口分开浏览器身份。主机终端必须保持运行，关闭后内存中的局域网房间会消失。

注意：

- `npm run demo` 使用生成的离线文件，不提供源码热更新。改动后重新执行 `npm run build:portable`，再刷新试玩页面。
- `启动试玩.cmd` 只启动主机，不会安装依赖或生成离线文件。
- 直接双击离线 HTML 可以单人试玩，但联机必须通过主机网址打开。
- 单人存档存于浏览器；文件模式、不同网址或端口的存档可能彼此独立。定向测试也使用独立存档，不要把换入口后看不到存档当成丢档。

## 6. 本地验证远程联机机制

修改网络权限、状态同步、私密信息投影、重连或持久化时运行：

```powershell
npm run test:remote
```

该命令会先构建，再启动临时的本地 Wrangler 服务，验证多人同步、WebSocket、幂等、重启恢复、迁移和过期等行为。它使用本地持久化目录，不会部署到公网，也不能替代真实跨网络试玩。

在受限终端中，如果 Wrangler 报错无法写入用户目录，可在当前 PowerShell 会话中将工具配置和日志指向项目内再重试。这些变量只影响当前会话及其子进程，关闭终端后失效：

```powershell
$env:XDG_CONFIG_HOME = Join-Path (Get-Location) '.wrangler/config'
$env:WRANGLER_LOG_PATH = '.wrangler/logs'
$env:WRANGLER_SEND_METRICS = 'false'
$env:MINIFLARE_REGISTRY_PATH = '.wrangler/registry'
npm run test:remote
```

需要手动运行构建后的 Worker 时：

```powershell
npm run build
npm start
```

打开终端打印的网址。远程大厅默认处于 `preview` 阶段，在网址后添加 `?network=remote` 可以显示测试入口。停止服务仍使用 `Ctrl+C`。

准备发布时另运行：

```powershell
npm run release:check
```

此命令执行构建和发布前检查，不负责部署，不能替代 `npm run test:remote`；完整流程见[远程联机发布手册](remote-release-runbook.md)。

## 7. 开发新剧本、物品和机制

| 改动内容 | 主要位置 |
| --- | --- |
| 剧本、人物、房间、卡牌基础定义 | `lib/game-data.mjs` |
| 剧本初始化、组合触发、胜负回调及阶段收尾 | `lib/content/scenarios/` |
| 卡牌按阶段、剧本和人物变化的规则 | `lib/card-rules.mjs` |
| 物品主动能力、使用、实例、次数和充能 | `lib/content/item-abilities.mjs`、`lib/content/item-actions.mjs`、`lib/item-instances.mjs` |
| 剧本行动和目标互动 | `lib/content/actions.mjs` |
| 多步骤流程、效果、被动修正、时机触发 | `lib/engine/`、`lib/content/` |
| 剧本初始化、命令执行、胜负结算 | `lib/game-engine.mjs`；狼人专属规则另见 `lib/werewolf.mjs` |
| UI、规则展示及反馈 | `app/`、`lib/game-view.mjs` |
| 定向试玩场景 | `lib/playtest.mjs`、`app/playtest-controls.jsx` |
| 存档迁移和联机投影 | `lib/engine/migrations.mjs`、`lib/engine/projection.mjs`、`lib/network/` |
| 自动化回归测试 | `tests/` |

新剧本仍需要接入初始化与胜负等逻辑，并非只添加一条数据。素材室中的 DIY 草稿暂不进入正式对局。引擎仍在重构，设计新机制前先阅读[效果引擎重构方案](effect-engine-refactor-plan.md)。

剧本生命周期现通过注册表接入；新增内容的契约和边界见[剧本与物品机制扩展指南](content-extension-guide.md)。

建议每个新机制配套一个定向试玩场景，并验证触发条件、支付和消耗、失败路径、刷新恢复、重复命令与联机权限。多步骤交互优先复用现有 Workflow、Effect、Modifier 和 Trigger。

修改物品时可先运行相关测试，再执行完整验证：

```powershell
node --test tests/item-actions.test.mjs tests/item-instances.test.mjs
npm test
npm run lint
npm run build
```

需要格式化时，限定本次修改的文件；`npm run format` 会调用格式化工具，不是只读检查：

```powershell
npm run format -- lib/content/item-actions.mjs
```

## 8. 常见问题

| 现象 | 处理方式 |
| --- | --- |
| 找不到 `node`、`npm` 或 `git` | 安装后重新打开终端，检查软件是否加入 PATH；用 `Get-Command node,npm,git` 查看解析结果 |
| PowerShell 提示禁止执行 `npm.ps1` | 改用 `npm.cmd ci`、`npm.cmd test`、`npm.cmd run dev` 等，不必为此修改系统执行策略 |
| 提示找不到 `esbuild`、`react` 或 `vinext` | 在根目录完整执行 `npm ci`；不要只安装某个缺失包导致锁文件变化 |
| `npm ci` 下载失败 | 检查网络及终端报错；可执行 `npm ping` 验证包源连通性，不要关闭证书校验 |
| 提示 Node.js 版本不支持 | 检查 `node --version` 和 `Get-Command node`，确认终端实际使用的版本满足要求 |
| 试玩服务启动但没有游戏页面 | 检查是否存在 `outputs/预兆之屋-demo.html`，先运行 `npm run build:portable` |
| 修改后试玩页面仍是旧版本 | 开发用 `npm run dev`；离线／局域网模式需重新打包并刷新 |
| 端口占用，出现 `EADDRINUSE` | 检查已有试玩窗口；停止自己启动的旧服务后重试，不要直接结束未知进程 |
| 其他设备无法连接 | 检查是否使用主机 LAN 地址、是否同一局域网、专用网络防火墙权限及无线客户端隔离 |
| Worker 测试失败 | 保留完整报错，检查依赖安装和构建是否成功，以及环境是否允许启动子进程、监听本地端口和写入 `.wrangler/` |

若安装后测试、lint 或构建仍失败，应记录具体命令与首个有效错误并排查，不能仅凭失败就认定为环境问题，也不要删除或放宽测试。

## 9. 本次环境调查记录

2026-09-22，本机已有 Node.js `v24.14.0` 和 npm `11.9.0`，尚未安装项目依赖。此前运行 `npm test` 得到 213 项通过、3 项失败；三个失败的测试文件均因无法导入 `esbuild` 而未运行。

以上为最初调查记录。同日后续检查时依赖已安装，重构前 231 项测试和生产构建通过；内容扩展优化后 237 项测试和生产构建通过。本次修改文件的 lint 通过，全仓库仍有修改前已有的 22 条错误，主要涉及 UI 可访问性、Hooks 和独立示例服务的 TypeScript 配置。基础环境可用于开发，但全仓库静态检查尚未清零；不以历史测试数量作为通过标准。浏览器人工试玩尚未执行。

Worker 集成验收也已通过：在完成构建后运行 `node scripts/verify-remote-worker.mjs`，覆盖 WebSocket 同步、迁移、过期与灰度关闭后的恢复。首次运行受用户目录写入权限限制，采用第 6 节的项目内配置路径后通过。

源码改动前后用 `git status --short` 和 `git diff` 检查范围。`node_modules/`、`dist/`、`.wrangler/` 和 `outputs/` 是依赖或生成内容，不提交到 Git。提交和推送按项目协作规则由用户明确决定。
