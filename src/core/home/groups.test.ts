import { describe, expect, it } from 'vitest';
import type { AddonSummary, ApplicationSummary } from '../../data/api.js';
import { buildGroups, linkedAddons, projectOf, stackName, type GroupingContext } from './groups.js';

function app(
  id: string,
  name: string,
  tags: string[] = [],
  state: ApplicationSummary['state'] = 'SHOULD_BE_UP',
): ApplicationSummary {
  return {
    id,
    name,
    instanceType: 'node',
    variantName: 'Node.js',
    variantSlug: 'node',
    isArchived: false,
    isZeroDowntimeDeploymentEnabled: false,
    variantLogoUrl: '',
    state,
    commitId: '',
    systemTags: [],
    customerTags: tags,
  };
}

function addon(id: string, name: string, providerId: string, tags: string[] = []): AddonSummary {
  return { id, name, realId: id, providerId, logoUrl: '', systemTags: [], customerTags: tags };
}

const apps = [
  app('web', 'shop-web', ['project:shop:prod', 'env:prod']),
  app('api', 'shop-api', ['project:shop:prod', 'env:prod']),
  app('worker', 'shop-worker'),
  app('blog', 'blog', ['project:blog']),
  app('lonely', 'lonely-app'),
];
const addons = [
  addon('pg', 'shop-db', 'postgresql-addon', ['project:shop:prod']),
  addon('redis', 'worker-cache', 'redis-addon'),
  addon('config', 'global-config', 'config-provider'),
  addon('kc', 'sso', 'keycloak'),
  addon('bucket', 'old-bucket', 'cellar-addon'),
];
const context: GroupingContext = {
  apps,
  addons,
  links: {
    web: { addonIds: ['pg', 'config', 'kc'], applicationIds: ['api'] },
    api: { addonIds: ['pg', 'config'], applicationIds: [] },
    worker: { addonIds: ['redis', 'config'], applicationIds: [] },
    blog: { addonIds: ['kc'], applicationIds: [] },
    lonely: { addonIds: [], applicationIds: [] },
  },
  stateLabel: (state) => state.toLowerCase(),
};

const summarise = (mode: Parameters<typeof buildGroups>[0]) =>
  buildGroups(mode, context)
    .filter((group) => group.apps.length + group.addons.length > 0)
    .map(
      (group) => `${group.name}[${group.kind}]: ${[...group.apps, ...group.addons].map((item) => item.id).join(',')}`,
    );

describe('home groups', () => {
  it('builds stacks from strong links only, nests lone apps with their add-ons, and sorts the rest', () => {
    expect(summarise('stack')).toEqual([
      'shop · PROD[group]: api,web,pg',
      'Applications[rest]: blog,lonely,worker,redis',
      'Add-ons partagés[shared]: config,kc',
      'Add-ons non liés[orphans]: bucket',
    ]);
    expect(buildGroups('stack', context).find((group) => group.id === 'rest')?.nested).toBe(true);
  });

  it('groups by project tag, runtime and state', () => {
    expect(summarise('project')).toEqual([
      'blog[group]: blog',
      'shop[group]: api,web,pg',
      'Sans projet[rest]: lonely,worker,config,bucket,kc,redis',
    ]);
    expect(summarise('runtime')).toEqual([
      'Node.js[group]: blog,lonely,api,web,worker',
      'cellar-addon[group]: bucket',
      'config-provider[group]: config',
      'keycloak[group]: kc',
      'postgresql-addon[group]: pg',
      'redis-addon[group]: redis',
    ]);
    expect(summarise('state')).toEqual([
      'should_be_up[group]: blog,lonely,api,web,worker',
      'Add-ons[group]: config,bucket,pg,kc,redis',
    ]);
    expect(summarise('none')).toEqual([
      'Applications[group]: blog,lonely,api,web,worker',
      'Add-ons[group]: config,bucket,pg,kc,redis',
    ]);
  });

  it('names a stack from the project tag, the common prefix, or the first name', () => {
    expect(
      stackName([app('a', 'PROD-shop-api', ['project:shop:prod']), app('b', 'PROD-shop-web', ['project:shop:prod'])]),
    ).toBe('shop · PROD');
    expect(stackName([app('a', 'shop-api', ['project:shop:prod']), app('b', 'shop-web', ['project:shop:dev'])])).toBe(
      'shop',
    );
    expect(stackName([app('a', 'shop-api', ['project:shop']), app('b', 'shop-web', ['project:shop'])])).toBe('shop');
    expect(stackName([app('a', 'meteo-api'), app('b', 'meteo-web'), app('c', 'meteo-worker')])).toBe('meteo');
    expect(stackName([app('a', 'DEV-auth-dicrim-app'), app('b', 'DEV-dicrim')])).toBe('dicrim · DEV');
    expect(stackName([app('a', 'PROD-shop-api'), app('b', 'DEV-shop-web')])).toBe('shop');
    expect(stackName([app('a', 'Alpha'), app('b', 'Bravo')])).toBe('Alpha');
    expect(
      stackName([app('a', 'DEV-alpha'), app('b', 'DEV-bravo')], [addon('pg', 'shared-db', 'postgresql-addon')]),
    ).toBe('shared-db · DEV');
    expect(stackName([app('a', 'alpha'), app('b', 'bravo')], [addon('pg', 'shared-db', 'postgresql-addon')])).toBe(
      'shared-db',
    );
    expect(stackName([app('a', 'solo')])).toBe('solo');
    expect(projectOf(['env:dev', 'project:maif-mcp:dev'])).toBe('maif-mcp');
    expect(projectOf(['env:dev'])).toBeNull();
  });

  it('lists linked add-ons with strong links first, tolerating missing links', () => {
    expect(linkedAddons('web', context).map((item) => item.id)).toEqual(['pg', 'config', 'kc']);
    expect(linkedAddons('unknown', context)).toEqual([]);
  });
});
