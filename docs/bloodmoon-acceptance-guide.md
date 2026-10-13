# 血月之夜分项验收

本轮按下列三项分别完成并提交，提交命令只作范围记录，已执行，无需重复提交。原狼人剧本与经典牌池保持原样。

2026-10-14修复开局界面：血月章节补充月亮图标，未配置图标的后续剧本使用默认图标；作祟说明支持没有房间目标和倒计时的血月，不再读取不存在的目标列表。修复后刷新页面，重新选择血月普通开局或定向测试即可，无需清除浏览器存档。新增完整 `Home` 页面回归，覆盖开局、咬痕各个确认步骤、作祟提示、旧剧本及默认图标。

此次修复验证：完整368项自动测试、相关静态检查和生产构建通过；正在运行的开发服务已输出更新后的模块。完整页面回归先复现原组件类型错误，再验证修复，不仅检查大厅或单个面板。实际浏览器操作仍以人工试玩为准。

验证结果：365项自动测试、相关静态检查和生产构建通过；本地 Worker 血月正式开局、WebSocket同步、重启恢复、迁移、过期和关闭新建后的续局通过。浏览器工具被本地页面访问策略阻止，实际点击、动画及整局平衡请按以下步骤验收。

## 1. 专用游戏集

首页“本局游戏集”选择“血月之夜游戏集”。在编辑／导入游戏集、素材室或设置中进入同一管理界面。

1. 内置预设只读；复制后修改名称和“默认剧本”，保存、刷新、导出／导入应保留配置。
2. 物品牌为手枪、解药、家族戒指、圣者徽章、捕兽夹各一张；药剂通过实验室制备，银弹通过熔铸获得。
3. 预兆为无舌铜铃、空白之书、咬痕，共三张；沿用至少三张预兆的探索过程。经典与通用扩展预设不包含咬痕。
4. 保留血月默认剧本时，删除咬痕、任一五件物品或实验室／锅炉房／消毒杀菌室，应提示缺少具体卡牌，不能保存不完整预设。
5. 未指定定向剧本时采用预设默认剧本；明确指定的剧本优先。物品和新房间仍可用于其他剧本。

可单独验证：

```powershell
node --test tests/game-sets.test.mjs tests/bloodmoon-bite.test.mjs
```

本阶段提交命令（由开发代理执行）：

```powershell
git add lib/game-sets.mjs lib/content/bloodmoon-omens.mjs app/game-sets.jsx tests/game-sets.test.mjs tests/bloodmoon-bite.test.mjs docs/game-sets-guide.md docs/bloodmoon-acceptance-guide.md
git commit -m "feat(game-sets): add bloodmoon preset validation / 新增血月预设及必要卡牌校验"
```

## 2. 咬痕正式触发

定向测试选择“血月之夜 → 咬痕 → 血月正式触发”，可保存测试点并反复重置。原狼人剧本的“咬痕攻防与作祟（独立测试）”保留旧行为。

1. 查看卡牌说明后继续：暗处袭击者投4枚攻击骰，抽牌者以当前力量值投防御骰。
2. 有戒指时，在原骰子窗口选择自己的可重掷骰；重掷结果一直保留，点击继续后才结算。
3. 攻击方胜出时，自己从原位置分配完整差值身体伤害；防御方胜出或平局无伤、无反击。
4. 上述反应全部处理完，才出现作祟检定；此测试点已获得三张预兆，即使点数不足5也会开始作祟。
5. 首位咬痕持有者成为初始狼人，仍由原玩家控制；没有旧版自动移动的狼王，其他人物保留座位。
6. 在攻防、戒指选择或伤害分配期间保存测试点／刷新恢复，流程不能跳过或重复伤害。
7. 普通定向血月局，咬痕第一／第二张出现时仍按现有规则跳过不可能达到5点的检定；后续预兆触发作祟时，初始狼人仍为早先的咬痕持有者。咬痕未出现时不开始血月作祟。

自动剧本自定义集可以清除“默认剧本”；咬痕作为触发预兆时优先揭示血月，其他预兆继续采用既有组合规则，因此自动局不保证抽咬痕之前不会触发其他剧本。

```powershell
node --test tests/bloodmoon-entry.test.mjs tests/bloodmoon-bite.test.mjs tests/scenario-registry.test.mjs tests/quick-playtest.test.mjs
git add lib/game-engine.mjs lib/engine/scenarios.mjs lib/content/scenarios/bloodmoon.mjs lib/playtest.mjs tests/scenario-registry.test.mjs tests/bloodmoon-entry.test.mjs docs/bloodmoon-acceptance-guide.md
git commit -m "feat(bloodmoon): connect bite to formal haunt entry / 接入咬痕与正式作祟流程"
```

## 3. 单机与联机正式开局

```powershell
npm run dev
```

打开终端显示的地址，选择“本局剧本 → 血月之夜”。从经典／通用扩展预设切换时自动选择血月预设；已有自定义预设保留，缺卡时提示具体缺项并禁用开局。也可保留“未知的夜晚”并选择带血月默认剧本的预设。

### 单机

1. 分别选择3、4、5、6人，普通新局应从入口大厅开始探索，无预发手枪／银弹，无初始狼人；与“定向测试”不同。
2. 通过地图探索获得预兆。第三张预兆处理完后进入血月；咬痕持有者变为初始狼人，英雄人数为总人数减一，没有自动敌人阶段。
3. 作祟后继续探索关键房间和物品；在实验室知识5+制备药剂，在实验室／锅炉房知识4+熔铸戒指或徽章，失败保留材料，成功生成唯一银弹。
4. 英雄拾取／交易得到手枪和银弹后装填；同层、直线双向门相连且中间没有存活角色遮挡时，对初始狼人银弹射击。由狼人分配7点身体伤害，进入骷髅即英雄胜利；存活则两条身体轨道永久限制到第4格。
5. 检查作祟第3轮满月、第5轮血月；原狼人剧本、经典牌池和既有测试点保持原行为。
6. 普通局刷新后用“继续游戏”恢复；测试局用“定向测试 → 继续测试局”，两类存档互不覆盖。

### 联机

1. 在联机大厅选择“血月之夜”和血月游戏集，创建局域网房间。至少另一位玩家加入后，由房主点击“全员入座，开始探索”。未占用角色由房主代管；可分配不同座位验收3～6个角色。
2. 加入者无需导入游戏集，等待大厅显示房主固定的剧本和牌池；变更本地预设不改变已有房间。
3. 谁获得咬痕，谁投自己的防御骰、分配伤害并控制成为狼人的原座位；虚拟袭击者的攻击骰由房主代投。另一位玩家无法替该座位确认或操作私人选择。
4. 在骰子窗口、伤害分配和感染检定中分别刷新或重连，状态和权限保持一致，没有重复伤害或额外获得行动次数。
5. 快速验收可在血月等待大厅选择“咬痕 → 血月正式触发”或感染／嗜血／追猎测试点，再点击“定向测试 · 开始所选场景”；应进入所选场景，不能总是进入默认测试。
6. 远程房间采用同一规则和配置校验；本次只验证本地 Worker，不部署公网。联机客户端和主机应同时更新。

### 分模块回归

感染、嗜血、追猎及枪械的定向测试保留，现可直接选择血月剧本；旧狼人菜单中的既有独立入口也保留。详细预期见[卡牌与机关指南](bloodmoon-content-guide.md)。

- 感染：传播与徽章庇护、感染Ⅱ检定与净化；检验首次升级、状态选择、净化优先和转化座位。
- 嗜血：满月／血月／银弹上限三个入口；检验按实际伤害自由分配、封顶和中途恢复。
- 追猎：方向、次级狼人、陷阱、落单四个入口；检验额外1点的方向和唯一消费、陷阱截停与攻击结果加值。
- 枪械：普通枪击、遮挡、银弹第一发／第二发、不死及恢复上限；检验射线、弹药实例和两方权限。

待设计明确的规则继续采用现有试作解释：首次感染Ⅱ按整局一次；净化先于狼化检定；初始狼人精神最低第1格；不能同室射击、每枪每轮装填一次、银弹仅射初始狼人。卡牌／弹药永久丢失后的回收或自动判负尚未新增；可能存在英雄无法再获胜的局面，需另行决定规则。此次入口接通不代表这些解释已经最终定案，整局平衡与实际动画仍需人工验收。

```powershell
node --test tests/bloodmoon-entry.test.mjs tests/bloodmoon-network-start.test.mjs tests/network-lobby.test.mjs
npm test
npm run test:remote
git add app/game-sets.jsx app/game-sets.css app/lobby-screen.jsx app/network.jsx app/page.jsx app/workshop.jsx lib/game-data.mjs lib/catalog.mjs lib/network/room-domain.mjs scripts/verify-remote-worker.mjs tests/bloodmoon-entry.test.mjs tests/bloodmoon-network-start.test.mjs tests/network-lobby.test.mjs tests/iteration-three.test.mjs docs/bloodmoon-acceptance-guide.md docs/bloodmoon-content-guide.md docs/bloodmoon-implementation-assessment.md docs/game-sets-guide.md docs/content-extension-guide.md
git commit -m "feat(bloodmoon): enable solo and multiplayer starts / 开放血月单机及联机正式开局"
```
