English | [中文](SECURITY.zh-CN.md)

# Security Policy

## Reporting a Vulnerability

If you discover a security vulnerability in BugPack, please report it responsibly:

1. **Do NOT** open a public GitHub issue
2. Email the maintainer directly or use [GitHub private vulnerability reporting](https://github.com/duhuazhu/BugPack/security/advisories/new)
3. Include steps to reproduce the issue

We will respond within 72 hours and work on a fix as soon as possible.

## Scope

BugPack runs **100% locally** on your machine. All data (SQLite database, screenshots) is stored in `~/.bugpack/data/` and never transmitted externally.

The MCP Server communicates via **stdio** only — no network exposure.

## Supported Versions

| Version | Supported |
|---------|-----------|
| 1.x     | Yes       |
| < 1.0   | No        |
