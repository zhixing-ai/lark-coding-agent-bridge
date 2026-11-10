/** Standalone low-balance listener. Deliberately never imports an agent runtime. */
import { createLarkChannel } from '@larksuite/channel';
import { resolveAppPaths } from './config/app-paths';
import { loadRootConfig, runtimeProfileConfig } from './config/profile-store';
import { resolveAppSecret } from './config/secret-resolver';
import { createBalanceNoticeHandler } from './bot/balance-notice';

const at = process.argv.indexOf('--profile');
if (at < 0 || !process.argv[at + 1]) throw new Error('--profile is required');
const appPaths = resolveAppPaths({ profile: process.argv[at + 1] });
const root = await loadRootConfig(appPaths.configFile);
if (!root) throw new Error('Configured bridge profile is required');
const cfg = runtimeProfileConfig(root, appPaths.profile);
const channel = createLarkChannel({
  appId: cfg.accounts.app.id,
  appSecret: await resolveAppSecret(cfg, appPaths),
  domain: cfg.accounts.app.tenant === 'lark' ? 'https://open.larksuite.com' : 'https://open.feishu.cn',
  source: 'lark-channel-bridge',
  policy: { dmMode: 'open', requireMention: true, respondToMentionAll: false },
  httpTimeoutMs: 30_000,
  respectProxyEnv: true,
  // SDK errors can contain credential-bearing HTTP objects. Only log fixed labels.
  logger: {
    trace: () => {}, debug: () => {}, info: () => {},
    warn: () => console.warn('balance-notice channel warning'),
    error: () => console.error('balance-notice channel error'),
  },
});
const handle = createBalanceNoticeHandler(channel);
channel.on({
  message: async (msg) => {
    try { await handle(msg); }
    catch { console.error('balance-notice reply failed'); }
  },
  error: () => console.error('balance-notice connection error'),
});
await channel.connect();
console.log('balance-notice connected; model calls disabled');
for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.once(signal, () => { void channel.disconnect().finally(() => process.exit(0)); });
}
