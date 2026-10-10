# 血月之夜分项验收

## 1. 专用游戏集

首页“本局游戏集”选择“血月之夜游戏集”。在编辑／导入游戏集、素材室或设置中进入同一管理界面。

1. 内置预设只读；复制后修改名称和“默认剧本”，保存、刷新、导出／导入应保留配置。
2. 物品牌为手枪、解药、家族戒指、圣者徽章、捕兽夹各一张；药剂通过实验室制备，银弹通过熔铸获得。
3. 预兆为铃铛、书、咬痕，共三张；沿用至少三张预兆的探索过程。经典与通用扩展预设不包含咬痕。
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
