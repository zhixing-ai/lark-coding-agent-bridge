# lark-coding-agent-bridge 仓库须知

飞书/Lark 消息与本地 CLI 编码 Agent 的桥接服务（npm 包名 `lark-channel-bridge`）。包管理器用 **pnpm 10**，不要用 npm/yarn 安装依赖。

## Git 远程布局（重要，别推错）

- `origin` = `zarazhangrui/lark-coding-agent-bridge`：**公开上游，本机没有写权限**，push 必被拒（本机 SSH key 是 GitHub 用户 `LiamMorgen`）。只用于 `git fetch` / `git rebase origin/main` 吸收官方更新。
- `zhixing` = `zhixing-ai/lark-coding-agent-bridge`：**我们的 fork，推送目标**。所有本地提交推这里：`git push zhixing main`。

同步上游的标准流程和分叉控制红线见
`../claude-code-sandbox-ops/docs/lark-channel-bridge上游同步与分叉控制规范.md`，要点：

1. 开发前 `git fetch origin && git rebase origin/main`。
2. 推送前再 rebase 一次，并确认 `git rev-list --left-right --count HEAD...zhixing/main` 远端不领先。
3. 同一提交可能已以旧 hash 存在于 `zhixing/main`（别处推过、本地又 rebase 改写过的场景）。推送被拒先 `git fetch zhixing && git cherry -v zhixing/main main`：标记 `-` 的是内容等价已存在的提交，`git rebase zhixing/main` 会自动跳过，不要强推。

## 常用命令

```bash
pnpm install
pnpm build        # vite 构建 web + tsup 打包 dist
pnpm test         # 全量 vitest（含 pretest 构建 web）
pnpm typecheck    # tsc --noEmit
pnpm ci:local     # diff 检查 + 测试 + 类型检查 + 构建
```

## 本机部署形态

生产运行的不是这个源码目录，而是全局 npm 包：

- 安装位置：`/usr/local/lib/node_modules/lark-channel-bridge`（root 所有，升级要 `sudo /usr/local/bin/npm i -g lark-channel-bridge@latest`）。
- 服务：`systemctl --user` 单元 `lark-channel-bridge.bot.claudecode-ops.service`（`~/.config/systemd/user/` 下），升级包之后必须 `systemctl --user restart` 才生效。
- 改源码上线前必须 `pnpm build`，禁止只改线上 `dist/cli.js` 当最终方案（应急热补丁规则见上游同步规范第 4 节）。

版本基线：2026-09-13 线上从 0.2.2 升级到 0.7.1，本仓库代码与 `zhixing/main` 一致。
