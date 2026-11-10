import type { LarkChannel, NormalizedMessage } from '@larksuite/channel';

export const BALANCE_NOTICE =
  '你的 AI 额度已用完，服务已暂停。请前往 https://zhixing.club/profile/pricing 充值。' +
  '充值到账后会自动恢复（通常约 15 分钟）。这条提示不消耗积分。';

/** Isolated reply-only handler. No agent, command, tool or billing dependency. */
export function createBalanceNoticeHandler(channel: Pick<LarkChannel, 'send'>) {
  const delivered = new Set<string>();
  const inFlight = new Set<string>();
  return async (msg: NormalizedMessage): Promise<void> => {
    if (msg.chatType !== 'p2p' && !msg.mentionedBot) return;
    if (!msg.messageId || delivered.has(msg.messageId) || inFlight.has(msg.messageId)) return;
    inFlight.add(msg.messageId);
    try {
      const result = await channel.send(msg.chatId, { text: BALANCE_NOTICE }, {
        replyTo: msg.messageId,
        ...(msg.threadId ? { replyInThread: true } : {}),
      });
      if (!result.messageId) throw new Error('balance notice receipt missing');
      delivered.add(msg.messageId);
      if (delivered.size > 2000) delivered.delete(delivered.values().next().value!);
    } finally {
      inFlight.delete(msg.messageId);
    }
  };
}
