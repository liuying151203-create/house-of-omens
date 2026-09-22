# 剧本与物品机制扩展指南

## 结构与约束

游戏继续沿用「内容定义 → 规则引擎 → 界面／联机投影」的结构。内容代码不导入 `game-engine.mjs`，需要的规则操作由引擎传入，避免循环依赖。注册表保存函数定义；存档只保存 ID、数值和可序列化流程，不保存函数，也不运行素材包中的任意代码。

2026-09-22 本轮将四个剧本的初始化、组合触发、通用胜负检查、敌人击败回调、超时文案及敌人阶段收尾放入 `lib/content/scenarios/`。正式 Workflow 和测试用直算流程共用同一份剧本收尾，避免出现两套平衡数值或胜负逻辑。

## 新增剧本

1. 在 `lib/game-data.mjs` 的 `SCENARIOS` 中添加稳定 ID、标题、目标和文案。`mystery` 是探索入口，不是独立作祟规则。
2. 在 `lib/content/scenarios/` 新建剧本模块，并在 `index.mjs` 的列表中注册。注册表会拒绝重复 ID、缺失初始化、缺失超时文案和类型错误的回调。
3. 按需实现以下契约；可参考现有四个剧本。

| 字段 | 契约 |
| --- | --- |
| `id` | 必填，与 `SCENARIOS` 和存档中的 ID 一致 |
| `setup(game, metadata, context)` | 必填，初始化目标、敌人和提示；只能同步完成，不在这里创建自行等待的异步任务 |
| `timeoutReason` | 必填，倒计时耗尽的失败文案 |
| `hauntRules` | 可选，`{ priority, matches(omenId, room) }` 列表；优先级越大越先匹配，同优先级按注册顺序匹配；省略时仅支持定向入口 |
| `victory(game)` | 可选，返回胜利原因或假值；由引擎现有状态检查点调用，不是每次渲染都调用 |
| `enemyDefeated(game, enemy)` | 可选，敌人移除后返回胜利原因或假值 |
| `afterEnemies(game, report)` | 可选，敌人阶段收尾、超时检查前同步执行；例如钟声幽影增援 |
| `winnerFaction(won)` | 可选，将胜负映射为阵营 ID，由统一结束入口写入结果 |

`setup` 的 context 提供 `shuffle`、`random`、`pathTo`、`roomAt`、`living`、`ensureActive`、`log`、`announce`、`ENTRANCE`、`FLOORS`；现有狼人还使用 `turnWolf` 和 `WOLF_RULES`。需要扩大服务边界时，在引擎显式传入，不导入整个引擎。

作祟开始时机 `HauntStarted` 由引擎在 `setup` 完成后统一派发。剧本不要再次派发它。需要玩家投骰、选择或反应的流程应使用现有 Workflow／Trigger，而非在同步生命周期回调中直接暂停结算。

`setup.mjs` 仅复用旧三剧本的目标选址和普通敌人生成；新剧本不必采用三个目标房间的模板。该模板保留原有随机数调用顺序，包括 `trueMirror` 的抽取，避免已有种子和存档续局产生差异。

4. 在 `lib/content/actions.mjs` 添加可用行动。新的执行操作仍需接入明确的处理器或 Workflow；剧本注册表并不自动注册任意命令。
5. 增加 `lib/playtest.mjs` 定向场景和回归测试。若引入新的持久化字段或私密信息，检查迁移器、有效存档校验和联机投影。

## 新增物品或主动能力

基础物品定义放在 `lib/game-data.mjs` 的 `ITEMS`。沿用已有能力时，只需设置对应 `use` 及其数值、次数、消耗字段。

新的主动能力集中定义在 `lib/content/item-abilities.mjs`，包含目标、可用条件、按钮文案、Effect 列表和结果说明。`lib/card-rules.mjs` 的规则覆盖校验与 `lib/content/item-actions.mjs` 的行动生成共同读取这份定义，不再分别维护能力名称白名单。

当前目标适配器支持自身、属性轨目标和使用独立 `targetHeroId` 的人物目标。解药通过 `item.cleanse` Workflow 选择同室人物的最多两个状态，确认后原子提交效果与消耗。若增加房间／物品目标，需要明确扩展目标协议、权限检查和对应 Workflow，不能把新目标强塞进 `trait` 字段。

需要隔离试作或只能由机制生产的物品可声明 `supply`，默认抽牌堆仅收录没有该字段的定义。现有 `bloodmoon` 资源仅由明确选择的定向测试发放；正式制药和生产数量台账尚未接入。详情见 [血月卡牌试作与机制评估](bloodmoon-implementation-assessment.md)。

药剂通过 `boostTrait` 能力同时提升属性并添加 `trait-boost` 增益状态，与物品消耗一并原子提交。增益记录来源物品实例、对应属性和 `expiresRound`，由 `TurnStarting` 在使用者下次回合开始时按状态实例结算：当前属性回退 1 格、最低保留第 1 格，再移除增益。不要保存使用前属性快照来恢复，否则会覆盖期间的伤害；也不要挂到旧狼人专用的感染轮次结算。此增益不是负面状态，不允许解药清除。

物品执行仍通过 `item.use` 的原子 Effect 批次统一提交效果、使用标记、充能与消耗。新能力返回 Effect，不直接修改人物或背包。需要反应窗口或可能取消的多步骤支付时，先设计暂停、确认和退款契约，再接入可恢复 Workflow。

## 验证要求

至少覆盖正常路径、无效目标、成本不足、重复操作、取消／失败、序列化恢复和玩家权限。新增剧本需测试目标可达、胜负互斥、倒计时和 3／6 人配置；共用代码应验证 Workflow 与模拟流程的一致性。

```powershell
node --test tests/scenario-registry.test.mjs tests/item-actions.test.mjs
npm test
npm run lint
npm run build
```

涉及网络状态、权限或持久化时再运行 `npm run test:remote`。界面反馈通过定向试玩人工验收。

## 尚未完成的边界

这轮建立了剧本生命周期边界并消除了部分重复定义，不代表整个引擎重构结束。剧本的具体行动处理器、狼人状态推进和部分展示仍位于已有引擎／内容模块；后续应按具体机制逐步迁移。模拟适配器仍用于差分测试，不在本轮删除。

素材室 DIY 仍是草稿功能，暂不加载到正式对局。支持可执行自定义内容需要另行定义内容包版本、校验、存档兼容和联机一致性；当前注册表只接受随代码发布的可信内容。
