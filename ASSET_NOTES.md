# 头像素材与抠图提示词

## 插满12个飞镖的欢呼音效

`dist/assets/human-cheer.wav` 采用用户确认的 C2：Zeraora 的 [Audience Clapping.wav](https://freesound.org/people/Zeraora/sounds/429422/)，录于 Fredericton Playhouse，包含观众欢呼与掌声，页面标注 [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) 许可。公开 HQ 试听源为 https://cdn.freesound.org/previews/429/429422_7347459-hq.mp3 。截取原录音0.2—2.0秒，共1.8秒；结尾0.6秒叠加余弦曲线淡出，终点降至静音。用户在10%和8%的试听之间确认采用8%，因此最终文件直接使用 `artifacts/cheer-options/keynote-style/C2-1p8s-volume8-preview.wav`，音量为原淡出试听的8%，保存为48kHz、16位、双声道 WAV；此版未做去口哨处理。在“理解万岁”弹出时播放一次，并服从声音开关。原淡出试听及此前各次试听保留在本地，不随网站或源码发布。

## 碎盘掌掴音效

`dist/assets/shatter-slap.wav` 采用用户试听确认的 TRP [slaps, face, foley, 10.flac](https://freesound.org/people/TRP/sounds/576961/)，页面标注 [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) 许可。公开 HQ 试听源为 https://cdn.freesound.org/previews/576/576961_97550-hq.mp3 。提取原录音约1.087、3.460、5.658秒起音的前三下，保留各自原始音色与音高，将起音间隔缩短为0.2667秒，整段0.9063秒，保存为48kHz、16位、双声道 WAV。游戏在碎盘时只播放这段录音一次，避免将三下整段再次重复三遍。

2026-10-15 用户要求尽量保持现有音量：以替换前的单下音效按0.4秒间隔重复三次为参照，比较400毫秒 K 加权双声道能量窗口（100毫秒步长，并做绝对及相对门限处理），将确认的试听整段提高约4.276分贝。新旧测量响度差小于0.01分贝，成品峰值约0.573，无削波；不同音色与播放设备仍可能带来听感差异。最终独立试听保存在 `../音效试听/靶盘掉落-TRP前三下-最终音量.wav`，测量记录为同名 JSON。原 magicjoshua 单下音效及修改前文件备份在 `artifacts/slap-replacement/2026-10-15/before/`。本次仅修改本地文件，未发布线上。

当前默认头像：[用户提供的方形头像](/Users/zhenghaipeng/Downloads/飞镖/slingshot-darts/dist/assets/portrait-classic-square.png)，714×714。直接采用原图，三个头像使用同一显示框并等比例缩放。

处理方式：内置 imagegen 工具，两张图片分别处理，透明背景。保留表情、眼镜、衣领与人物比例；访谈头像移除背景和麦克风，大头头像保留大头比例。原始附件未覆盖。

最终素材：

- [访谈头像](/Users/zhenghaipeng/Downloads/飞镖/slingshot-darts/dist/assets/portrait-interview.png)
- [大头头像](/Users/zhenghaipeng/Downloads/飞镖/slingshot-darts/dist/assets/portrait-caricature.png)

两张成品均为带 alpha 透明通道的 PNG。游戏通过圆形画布裁切展示；“换个靶盘”在原头像和这两种头像之间轮换。

## 访谈头像提示词

Use case: background-extraction. Edit target: supplied photograph of a man speaking beside a microphone. Produce a precise transparent-background cutout of this SAME man for a small circular portrait in a web game. Remove the black and blue backdrop and the microphone apparatus, preserve the exact face, expression, glasses, hairstyle, skin texture, lighting, dark shirt, collar and shoulders. Keep the original photographic appearance and pose, no beautification, no changes to identity or facial geometry, no new objects, no text. Frame the full head plus neck, visible shirt collar and upper shoulders, with a little transparent margin above the hair. Actual alpha transparency outside the person, with natural fine hair edges; no solid backdrop, no checkerboard baked into pixels.

## 大头头像提示词

Use case: background-extraction. Edit target: supplied caricature portrait of a man with large head and glasses. Remove only the dark gray background to actual alpha transparency. Keep the exact original caricature head proportions, expression, glasses, hair, textures, lighting, and small body with dark shirt and visible collar unchanged. Do not turn the caricature into a normal photographic person, do not change facial identity, do not add objects or text. Keep full head including hair, neck, shirt collar and upper shoulders, with natural clean edges and a little transparent margin around the silhouette. Output a centered transparent-background cutout. No solid backdrop and no checkerboard baked in.
