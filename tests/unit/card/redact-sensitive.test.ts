import { describe, expect, it } from 'vitest';
import { redactSensitiveText } from '../../../src/card/redact-sensitive.js';
import { richTextMarkdownError } from '../../../src/card/text-renderer.js';

describe('sensitive tool text redaction', () => {
  it('redacts token flags, app IDs, and user home paths', () => {
    const raw = [
      'lark-cli base +field-list --base-token Cr6f-secret',
      '--app-secret="top secret" --token=abc123',
      'app cli_0123456789abcdef at /home/yunlian/app/private/run.sh',
      'mac path /Users/alice/work/repo/file.ts',
    ].join('\n');
    const redacted = redactSensitiveText(raw);

    expect(redacted).toContain('--base-token ****');
    expect(redacted).toContain('--app-secret ****');
    expect(redacted).toContain('--token ****');
    expect(redacted).toContain('cli_****');
    expect(redacted).toContain('~/app/private/run.sh');
    expect(redacted).toContain('~/work/repo/file.ts');
    expect(redacted).not.toMatch(/Cr6f-secret|top secret|abc123|yunlian|alice/);
  });
});

describe('rich text markdown validation', () => {
  it('accepts valid markdown and rejects broken payload sentinels and unicode', () => {
    expect(richTextMarkdownError('正常 **Markdown**')).toBeUndefined();
    expect(richTextMarkdownError('[Invalid rich text JSON]')).toBe('invalid-rich-text-sentinel');
    expect(richTextMarkdownError(`broken ${String.fromCharCode(0xd800)}`)).toBe(
      'unpaired-high-surrogate',
    );
  });
});
