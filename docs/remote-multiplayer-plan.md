# 远程联机技术方案与分阶段计划

更新时间：2026-09-17。

## 1. 目标与技术选型

远程联机采用：

- Cloudflare Worker 作为公网 HTTP / WebSocket 入口。
- 每个房间映射到一个 Durable Object。房间内的所有命令天然串行，不再依赖跨实例锁；不同房间可并行伸缩。
- Durable Object 使用 SQLite 存储后端，持久化房间元数据、玩家、当前游戏快照、选择截止时间和幂等命令回执。
- 使用 Hibernatable WebSocket。连接空闲时 Durable Object 可休眠，连接仍由 Cloudflare 保持；唤醒后从 SQLite 和 WebSocket attachment 恢复上下文。
- 保留现有 HTTP 快照读取作为首次加载、断线恢复和 WebSocket 不可用时的降级通道。

服务器始终保存完整权威状态，客户端只提交命令并接收按玩家裁剪后的投影，不允许客户端上传或覆盖整份游戏存档。

## 2. 解耦方案

### 2.1 四层边界

1. **游戏规则层**：`lib/game-engine.mjs`、Workflow、Effect、Trigger 和游戏存档迁移。输入当前游戏状态和命令，输出新状态；不感知网络、房间、SQLite 或 WebSocket。
2. **房间领域层**：`lib/network/room-domain.mjs`。负责玩家身份、座位、权限、revision、命令幂等、超时选择和玩家视图投影；只处理可序列化对象，不引用 Node HTTP 或 Cloudflare API。
3. **运行时适配层**：局域网适配器使用进程内 `Map`；远程适配器使用每房间一个 Durable Object 和其内置 SQLite。两者调用同一房间领域层，避免出现两套权限与规则。
4. **客户端传输层**：React 只依赖 `create / join / read / command / subscribe / close` 接口。局域网可继续轮询，远程实现优先 WebSocket，断线时退回 HTTP 重同步。

### 2.2 面向规则持续变化的版本策略

- `NETWORK_PROTOCOL_VERSION`：只描述客户端与服务器的消息外壳。新增字段优先保持向后兼容；破坏性变更才提升主版本并明确拒绝旧客户端。
- `ROOM_STATE_VERSION`：描述房间、玩家、座位、回执和截止时间的持久化结构，与游戏规则版本分开迁移。
- `CURRENT_GAME_VERSION`：继续由现有游戏存档迁移器负责。新增规则数据必须提供旧存档迁移和恢复测试。
- WebSocket 首次连接发送 `hello`，包含协议版本、房间 revision 和客户端能力；服务端返回 `ready` 或 `upgrade_required`。
- 网络层只识别通用 `action` 命令，不枚举每一张卡、每个剧本或每条规则。新增游戏动作由规则引擎的 `supportsCommand` 与权限归属函数验证，通常不需要修改 Worker、SQLite schema 或 WebSocket 代码。
- 玩家私密信息始终经 `projectGameForPlayer` 生成，广播时针对每条连接单独投影，不能复用房主快照。

### 2.3 Durable Object 内部数据

每个 Durable Object 只保存一个房间，建议 SQLite 表：

| 表                  | 用途                                                                          |
| ------------------- | ----------------------------------------------------------------------------- |
| `room_state`        | 单行保存房间结构版本、revision、房主、剧本、人数、更新时间和当前游戏 JSON     |
| `players`           | 玩家 ID、显示名、令牌摘要、座位与加入时间                                     |
| `command_receipts`  | `(player_id, command_id)` 唯一键、命令指纹和执行 revision，保证重试只执行一次 |
| `request_deadlines` | 当前可超时选择及服务端截止时间                                                |

房间命令在 Durable Object 的单线程事件中校验，并在一个 `transactionSync` 中写入快照与回执。原始身份令牌只返回浏览器一次，SQLite 保存 SHA-256 摘要。房间默认保留 24 小时；闹钟负责过期清理，活跃命令延长有效期。

WebSocket attachment 只保存 `playerId`、连接 ID、协议版本和最近确认 revision，不保存完整游戏状态。Durable Object 唤醒后从 SQLite 恢复权威状态，再按连接所属玩家生成投影。

## 3. 消息模型

客户端命令沿用当前语义并增加版本外壳：

```json
{
  "type": "command",
  "protocolVersion": 1,
  "commandId": "UUID",
  "expectedRevision": 42,
  "payload": { "type": "action", "action": { "type": "move", "pos": "foyer" } }
}
```

服务端消息保持少而稳定：

- `snapshot`：首次连接、重连或版本落后时发送完整玩家投影。
- `updated`：命令完成后发送新的玩家投影和 revision。第一版先发完整投影，稳定后再评估增量补丁。
- `ack`：确认 `commandId` 已执行；重复命令返回相同执行 revision，但不会再次改状态。
- `error`：稳定错误码、可显示中文和当前 revision；客户端遇到 revision 冲突后自动请求 `snapshot`。
- `ping / pong`：仅用于连接健康；不驱动游戏规则或超时结算。

选择超时由服务端闹钟或下一次事件结算，浏览器倒计时只用于展示，不作为权威时间。

## 4. 分阶段开发与验收

### 阶段 1：共享房间内核与版本边界（已完成）

- 从 Node HTTP 服务中抽离房间领域逻辑。
- 房间状态改为可 JSON 序列化，加入独立房间版本与网络协议版本。
- 幂等回执只保存命令指纹和 revision，不再复制多份完整游戏快照。
- 局域网服务改用共享内核，行为保持不变。

可测标准：房间创建、加入、换座、开局、权限、冲突、命令重试和超时测试全部通过；房间状态经过 JSON round-trip 后仍可继续游戏；完整测试与生产构建通过。

### 阶段 2：Durable Object + SQLite 本地闭环（已完成）

- 增加 Worker 路由和 `GameRoom` Durable Object，按房间码 `idFromName` 路由。
- 建表、schema 迁移、令牌摘要、原子保存、24 小时闹钟清理。
- 先实现 HTTP `create / join / read / command`，复用现有客户端即可做端到端测试。
- 使用 Wrangler 本地持久化验证重启后恢复、并发 revision 冲突、重复命令和旧游戏快照迁移。

可测标准：关闭并重启本地 Worker 后房间与身份仍可恢复；两个浏览器能完成现有 LAN 测试流程；直接检查 SQLite 表和索引；现有 LAN 模式仍通过全部测试。

实际实现：

- `worker.mjs` 在 Vinext Worker 入口导出 `GameRoom`，Vite 配置声明 `GAME_ROOMS` 绑定和 SQLite Durable Object migration。
- `POST /api/remote/rooms` 创建房间，`POST /api/remote/join` 加入房间；`GET/POST /api/remote/rooms/:code` 分别读取玩家投影和提交命令。
- `GameRoom` 以房间码命名，一个对象只管理一个房间。所有状态变更通过串行队列进入共享房间内核，再用 `transactionSync` 原子写入 SQLite。
- SQLite 使用 `schema_meta`、`room_state`、`players`、`command_receipts` 和 `request_deadlines` 五张表；游戏状态、身份、幂等回执和服务端截止时间分开保存。
- 浏览器保存 256 位随机身份令牌，SQLite 只保存 SHA-256 摘要；原始令牌只在创建或加入成功时返回一次。
- 24 小时过期时间写入房间记录并设置 Durable Object alarm。读取旧游戏快照时沿用现有 `CURRENT_GAME_VERSION` 迁移器，不与房间 schema 版本绑定。
- `npm run test:remote` 会构建 Worker、启动真实 Wrangler、本地建房与并发操作、停止并重启 Worker、验证恢复和继续游戏、检查 SQLite 表，并确认原始令牌没有出现在持久化文件中。

阶段二只提供可调用的远程 HTTP 后端，尚未切换大厅界面。阶段三完成 WebSocket 与客户端传输适配器后，再向玩家开放“远程房间”入口。

### 阶段 3：Hibernatable WebSocket 实时同步

- 增加 `hello / ready / command / ack / snapshot / error` 协议。
- 使用 `acceptWebSocket`、connection attachment 和按玩家投影广播。
- 客户端增加传输适配器、指数退避重连、revision 补齐和 HTTP 降级。
- Durable Object 被重新实例化后通过 `getWebSockets` 与 attachment 恢复在线连接，不依赖内存连接表。

可测标准：两端动作实时可见；强制休眠/重启后连接或重连能恢复；重复发送、乱序响应和短时断网不会重复执行动作；私密状态不泄漏给其他座位。

### 阶段 4：远程大厅、可靠性与安全

- 界面区分“远程房间”和“局域网房间”，展示连接状态、复制邀请链接、重连与过期提示。
- 创建/加入限流、请求大小限制、Origin 校验、安全响应头、结构化错误码和敏感日志脱敏。
- 增加房间指标：连接数、命令延迟、冲突率、恢复失败和 schema 版本；不记录令牌或私密剧情正文。
- 对大状态、24 小时过期、多人同时操作、Worker 发布回滚进行压力和故障测试。

可测标准：公网预发布环境完成 3 至 6 人跨网络试玩；移动端与桌面端可重连；安全用例、全量规则测试、构建和冒烟测试均通过。

### 阶段 5：发布与兼容运行

- 灰度启用远程入口，局域网与离线单人继续保留。
- 先保持完整快照广播；仅在真实带宽数据证明有必要时引入增量补丁。
- 部署前执行 Durable Object schema 兼容检查；规则升级必须先通过旧房间恢复测试。

可测标准：生产新建房间、邀请加入、完整一轮、刷新重连和房间过期流程通过；旧版本客户端收到明确升级提示；回滚不破坏已创建房间。

## 5. 当前阶段提交范围

本阶段不改变玩家界面，也不连接 Cloudflare 账号。现有 `npm run demo` 仍是可玩的局域网版本；后续阶段在同一房间内核上增加远程运行时，不复制游戏规则。

## 6. 官方资料

- [Durable Objects 设计规则](https://developers.cloudflare.com/durable-objects/best-practices/rules-of-durable-objects/)
- [Hibernatable WebSocket](https://developers.cloudflare.com/durable-objects/best-practices/websockets/)
- [SQLite-backed Durable Object 存储](https://developers.cloudflare.com/durable-objects/best-practices/access-durable-objects-storage/)
- [Durable Object 测试](https://developers.cloudflare.com/durable-objects/examples/testing-with-durable-objects/)
