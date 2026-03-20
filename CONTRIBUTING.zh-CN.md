[English](CONTRIBUTING.md) | 中文

# 贡献指南

感谢你对 BugPack 的关注！

## 使用 BugPack

如果只是使用 BugPack，无需克隆仓库，直接通过 npm 运行：

```bash
# 启动 Web UI
npx bugpack-mcp

# 启动 MCP Server（供 AI 编程工具使用）
npx bugpack-mcp --mcp
```

## 贡献代码

参与 BugPack 开发：

1. Fork 并克隆仓库
2. `npm install`
3. `npm run dev:all` 启动开发模式（前端 + 后端热重载）
4. 在 `feature/xxx` 分支上开发
5. 提交 PR

## 开发命令

| 命令 | 说明 |
|------|------|
| `npm run dev:all` | 启动前端 + 后端（开发模式） |
| `npm run build` | 生产构建 |

## 项目结构

```
src/
├── client/                # React 前端
│   ├── components/        # UI 组件
│   ├── stores/            # Zustand 状态管理
│   ├── hooks/             # 自定义 Hooks
│   ├── i18n/              # 国际化（中文/英文）
│   └── utils/             # 工具函数（指令生成）
├── server/                # Express 后端
│   ├── routes/            # API 路由
│   └── db.ts              # SQLite 数据库
└── mcp/                   # MCP Server（stdio 传输）
```

## 规范

- 提交前确保 `npx tsc --noEmit` 通过
- 如涉及界面文案，需同时更新 `src/client/i18n/` 中的中英文文件
