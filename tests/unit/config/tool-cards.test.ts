import { describe, expect, it } from 'vitest';
import { shouldShowToolCards, type AppConfig } from '../../../src/config/schema.js';

function config(preferences: AppConfig['preferences'] = {}): AppConfig {
  return {
    accounts: { app: { id: 'cli_test', secret: 'secret', tenant: 'feishu' } },
    preferences,
  };
}

describe('tool card visibility', () => {
  it('defaults to full in p2p and off in groups', () => {
    expect(shouldShowToolCards(config(), 'p2p', 'oc_dm')).toBe(true);
    expect(shouldShowToolCards(config(), 'group', 'oc_group')).toBe(false);
  });

  it('honors per-type modes and group allowlists', () => {
    const cfg = config({
      toolCards: { p2p: 'off', group: 'off', allowChats: ['oc_logs'] },
    });
    expect(shouldShowToolCards(cfg, 'p2p', 'oc_dm')).toBe(false);
    expect(shouldShowToolCards(cfg, 'group', 'oc_group')).toBe(false);
    expect(shouldShowToolCards(cfg, 'group', 'oc_logs')).toBe(true);
  });

  it('keeps the legacy global switch as a kill switch', () => {
    const cfg = config({
      showToolCalls: false,
      toolCards: { p2p: 'full', group: 'full', allowChats: ['oc_logs'] },
    });
    expect(shouldShowToolCards(cfg, 'p2p', 'oc_dm')).toBe(false);
    expect(shouldShowToolCards(cfg, 'group', 'oc_logs')).toBe(false);
  });
});
