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
