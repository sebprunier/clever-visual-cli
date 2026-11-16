import { describe, expect, it } from 'vitest';
import type { TemplateResult } from 'lit';
import { renderMessage, runtimeSearchText, type RuntimeLine } from './logs.js';

const e = '\x1b';

const line = (message: string): RuntimeLine => ({
  id: '1',
  date: '2026-11-16T14:50:46.766Z',
  severity: 'info',
  service: 'bas-deploy',
  message,
  instanceId: 'instance',
});

describe('runtime log lines', () => {
  it('filter on the text, not on the escape codes', () => {
    const text = runtimeSearchText(
      line(`2026-11-16 14:50:46,766 [${e}[31merror${e}[0m] exporter - Name or service not known`),
    );
    expect(text).toContain('[error] exporter');
    expect(text.startsWith('bas-deploy ')).toBe(true);
  });

  it('render a plain message as text, and a coloured one as spans with classes', () => {
    expect(renderMessage(line('Response from GET / is 404'))).toBe('Response from GET / is 404');

    const parts = renderMessage(line(`[${e}[1;33mwarn${e}[0m] vaults`)) as Array<string | TemplateResult>;
    expect(parts).toHaveLength(3);
    expect(parts[0]).toBe('[');
    const span = parts[1] as TemplateResult;
    expect(span.values).toEqual(['ansi-yellow ansi-bold', 'warn']);
    expect(parts[2]).toBe('] vaults');
  });
});
