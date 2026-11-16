# 代码工作台

一个静态中文个人博客，包含 NOIP 2025/2026 广东名单学校人数对比文章。

## 本地预览

```powershell
python -m http.server 8000
```

然后访问 `http://localhost:8000/`。

## 文章管理

- 首页“云端写作”打开 Pages CMS。通过 GitHub 登录并安装 Pages CMS GitHub App 后，可以在任意电脑、平板或手机上新增、编辑和删除文章。
- 云端文章保存在 `content/posts.json`，图片保存在 `assets/uploads/`。配置位于 `.pages.yml`，支持 Markdown 编辑、Markdown 源码切换、图片上传和公开发布开关。
- 保存云端文章会向 GitHub 提交一次变更，GitHub Pages 通常会在几十秒内自动更新。文章地址格式为 `post.html?id=...`。
- 首页“本地草稿”仍会打开站内 Markdown 编辑器。本地草稿只保存在当前浏览器的 `localStorage` 中，不会被其他设备看到，也不会提交到仓库。
- “导出本地草稿”和“导入本地草稿”用于迁移浏览器中的未发布草稿，备份文件采用 JSON 格式。
- 本地编辑器插入的图片会先在浏览器内压缩为 WebP；单张源图最大 8 MB。云端编辑器上传的图片直接保存到 GitHub 仓库。
- 文章页的“公众号版”可生成内联样式内容，“复制到公众号”会写入富文本剪贴板，“下载 HTML”可保存独立页面。图片在公众号后台可能仍需重新上传。

GitHub Pages 是静态托管，没有服务端数据库。跨设备同步依赖 GitHub 仓库作为内容源，Pages CMS 负责登录和提交，因此不需要另外维护数据库或服务器。

## 发布

仓库推送到 GitHub 的 `main` 分支后，在仓库 `Settings → Pages` 中将 Source 设为 **Deploy from a branch**，分支选择 `main`，目录选择 `/ (root)`。站点是纯静态页面，不需要额外构建命令。

## 数据口径

- `NOIP2025.pdf`：从文字层读取 947 条名单记录。
- `NOIP2026.pdf`：扫描名单，按表格行逐格 OCR，共 1,038 条记录；校名与 2025 名单及页面上下文进行人工归一化。
- 计数单位是人次，不是学校参赛队数，也不代表官方名额或最终获奖人数。
- 汇总数据位于 `data/noip-school-counts.csv`。
