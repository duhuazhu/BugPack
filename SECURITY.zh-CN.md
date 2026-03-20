[English](SECURITY.md) | 中文

# 安全策略

## 报告漏洞

如果你发现 BugPack 中的安全漏洞，请负责任地报告：

1. **不要**创建公开的 GitHub Issue
2. 直接联系维护者，或使用 [GitHub 私密漏洞报告](https://github.com/duhuazhu/BugPack/security/advisories/new)
3. 附上复现步骤

我们会在 72 小时内回复，并尽快修复。

## 范围

BugPack **100% 本地运行**。所有数据（SQLite 数据库、截图）存储在 `~/.bugpack/data/`，不会传输到外部。

MCP Server 仅通过 **stdio** 通信，无网络暴露。

## 支持版本

| 版本 | 是否支持 |
|------|----------|
| 1.x  | 是       |
| < 1.0 | 否      |
