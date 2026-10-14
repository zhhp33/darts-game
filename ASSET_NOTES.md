# 头像素材与抠图提示词

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
