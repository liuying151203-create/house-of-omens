# 预兆之屋美术素材

## 已接入

统一方向：暗色宅邸背景、低饱和写实头像、古金色物品剪影。同类素材使用同一套来源，人物不混用像素或卡通头像。

| 用途 | 来源 | 许可 | 接入方式 |
| --- | --- | --- | --- |
| 六名人物头像 | [Ladadori · Realistic avatars for RPG](https://ladadori.itch.io/realistic-avatars-for-rpg) | CC0 | 首页、全员栏、当前人物栏共用 ExplorerEmblem；原图保留，CSS 统一色调与框 |
| 18 种物品及预兆、狼人头像 | [Game-icons.net](https://game-icons.net/) 的 Lorc、Delapouite | CC BY 3.0 | ItemGlyph / EnemyGlyph；移除原 SVG 背景方块，使用界面当前色 |

人物包由作者使用 Artbreeder 生成并在 Krita 中修整。作者原发布帖明确为 [CC0](https://www.reddit.com/r/gameassets/comments/kjb8fr/120_realistic_avatars_for_rpg_ethnic_gender_and/)，素材页将其误写为 CO0。无需付费；保留作者鸣谢。

Game-icons 的 [官方许可说明](https://game-icons.net/faq.html) 要求署名。首页“素材鸣谢”列出作者、来源和许可证链接；原始许可保存在 public/art/game-icons/LICENSE.txt。

人物的原始文件名、作者和来源保存在 lib/portrait-art.json。每个物品的作者、页面和 SVG 路径保存在 lib/item-art.json。原始素材均放在 public/art 下，运行时不请求外站；离线打包会内嵌全部使用的头像与图标。

## 已检查但未采用的备选

- [FieraRyan · Post-Apocalyptic Character Portraits](https://fieraryan.itch.io/post-apocalyptic-character-portraits)：CC0、AI 辅助制作，免费。下载检查后发现多数是科幻头盔人物，不能覆盖本作六名普通探险者，未接入。
- [Frau Knurrkater · Portrait Artpack Fantasy](https://knurrkater.itch.io/artpack-portrait-fantasy)：统一手绘，但为 CC BY-NC-SA，商用须另联系作者；未接入。
- [gleolite · Noir Men Portraits](https://gleolite.itch.io/noir-men-portraits-free-2d-pack)：免费个人与商用，禁止原文件再分发；只提供男性肖像，未接入。

后续更换头像只需调整人物映射及同名图片，不更改人物规则、存档或阵营。当前资源是可替换的美术层，不宣称为本作原创绘制。
