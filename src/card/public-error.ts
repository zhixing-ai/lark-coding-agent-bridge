const RETRYABLE_PROVIDER_ERROR_RE =
  /(?:kimi coding plan|broker request failed|claude exited with code 75|api\s*(?:error|错误)\s*[:：]?\s*(?:401|403|429)|authentication failed|身份验证失败|当前计费周期|billing cycle|usage limit|使用上限|quota exceeded|rate limit)/i;

export const RETRYABLE_SERVICE_MESSAGE = '服务暂时不可用，请重新发送消息重试。';

/** Keep provider, account, quota, and broker details out of user-visible replies. */
export function userFacingAgentFailure(message: string, prefix = 'agent 失败：'): string {
  if (RETRYABLE_PROVIDER_ERROR_RE.test(message)) return RETRYABLE_SERVICE_MESSAGE;
  return `${prefix}${message}`;
}
