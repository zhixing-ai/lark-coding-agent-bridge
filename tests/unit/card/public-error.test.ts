import { describe, expect, it } from 'vitest';
import {
  RETRYABLE_SERVICE_MESSAGE,
  userFacingAgentFailure,
} from '../../../src/card/public-error.js';

describe('user-facing agent failures', () => {
  it.each([
    '身份验证失败。API错误：403 您已达到当前计费周期的使用上限',
    'claude exited with code 75: Kimi Coding Plan 暂时不可用，请稍后重试 (broker request failed: TimeoutError)',
    'API Error: 429 quota exceeded',
    'authentication failed: invalid token',
  ])('hides provider details and asks the user to retry: %s', (message) => {
    const rendered = userFacingAgentFailure(message);

    expect(rendered).toBe(RETRYABLE_SERVICE_MESSAGE);
    expect(rendered).not.toMatch(/kimi|403|429|quota|token|broker|计费周期/i);
  });

  it('preserves unrelated agent failures for diagnosis', () => {
    expect(userFacingAgentFailure('working directory does not exist')).toBe(
      'agent 失败：working directory does not exist',
    );
  });
});
