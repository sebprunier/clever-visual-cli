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

  it('render only the options and the build that change', () => {
    const app = {
      hasStickySessions: false,
      isZeroDowntimeDeploymentEnabled: true,
      shouldForceHttps: false,
      cancelOnPush: true,
      hasSeparatedBuild: true,
      buildFlavor: { name: 'S' },
    } as unknown as NonNullable<ActionContext['app']>;
    const withApp: ActionContext = { ...ctx, app };
    const config = findAction('config-update')!;
    expect(config.fields(withApp, {}).map((field) => [field.name, field.default])).toEqual([
      ['hasStickySessions', false],
      ['isZeroDowntimeDeploymentEnabled', true],
      ['shouldForceHttps', false],
      ['cancelOnPush', true],
    ]);
    expect(
      config.cli(withApp, {
        hasStickySessions: true,
        isZeroDowntimeDeploymentEnabled: true,
        shouldForceHttps: false,
        cancelOnPush: false,
      }),
    ).toBe('clever config update --app app_1 --enable-sticky-sessions --disable-cancel-on-push');
    const scale = { minInstances: 1, maxInstances: 1, minFlavor: 'S', maxFlavor: 'S' };
    expect(findAction('scale')!.cli(withApp, { ...scale, buildFlavor: 'S' })).not.toContain('--build-flavor');
    expect(findAction('scale')!.cli(withApp, { ...scale, buildFlavor: 'disabled' })).toContain(
      '--build-flavor disabled',
    );
  });

  it('link and unlink services with the clever service commands', () => {
    expect(findAction('link-addon')!.cli(ctx, { addonId: 'addon_9' })).toBe(
      'clever service link-addon addon_9 --app app_1',
    );
    expect(findAction('unlink-app')!.cli(ctx, { targetAppId: 'app_2' })).toBe(
      'clever service unlink-app app_2 --app app_1',
    );
    const orga = {
      addons: [
        { id: 'addon_1', name: 'db', providerId: 'postgresql-addon' },
        { id: 'addon_2', name: 'cache', providerId: 'redis-addon' },
      ],
      applications: [],
    } as unknown as NonNullable<ActionContext['orga']>;
    const [field] = findAction('link-addon')!.fields({ ...ctx, orga }, { exclude: 'addon_1' });
    expect(field.options?.map((option) => option.value)).toEqual(['addon_2']);
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
