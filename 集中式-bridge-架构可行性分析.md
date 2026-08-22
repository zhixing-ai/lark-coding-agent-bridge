# 集中式 Bridge 架构可行性分析

> 分析对象：`lark-coding-agent-bridge`（`git@github.com:zarazhangrui/lark-coding-agent-bridge.git`）
> 
> 结论：部分可行，但不能直接把当前 bridge 搬到服务器运行，需要把 "bridge 层" 和 "agent 执行层" 解耦。

---

## 一、当前架构长什么样

`lark-channel-bridge` 是一个 Node.js 写的飞书/ Lark 机器人桥接器，核心作用是把飞书消息转发给本地 Claude Code 或 Codex CLI，并把 agent 的流式输出回写到飞书卡片/文本。

关键模块：

| 模块 | 文件 | 职责 |
|------|------|------|
| 飞书通道 | `src/bot/channel.ts` | WebSocket 连接飞书、收消息、发卡片、处理交互回调 |
| Agent 适配器 | `src/agent/claude/adapter.ts`、`src/agent/codex/adapter.ts` | spawn `claude` / `codex` 子进程 |
| 运行执行器 | `src/runtime/run-executor.ts` | 调度 run、并发池、事件 fanout |
| 会话/工作区 | `src/session/store.ts`、`src/workspace/store.ts` | 本地文件持久化 |
| 配置/密钥 | `src/config/app-paths.ts`、`src/config/keystore.ts` | `~/.lark-channel` 下的一切 |
| 媒体附件 | `src/media/cache.ts` | 下载飞书图片/文件到本地 |
| 进程锁 | `src/runtime/locks.ts`、`src/runtime/registry.ts` | 防止同一 app 多开 |
| 守护进程 | `src/daemon/*.ts`、`src/cli/commands/service.ts` | 本机 launchd / systemd / Task Scheduler |

启动入口在 `src/cli/commands/start.ts`，做的事情大致是：

1. 解析 profile 和配置；
2. 检查 `claude` / `codex` 二进制是否可用；
3. 创建 `SessionStore`、`WorkspaceStore`；
4. 创建 `ClaudeAdapter` / `CodexAdapter`；
5. `startChannel()` 连接飞书 WebSocket；
6. 收到消息后 spawn 子进程执行 agent；
7. 把 agent 事件流渲染成飞书卡片或文本。

---

## 二、集中化的核心矛盾

这个 bridge 同时承担了两个角色，但它们的理想部署位置不一样：

| 角色 | 理想位置 | 当前耦合 |
|------|----------|----------|
| **飞书网关 + 消息编排** | 服务器/容器（集中） | 和 agent 在同一进程 |
| **运行 claude/codex + 操作用户项目文件** | 靠近代码的地方（用户 Mac 或用户容器） | 和 bridge 在同一进程 |

**所以问题不是 bridge 能不能集中，而是 agent 执行层能不能从 bridge 里拆出去。**

---

## 三、当前代码里的硬约束

### 3.1 Agent 子进程强依赖本地文件系统

`src/agent/claude/adapter.ts`：

```ts
const child = spawnProcess(this.binary, args, {
  cwd: opts.cwd,        // 用户项目目录
  env: mergeProcessEnv(process.env, buildLarkChannelEnv(this.larkChannel)),
  stdio: ['ignore', 'pipe', 'pipe'],
});
```

`claude` / `codex` 必须在 `cwd` 里读写文件。如果 bridge 在服务器上、代码在用户 Mac 上，这个 `cwd` 对服务器上的进程来说不存在。

### 3.2 lark-cli 配置和用户身份是本地绑定的

`src/config/app-paths.ts`：

```ts
larkCliConfigDir: join(profileDir, 'lark-cli'),
larkCliSourceConfigFile: join(profileDir, 'lark-cli-source', 'config.json'),
```

`src/agent/lark-channel-env.ts` 启动 agent 时会注入：

```ts
LARK_CHANNEL_HOME=...
LARK_CHANNEL_CONFIG=...
LARKSUITE_CLI_CONFIG_DIR=...
```

agent 里调用的 `lark-cli` 工具会读这些目录里的配置。如果 bridge 在服务器上，lark-cli 的 OAuth 授权、keychain、个人资源访问都必须在服务器上完成，而不是在用户 Mac 上。

### 3.3 媒体/附件下载到本地

`src/bot/channel.ts`：

```ts
const media = new MediaCache(channel, deps.appPaths?.mediaDir);
const attachments = await media.resolve(resourceItems, controls.profileConfig.attachments);
```

图片、文件先落到 `~/.lark-channel/profiles/<profile>/media/`，然后 agent 才能读取。集中化后，这个 media 目录要么能被 agent 访问，要么需要转发给 agent。

### 3.4 所有状态都是本地文件

- `sessions.json`：会话状态
- `sessions.json.catalog.json`：agent-aware session catalog
- `workspaces.json`：命名工作区
- `secrets.enc`：加密密钥
- `.keystore.salt`：keystore 盐

这些全部基于本地文件系统。如果集中部署多实例，要么共享存储，要么改写成数据库存储。

### 3.5 进程锁和注册表假设单节点

`src/runtime/locks.ts` 用本地文件锁防止同一 app 启动多个 bridge；`src/runtime/registry.ts` 用本地 JSON 文件记录进程信息。集中化后需要替换成分布式锁（Redis、etcd、数据库行锁等）。

### 3.6 守护进程命令面向本机

`src/daemon/launchd.ts`、`src/daemon/systemd.ts`、`src/daemon/schtasks.ts` 和 `src/cli/commands/service.ts` 都是把 bridge 注册成本机后台服务。集中式架构下这些命令基本要重写或废弃。

---

## 四、可行路线

### 路线 A：Agent 仍在用户 Mac，Bridge 在服务器（远程 agent 协议）

```
用户 Mac: claude/codex + 项目文件
          ↑↓ 自定义协议（gRPC / WebSocket / stdin 转发）
服务器:   bridge + Feishu WS + 状态存储
```

#### 需要做什么

1. 在用户 Mac 上跑一个轻量 **agent gateway**（agent worker）。
2. gateway 负责：
   - spawn `claude` / `codex`；
   - 读/写用户本地文件；
   - 执行本地工具（包括 `lark-cli`，使用用户自己的授权）；
   - 把 agent 事件流转发给服务器 bridge。
3. 服务器 bridge 负责：
   - 连接飞书 WebSocket；
   - 维护会话、工作区、权限、卡片渲染；
   - 把 prompt 和附件发给 agent gateway；
   - 接收事件流并更新飞书卡片。
4. 定义 bridge 与 gateway 之间的远程协议，覆盖当前 `AgentRunOptions` 和 `AgentEvent` 的全部语义。

#### 优点

- 真正实现了"用户 Mac 只跑 agent"；
- 用户代码、lark-cli 授权、keychain 都不出本机；
- bridge 可以集中监控、重启、扩缩容。

#### 缺点/风险

- 工作量大，相当于把 `AgentAdapter` 网络化；
- 文件附件需要决定由谁下载（bridge 下载后转发给 gateway，还是 gateway 直接从飞书拉）；
- 网络抖动会影响 agent 事件流，需要重连和会话恢复机制；
- gateway 需要认证，防止任何人连上来 spawn agent。

---

### 路线 B：把整个开发环境也集中化（bridge + agent 同机）

```
服务器/容器: bridge + claude/codex + 项目文件（挂载 NFS/云盘/代码仓库）
用户:        只在飞书里聊天
```

#### 需要做什么

1. 把用户代码同步/挂载到服务器（Git、NFS、rsync、Cloud IDE、持久化卷等）。
2. 在服务器上安装并登录 `claude` / `codex`（API key / Anthropic 账号）。
3. 如果需要 lark-cli，OAuth 和个人资源授权也在服务器上完成；或者禁用个人资源功能，只用 bot identity。
4. 把 `~/.lark-channel` 挂载成持久化存储，或多实例时改用共享存储/数据库。

#### 优点

- 改动相对小，agent spawn 逻辑几乎不用改；
- 容易实现统一监控和重启。

#### 缺点/风险

- 安全和隐私模型完全改变：用户代码要上传到服务器；
- lark-cli 个人授权无法简单复用；
- 文件系统性能（NFS/云盘）可能影响 agent 体验；
- 多用户隔离、资源配额、权限控制变成必须解决的问题。

---

## 五、直接回答"真的能行吗？"

**不是直接能行。**

当前 `lark-channel-bridge` 是一个**本机桥接器**，不是为远程/集中化设计的。如果直接把它 docker 化丢到服务器上跑，至少会遇到：

1. agent 找不到用户项目文件；
2. lark-cli 个人授权在服务器上不存在；
3. 附件下载到服务器，agent 看不到用户发的图；
4. 多实例时锁和 session 会冲突；
5. 用户 Mac 上的 `claude` 登录态（Claude Pro、cookie、keychain）无法被服务器使用。

**但架构上可以拆。** 最干净的拆分是：

- **bridge = 飞书网关 + 会话编排 + 卡片渲染** → 集中化、无状态、可监控。
- **agent worker = 跑在靠近代码的地方**（用户 Mac 或用户容器） → 负责 spawn agent 和操作文件。
- 两者通过远程协议连接。

---

## 六、建议的下一步

如果决定推进，建议先做 **PoC 验证路线 A 的关键假设**：

1. 在用户 Mac 起一个最小 agent gateway，暴露本地 claude spawn + event stream。
2. 在服务器起一个 bridge，让它通过 WebSocket 连到 gateway，而不是本地 spawn。
3. 验证文件附件怎么传：是让 gateway 直接下载飞书附件，还是 bridge 下载后转发给 gateway。

PoC 能验证三件事：

- 延迟是否可接受；
- 事件流远程传输是否稳定；
- 文件/附件同步是否可行。

如果 PoC 发现这三件事任何一件难以接受，再回退到路线 B，或采用混合方案。

---

## 七、关键决策点

| 问题 | 路线 A | 路线 B |
|------|--------|--------|
| 用户代码放在哪 | 用户 Mac | 服务器 |
| claude/codex 登录态 | 用户 Mac | 服务器 |
| lark-cli 个人授权 | 用户 Mac | 服务器或禁用 |
| 文件附件访问 | 需要转发协议 | 同机直接访问 |
| 部署复杂度 | 高 | 中 |
| 安全/隐私边界 | 清晰 | 模糊 |
| 统一监控/重启 | 可实现 | 最容易 |

最终选哪条，取决于一个关键判断：**能不能接受用户代码和 agent 执行环境离开用户本机？**

---

*文档生成时间：2026-06-12*
