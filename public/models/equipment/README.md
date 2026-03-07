# 设备模型资源目录说明

本目录用于统一存放总览页 3D 园区的真实设备模型资源，前端约定通过 `/models/equipment/*.glb` 访问。

## 当前目标设备

1. `chlor-alkali-electrolyzer.glb`
   - 对应页面设备：氯碱电解槽区
   - 建议关键词：`chlor alkali electrolyzer skid`, `industrial electrolyzer stack`, `electrolysis plant`
   - 最低要求：主体清晰、长度方向明显、可看出多槽体并联结构
2. `pem-fuel-cell.glb`
   - 对应页面设备：PEM 区
   - 建议关键词：`PEM fuel cell skid`, `hydrogen fuel cell container`, `industrial fuel cell module`
   - 最低要求：模块化集装箱或机柜式结构，方便和当前数据卡关联
3. `solar-array.glb`
   - 对应页面设备：光伏阵列区
   - 建议关键词：`solar array tracker`, `photovoltaic field`, `solar panel industrial`
   - 最低要求：建议一组 3x3 或更少面板，避免面数过高
4. `gas-turbine.glb`
   - 对应页面设备：燃气轮机区
   - 建议关键词：`gas turbine package`, `industrial turbine skid`, `combined heat and power turbine`
   - 最低要求：要有明显机组轮廓，不必追求内部细节
5. `hydrogen-storage-tank.glb`
   - 对应页面设备：储氢罐区
   - 建议关键词：`hydrogen storage tank`, `cryogenic storage vessel`, `industrial pressure vessel`
   - 最低要求：双罐或多罐组合优先，便于替换当前白模
6. `battery-energy-storage.glb`
   - 对应页面设备：储能模块区
   - 建议关键词：`battery energy storage container`, `BESS container`, `industrial battery cabinet`
   - 最低要求：箱体化、柜体化资源优先

## 资源筛选标准

1. 优先 `.glb`，其次 `.gltf + bin + textures`，不要放 FBX/MAX 原文件进仓库。
2. 单个模型建议控制在 3MB 到 12MB；超过 15MB 先在 Blender 做抽稀和贴图压缩。
3. 原点尽量放在设备底部中心，正前方统一朝向 Z 轴正方向，方便直接落位。
4. 网格命名尽量包含主语义，例如 `Electrolyzer_Main`, `Tank_A`, `Solar_Row_01`。
5. 材质不必写实，前端会继续覆盖为数字孪生科技风。

## 建议下载渠道

1. Sketchfab：工业类资源最多，先筛 `Downloadable` 和 `glb`。
2. CGTrader：付费模型质量稳定，适合买单体设备。
3. TurboSquid：燃机、储罐类资源相对多。
4. BlenderKit：适合先找可替代的免费占位资源。

## Blender 入仓前处理

1. 删除看不到的内部零件和螺栓级细节。
2. 合并过碎的 mesh，保留 3 到 10 个语义分组即可。
3. 应用 `Ctrl + A` 的旋转与缩放，再导出 `glb`。
4. 如贴图过大，压缩到 1K 或直接改成纯色材质。
5. 导出后在浏览器确认模型朝向、比例和原点是否正确。

## 当前替换策略

- 当前代码仍以程序化白模作为默认渲染。
- 真实模型资源准备齐后，按设备类别逐一替换，不要求一次性全部完成。
- 建议优先顺序：`solar-array.glb` -> `hydrogen-storage-tank.glb` -> `battery-energy-storage.glb` -> `gas-turbine.glb` -> `chlor-alkali-electrolyzer.glb` -> `pem-fuel-cell.glb`。
