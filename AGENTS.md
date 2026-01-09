# 项目协作说明（AGENTS）

本项目为 Chrome 扩展：对指定网站进行遮罩处理，并提供管理页面配置多条规则。

## 目标与范围
- 提供站点遮罩能力（标题/图标替换、可见内容区域挖洞）
- 支持多条配置管理（新增/编辑/删除/启用）
- 优先保证匹配逻辑正确、配置可迁移

## 目录结构
- `manifest.json`：扩展清单（MV3）
- `content/content-script.js`：注入逻辑与匹配规则
- `content/overlay.css`：遮罩层样式
- `options/options.html`：管理页 UI
- `options/options.js`：管理页逻辑
- `options/options.css`：管理页样式

## 当前关键逻辑
- 匹配策略：按评分优先级选择规则，同分按列表顺序兜底
- URL 规则支持 `*` 通配；正则可用 `re:` 或 `/pattern/flags`
- 域名-only pattern 在保存时自动补 `/`
- 标题替换支持“原始内容（正则）+ 替换内容”
- icon 替换支持多个 `link[rel=icon]` 变体

## 数据结构（存储）
`chrome.storage.sync` 中 `sites: Rule[]`
```
Rule = {
  id: string,
  name: string,
  urlPattern: string,
  titleMaskSource: string,
  titleMaskReplacement: string,
  iconUrl: string,
  contentSelectors: string[],
  frostedLevel: number,
  desaturateLevel: number,
  enabled: boolean
}
```
兼容旧字段（如 `titleMaskText/titleMaskRegex/contentSelector`）在加载时会迁移。

## 管理页交互
- 列表为表格展示，选中行后可编辑/禁用/删除
- 新增/编辑使用弹窗表单
- 保存不弹出提示

## 开发习惯与注意事项
- 先检查当前规则匹配与渲染是否受影响
- 修改规则字段时要同步更新管理页与内容脚本
- 保持页面遮罩不阻断洞内交互

## 后续可扩展方向
- 页面内编辑（点选元素生成 selector）
- 规则排序/拖拽优先级
- 匹配逻辑可视化诊断
