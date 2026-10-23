import type { CcApiClient } from '@clevercloud/client/cc-api-client.js';
import { beforeAll, describe, expect, it } from 'vitest';
import { ACTIONS, findAction, offersAction, shellQuote, type ActionContext } from './actions.js';
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

  it('rename an application or an add-on, only to a new name', () => {
    const rename = findAction('rename')!;
    const withApp: ActionContext = { ...ctx, app: { name: 'api' } as NonNullable<ActionContext['app']> };
    expect(rename.fields(withApp, {})[0].default).toBe('api');
    expect(rename.cli(withApp, { name: "Joe's api" })).toBe(`clever config set name 'Joe'\\''s api' --app app_1`);
    expect(rename.ready!(withApp, { name: ' api ' })).toBe(false);
    expect(rename.ready!(withApp, { name: '  ' })).toBe(false);
    expect(rename.ready!(withApp, { name: 'api-v2' })).toBe(true);
    // Before the page has the application, the summary gives the name.
    const orga = { applications: [{ id: 'app_1', name: 'from-summary' }], addons: [] } as unknown as NonNullable<
      ActionContext['orga']
    >;
    expect(rename.fields({ ...ctx, orga }, {})[0].default).toBe('from-summary');

    const addonRename = findAction('addon-rename')!;
    expect(addonRename.target).toBe('addon');
    const addon = { id: 'addon_1', name: 'db', providerId: 'postgresql-addon' } as NonNullable<ActionContext['addon']>;
    const onAddon: ActionContext = { ...ctx, appId: '', addon };
    expect(addonRename.cli(onAddon, { name: 'main db' })).toBe("clever addon rename addon_1 'main db' --org orga_1");
    expect(addonRename.ready!(onAddon, { name: 'db' })).toBe(false);
  });

  it('refuse to rename the add-on of the views sync', async () => {
    const sync = { id: 'addon_9', name: 'clever-visual-cli', providerId: 'config-provider' } as NonNullable<
      ActionContext['addon']
    >;
    const personal: ActionContext = { ...ctx, ownerId: 'user_1', appId: '', addon: sync };
    await expect(findAction('addon-rename')!.run(personal, { name: 'other' })).rejects.toThrow(
      t('action.rename.syncAddon'),
    );
  });

  it('offer add-on actions for their providers only', () => {
    const create = findAction('cellar-bucket-create')!;
    expect(offersAction(create, 'addon', 'cellar-addon')).toBe(true);
    expect(offersAction(create, 'addon', 'postgresql-addon')).toBe(false);
    expect(offersAction(create, 'app')).toBe(false);
    expect(offersAction(findAction('addon-rename')!, 'addon', 'postgresql-addon')).toBe(true);
    expect(offersAction(findAction('restart')!, 'app')).toBe(true);
  });

  it('create a bucket, then open it', async () => {
    const cellar = { id: 'addon_1', realId: 'cellar_2', name: 'files', providerId: 'cellar-addon' } as NonNullable<
      ActionContext['addon']
    >;
    const sent: string[] = [];
    const client = {
      send: async (command: object) => {
        sent.push(command.constructor.name);
        return {};
      },
    } as unknown as CcApiClient;
    const onCellar: ActionContext = { ...ctx, client, appId: '', addon: cellar };
    const create = findAction('cellar-bucket-create')!;
    expect(create.cli(onCellar, { name: 'assets', versioning: true })).toContain('/cellar/cellar_2/buckets');
    const result = await create.run(onCellar, { name: ' assets ', versioning: true });
    expect(result).toMatchObject({ addonTab: 'buckets', params: { bucket: 'assets', prefix: null }, refresh: true });
    expect(sent).toEqual(['CreateCellarBucketCommand']);
  });

  it('change the branch of a GitHub-linked application only', () => {
    const branch = findAction('branch')!;
    const githubApp = {
      branch: 'prod',
      branches: ['dev', 'main', 'prod'],
      deployment: { type: 'GIT', httpUrl: 'https://github.com/serli/ui-kit.git', url: '', repoState: 'NOT_NEEDED' },
      oauthApp: { type: 'github', secret: '', webhookUrl: '' },
    } as unknown as NonNullable<ActionContext['app']>;
    const cleverApp = {
      ...githubApp,
      branch: 'master',
      deployment: { type: 'GIT', url: 'git+ssh://push.clever-cloud.com/app_1.git', repoState: 'CREATED' },
      oauthApp: undefined,
    } as unknown as NonNullable<ActionContext['app']>;
    const onGithub: ActionContext = { ...ctx, app: githubApp };
    const [field] = branch.fields(onGithub, {});
    expect(field.options?.map((option) => option.value)).toEqual(['dev', 'main', 'prod']);
    expect(field.default).toBe('prod');
    expect(branch.ready!(onGithub, { branch: 'prod' })).toBe(false);
    expect(branch.ready!(onGithub, { branch: 'dev' })).toBe(true);
    expect(branch.cli(onGithub, { branch: 'dev' })).toContain('/applications/app_1/branch');
    expect(offersAction(branch, 'app', undefined, githubApp)).toBe(true);
    expect(offersAction(branch, 'app', undefined, cleverApp)).toBe(false);
  });

  it('offer a restart after a branch change, which deploys nothing by itself', async () => {
    const client = { send: async () => undefined } as unknown as CcApiClient;
    const app = {
      branch: 'prod',
      deployment: { type: 'GIT', httpUrl: 'https://github.com/serli/ui-kit.git', url: '', repoState: 'NOT_NEEDED' },
      oauthApp: { type: 'github', secret: '', webhookUrl: '' },
    } as unknown as NonNullable<ActionContext['app']>;
    const result = await findAction('branch')!.run({ ...ctx, client, app }, { branch: 'dev' });
    expect(result.followUp?.actionId).toBe('restart');
    expect(result.deploymentId).toBeUndefined();
  });

  it('cancel a deployment and say which one, so its logs can stay', async () => {
    const client = { send: async () => undefined } as unknown as CcApiClient;
    const result = await findAction('cancel-deploy')!.run({ ...ctx, client }, { deploymentId: 'deployment_9' });
    expect(result).toMatchObject({ cancelledDeploymentId: 'deployment_9', navigateTo: 'deployments' });
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
