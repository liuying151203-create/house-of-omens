# 远程联机发布手册

阶段 5 的本地准备不等于公网发布。以下命令在项目根目录的 PowerShell 执行；需要有权部署目标 Cloudflare Worker 的账号。不要在聊天或仓库里粘贴 API Token、玩家身份令牌。

2026-09-19 状态：独立预发布 `house-of-omens-staging` 已以 `preview` 部署，地址为 `https://house-of-omens-staging.yh9140933.workers.dev/`，版本 ID 为 `4fab55af-7a38-4fec-9497-a8bded11ea8c`。公网首页、可用性接口、HTTP 建房/加入/读取和 WebSocket `hello / ready / snapshot` 已验证；跨网络完整对局、刷新恢复及实际 24 小时过期尚未验证。生产 Worker 未部署。

## 1. 发布前检查

```powershell
npm ci
npm test
npm run test:remote
npm run release:check
.\node_modules\.bin\wrangler.cmd whoami
```

`release:check` 默认以 `HEAD` 为回滚 Git ref。已有线上版本时，先确认其对应的 Git ref，再运行 `node scripts/check-remote-release.mjs <线上GitRef>`。此检查只验证当前代码和回滚 ref 的四类版本号及本次构建的 Durable Object 绑定、migration；它不证明所有规则行为均可回滚。上线前还要人工核对目标 Worker 的现有绑定和迁移记录。不能回滚到房间 SQLite schema 1 的阶段 3 版本；房间一旦迁移为 schema 2，旧代码不能保证读取。不要删除、重命名或转移 `GameRoom` / `RemoteRateLimiter` 对象类。

## 2. 独立预发布

```powershell
.\node_modules\.bin\wrangler.cmd deploy --config dist/server/wrangler.json --name house-of-omens-staging --var REMOTE_MULTIPLAYER_STAGE:preview --strict
```

部署后记录 Wrangler 返回的预发布 URL 和版本 ID。预发布名称必须与生产 Worker 不同，且不要将预发布房间码混用到生产地址。访问 `<预发布URL>/api/remote/availability` 应返回 `{"stage":"preview"}`。在预发布 URL 后加 `?network=remote` 创建测试房间，并用邀请链接在另一网络的桌面/手机上加入。

人工验收：3 至 6 人选座、开局、完成一整轮合法动作；两端私密信息隔离；刷新后同标签页身份和进度恢复；短时断网后重连、命令重试不重复执行；旧客户端协议不兼容时显示升级提示。`npm run test:remote` 用本地 SQLite 夹具模拟 24 小时过期，生产实际过期仍需等待并观察，不能在生产存储里手改过期时间。

## 3. 生产灰度

确认生产 Worker 名称和域名归属后，从同一份通过检查的构建产物部署，首次使用 `preview`；记录 Git ref、Worker 版本 ID、时间和开关值。

```powershell
.\node_modules\.bin\wrangler.cmd deploy --config dist/server/wrangler.json --name house-of-omens --var REMOTE_MULTIPLAYER_STAGE:preview --strict
```

先按预发布清单在生产测试地址完成一局；观察错误率、命令冲突、重连失败和 Durable Object 指标。确认稳定后，以同样命令把 `preview` 改为 `on`，再检查普通入口可见且局域网、离线单人仍可用。每次重新部署都必须显式传入 `REMOTE_MULTIPLAYER_STAGE`，避免默认值掩盖预期状态。完整快照广播保持不变；只有真实带宽数据证明需要时才考虑增量补丁。

## 4. 止损与回滚

出现服务端异常时，先把开关改成 `off` 重新部署同一兼容版本，停止新建远程房间；已存在房间的加入、读取、命令和 WebSocket 仍可运行。若需回滚代码，只能选择完成第 1 节兼容检查且人工确认的版本。Cloudflare 回滚 Worker 代码不会回滚 Durable Object 的 SQLite 数据；阶段 4 的代码虽然与 schema 2 相同，却没有阶段 5 的 `off` 开关，回退它会重新开放创建，因此不能把它当作灰度止损版本。若已迁移房间 schema 或改变规则存档格式，应先做前向修复，不要盲目使用平台回滚。

止损后复查 `/api/remote/availability`、新建返回 `remote_creation_disabled`、现有房间的 HTTP/WebSocket 和局域网入口。故障期间不要删除 Durable Object 类或存储。若需保持 `off` 状态的回滚点，应先保存一个包含阶段 5 开关且版本兼容的已验证 Worker 版本。
