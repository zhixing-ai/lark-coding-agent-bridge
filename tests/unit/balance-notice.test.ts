import { describe, expect, it, vi } from 'vitest';
import type { NormalizedMessage } from '@larksuite/channel';
import { BALANCE_NOTICE, createBalanceNoticeHandler } from '../../src/bot/balance-notice';

const message = (patch = {}) => ({
  chatId: 'chat', messageId: 'message', chatType: 'p2p', content: '/run dangerous',
  senderId: 'user', resources: [], mentionedBot: false,
  rawContentType: 'text', mentions: [], mentionAll: false, createTime: 1, ...patch,
} as NormalizedMessage);

describe('balance-only responder', () => {
  it('responds to text, commands and attachments with the same free notice', async () => {
    const send = vi.fn().mockResolvedValue({ messageId: 'receipt' });
    const handle = createBalanceNoticeHandler({ send });
    for (const [i, content] of ['hello', '/run do something', '<image/>'].entries()) {
      await handle(message({ messageId: String(i), content }));
    }
    expect(send).toHaveBeenCalledTimes(3);
    expect(send.mock.calls.every((c) => c[1].text === BALANCE_NOTICE)).toBe(true);
    expect(BALANCE_NOTICE).not.toMatch(/欠款|负债|补扣/);
  });
  it('ignores group chatter, answers mentions in the same topic, deduplicates pushes', async () => {
    const send = vi.fn().mockResolvedValue({ messageId: 'receipt' });
    const handle = createBalanceNoticeHandler({ send });
    await handle(message({ chatType: 'group' }));
    expect(send).not.toHaveBeenCalled();
    const msg = message({ chatType: 'group', mentionedBot: true, threadId: 'thread' });
    await Promise.all([handle(msg), handle(msg)]);
    await handle(msg);
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0]![2]).toEqual({ replyTo: 'message', replyInThread: true });
  });
  it('permits retry after failure without invoking any model fallback', async () => {
    const send = vi.fn().mockRejectedValueOnce(new Error('network')).mockResolvedValue({ messageId: 'receipt' });
    const handle = createBalanceNoticeHandler({ send });
    await expect(handle(message())).rejects.toThrow('network');
    await handle(message());
    expect(send).toHaveBeenCalledTimes(2);
  });
});
