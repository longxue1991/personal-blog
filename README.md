# 代码工作台

一个静态中文个人博客，包含 NOIP 2025/2026 广东名单学校人数对比文章。

## 本地预览

```powershell
python -m http.server 8000
```

然后访问 `http://localhost:8000/`。

## 发布

仓库推送到 GitHub 的 `main` 分支后，在仓库 `Settings → Pages` 中将 Source 设为 **GitHub Actions**。工作流会发布站点，不需要额外构建命令。

## 数据口径

- `NOIP2025.pdf`：从文字层读取 947 条名单记录。
- `NOIP2026.pdf`：扫描名单，按表格行逐格 OCR，共 1,038 条记录；校名与 2025 名单及页面上下文进行人工归一化。
- 计数单位是人次，不是学校参赛队数，也不代表官方名额或最终获奖人数。
- 汇总数据位于 `data/noip-school-counts.csv`。
