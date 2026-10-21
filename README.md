# 弹弓飞镖

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

打开即可玩的中文弹弓飞镖小游戏。拉住弹弓、向后拖动、松手发射，把飞镖插上靶盘。静态网页，无构建步骤、账号或后台服务。

**在线试玩：<https://darts-game-8lq.pages.dev/>**（支持电脑和手机，无需安装）

## 特色

- **拟物化弹弓手感**：拉弓力度 0—100%，力度越大弹道越直；满力命中会让靶盘出现裂痕，第四次满力命中直接碎盘。
- **会摇摆的靶盘**：碎盘或插满飞镖后，下一块靶盘会左右摇摆，还可以用手指或鼠标拨动、甩飞。
- **锤子彩蛋**：轻点头像领取锤子，进入“无限锤击”模式，把整个页面砸个稀巴烂，最后还有一杯咖啡等你歇会儿。
- **电脑与手机通用**：鼠标、触屏、键盘（方向键 + 空格）都能玩；支持“减少动态效果”，支持设备震动反馈。
- **零依赖**：纯原生 JavaScript 和 Web Audio，所有素材随网站提供，没有运行时依赖。
- **有测试**：弹道碰撞、力度边界、积镖掉落、破坏优先级、音频启动等逻辑都有自动化测试覆盖。

## 快速开始

1. 在项目目录运行 `python3 -m http.server 4173 --directory dist`。
2. 打开 <http://localhost:4173>。
3. 看到靶盘和“开始”按钮即表示加载成功；点击“开始”启用声音，弹弓浮上来后，拉住弹弓向后拖动，松手发射。

运行命令只会启动本地预览服务，不会发布网站。按 Ctrl+C 停止。

运行测试需要 Node.js 20 或更高版本：

```bash
npm test
```

## 玩法速览

- 鼠标或手指拖动下方弹弓，方向与拉弓偏移相反，拉得越远力度越大；松手发射。
- 键盘：聚焦游戏画布后，方向键调整拉弓，空格或 Enter 发射，Escape 取消。
- 计分：头像靶心 50 分，内盘 10 分，红色外框 5 分，脱靶 0 分；第四次满力命中碎盘得 100 分。
- 每块靶盘最多插 12 个飞镖，插满会触发“理解万岁”彩蛋。

完整规则（力度与弹道、碎盘与甩飞条件、摇摆阶段、锤击模式等）见 [docs/GAMEPLAY.md](docs/GAMEPLAY.md)。

## 项目结构

```text
dist/                 静态网站（部署目录）
├── index.html        页面入口
├── game.js           画面、输入与动画
├── physics.js        飞行与命中规则
├── motion.js         靶盘运动（画面与命中共用）
├── mayhem.js         锤击规则
├── mayhem-view.js    页面破坏表现
├── damage-view.js    破损与裂痕显示
├── fracture.js       从命中点生成不规则碎块与裂纹
├── sling-motion.js   弹弓动画
├── style.css         样式
└── assets/           图片与音效
tests/                单元测试与浏览器冒烟检查
docs/                 玩法详解与开发说明
```

开发与测试细节见 [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md)。

## 素材与致谢

| 素材 | 来源 / 许可 |
| --- | --- |
| 观众欢呼音效（`human-cheer.wav`） | 截取自 Zeraora 的 [Audience Clapping](https://freesound.org/people/Zeraora/sounds/429422/)，[CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) |
| 碎盘掌掴音效（`shatter-slap.wav`） | 截取自 TRP 的 [slaps, face, foley, 10](https://freesound.org/people/TRP/sounds/576961/)，[CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) |
| 锤子、咖啡纸杯、图标等 | 由图像生成工具制作 |
| 靶盘头像（`portrait*.png`） | 含真人形象的素材，**不在 MIT 许可范围内**，见下文 |

## 许可证

本仓库的**源代码**以 [MIT 许可证](LICENSE) 发布。

靶盘头像等含真人形象的图片（`dist/assets/portrait*.png`）保留所有权利，**不随 MIT 许可授权**，请勿复用、再分发或用于其他项目。如果你 fork 本项目，请替换为自己有权使用的头像素材。
