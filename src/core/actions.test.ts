import type { CcApiClient } from '@clevercloud/client/cc-api-client.js';
import { beforeAll, describe, expect, it } from 'vitest';
import { ACTIONS, findAction, shellQuote, type ActionContext } from './actions.js';
import { setLocale, t } from './i18n.js';

beforeAll(() => setLocale('fr', false));

const ctx: ActionContext = {
  client: {} as CcApiClient,
  ownerId: 'orga_1',
  appId: 'app_1',
  app: null,
};

describe('actions', () => {
  it('have unique ids and a palette hint for each', () => {
    const ids = ACTIONS.map((action) => action.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const action of ACTIONS) {
      expect(action.cliHint.startsWith('clever ')).toBe(true);
    }
    expect(findAction('restart')?.title).toBe('action.restart.title');
    expect(t(findAction('restart')!.title)).toBe('Redémarrer');
    expect(findAction('nope')).toBeNull();
  });

  it('render the clever-tools equivalent from the values', () => {
    expect(findAction('restart')!.cli(ctx, {})).toBe('clever restart --app app_1');
    expect(findAction('restart')!.cli(ctx, { commit: 'abc1234', withoutCache: true })).toBe(
      'clever restart --app app_1 --commit abc1234 --without-cache',
    );
    expect(findAction('scale')!.cli(ctx, { minInstances: 1, maxInstances: 3, minFlavor: 'S', maxFlavor: 'M' })).toBe(
      'clever scale --app app_1 --min-instances 1 --max-instances 3 --min-flavor S --max-flavor M',
    );
    expect(findAction('env-set')!.cli(ctx, { name: 'URL', value: 'https://a.b/c?d=1 e' })).toBe(
      "clever env set URL 'https://a.b/c?d=1 e' --app app_1",
    );
    expect(findAction('domain-primary')!.cli(ctx, { domain: 'www.example.com' })).toBe(
      'clever domain favourite set www.example.com --app app_1',
    );
  });

  it('quote shell arguments only when needed', () => {
    expect(shellQuote('simple-value_1.0')).toBe('simple-value_1.0');
    expect(shellQuote('')).toBe("''");
    expect(shellQuote('has space')).toBe("'has space'");
    expect(shellQuote('tags/env%3Aprod')).toBe('tags/env%3Aprod');
    expect(shellQuote("it's")).toBe(`'it'\\''s'`);
  });

  it('build env-rm options from the application environment', () => {
    const withEnv: ActionContext = {
      ...ctx,
      app: {
        environment: [
          { name: 'A', value: '1' },
          { name: 'B', value: '2' },
        ],
      } as never,
    };
    const [field] = findAction('env-rm')!.fields(withEnv, { name: 'C' });
    expect(field.type).toBe('select');
    expect(field.options?.map((option) => option.value)).toEqual(['C', 'A', 'B']);
    const [textField] = findAction('env-rm')!.fields(ctx, {});
    expect(textField.type).toBe('text');
  });
});
