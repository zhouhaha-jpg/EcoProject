# EcoProject 后端

Node.js + Express + SQLite，提供数据集 API 与 Agent 对话接口。

## 启动

```bash
cd server
npm install
npm run dev
```

默认端口：`3007`（可通过环境变量 `PORT` 修改）

## API

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | /api/datasets | 数据集列表 |
| GET | /api/datasets/default | 默认数据集（完整数据） |
| GET | /api/datasets/:id | 指定 ID 的数据集 |
| POST | /api/chat | Agent 对话（需配置 API Key） |

## 数据库

- 使用 SQLite，文件：`server/db/eco.db`
- 首次启动自动执行 schema 并插入种子数据
- 表结构：`datasets`（id, name, data JSON, created_at）

## 前端代理

开发时 Vite 将 `/api` 代理到 `http://localhost:3007`，见 `vite.config.ts`。
