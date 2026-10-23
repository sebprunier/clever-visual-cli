import { beforeAll, describe, expect, it } from 'vitest';
import {
  nameWords,
  planSmartTags,
  suggestSmartTags,
  type SmartTagContext,
  type SmartTagResource,
  type SmartTagSuggestion,
} from './smart-tags.js';
import { setLocale } from '../i18n.js';

beforeAll(() => setLocale('fr', false));

const app = (name: string, tags: string[] = [], type = 'node'): SmartTagResource => ({
  id: `app_${name}`,
  kind: 'app',
  name,
  tags,
  type,
});
const addon = (name: string, type: string, tags: string[] = []): SmartTagResource => ({
  id: `addon_${name}`,
  kind: 'addon',
  name,
  tags,
  type,
});
/** The organisation: `resources`, and resources whose names say nothing, there only for their `tags`. */
const context = ({
  resources = [],
  tags = [],
  links = {},
}: { resources?: SmartTagResource[]; tags?: string[]; links?: SmartTagContext['links'] } = {}): SmartTagContext => ({
  resources: [...resources, ...tags.map((tag, index) => app(`api-${index}`, [tag]))],
  links,
});
const link = (appId: string, addonIds: string[], applicationIds: string[] = []) => ({
  [appId]: { addonIds, applicationIds },
});
/** The proposals by resource name, a not picked one between parentheses. */
const outline = (suggestions: SmartTagSuggestion[]) =>
  Object.fromEntries(
    suggestions.map(({ resource, proposals }) => [
      resource.name,
      proposals.map((proposal) => (proposal.picked ? proposal.tag : `(${proposal.tag})`)),
    ]),
  );

describe('words of a name', () => {
  it('cuts on any separator and on camel case, without case or accents', () => {
    expect(nameWords('DEV-ds-maif-api')).toEqual(['dev', 'ds', 'maif', 'api']);
    expect(nameWords('ds_maif.db DEV')).toEqual(['ds', 'maif', 'db', 'dev']);
    expect(nameWords('dsMaifCellar')).toEqual(['ds', 'maif', 'cellar']);
    expect(nameWords('[PROD] MyAPIServer')).toEqual(['prod', 'my', 'api', 'server']);
    expect(nameWords('Évènements-Pré-Prod')).toEqual(['evenements', 'preprod']);
  });
});

describe('smart tags', () => {
  it('reads the environment and the project the names share', () => {
    const suggestions = suggestSmartTags(
      [
        app('DEV-ds-maif-api'),
        addon('DEV-ds-maif-db', 'postgresql-addon'),
        addon('DEV-ds-maif-cellar', 'cellar-addon'),
      ],
      context(),
    );
    expect(outline(suggestions)).toEqual({
      'DEV-ds-maif-api': ['env:dev', 'project:ds-maif'],
      'DEV-ds-maif-db': ['env:dev', 'project:ds-maif'],
      'DEV-ds-maif-cellar': ['env:dev', 'project:ds-maif'],
    });
    expect(suggestions[0].proposals.map((proposal) => proposal.reason)).toEqual([
      { kind: 'env', word: 'dev' },
      { kind: 'shared', count: 3 },
    ]);
  });

  it('finds them wherever they sit, whatever the separators and the synonyms', () => {
    const suggestions = suggestSmartTags(
      [
        app('api-ds-maif-development'),
        addon('maif_ds_pg_dev', 'postgresql-addon'),
        addon('cellarDsMaifDev', 'cellar-addon'),
        app('ds-maif-worker-v2-dev'),
      ],
      context(),
    );
    expect(Object.values(outline(suggestions))).toEqual(Array(4).fill(['env:dev', 'project:ds-maif']));
  });

  it('keeps the words the selection shares, not the part each name adds', () => {
    expect(
      outline(
        suggestSmartTags(
          [app('shop-front-prod'), app('shop-payment-api-prod'), addon('shop-payment-prod-db', 'postgresql-addon')],
          context(),
        ),
      ),
    ).toEqual({
      'shop-front-prod': ['env:prod', 'project:shop'],
      'shop-payment-api-prod': ['env:prod', 'project:shop'],
      'shop-payment-prod-db': ['env:prod', 'project:shop'],
    });
  });

  it('splits a selection of several projects, and leaves a name that matches none as a guess', () => {
    expect(
      outline(
        suggestSmartTags(
          [
            app('blog-api-staging'),
            addon('blog-db-staging', 'mysql-addon'),
            app('crm-front-qa'),
            app('crm-back-qa'),
            app('lonely-thing'),
          ],
          context(),
        ),
      ),
    ).toEqual({
      'blog-api-staging': ['env:staging', 'project:blog'],
      'blog-db-staging': ['env:staging', 'project:blog'],
      'crm-front-qa': ['env:qa', 'project:crm'],
      'crm-back-qa': ['env:qa', 'project:crm'],
      'lonely-thing': ['(project:lonely-thing)'],
    });
  });

  it('reads a selection without a common word family by family, the words of a family apart or not', () => {
    expect(
      outline(
        suggestSmartTags(
          [
            app('ff-acme-api-dev-app'),
            addon('ff-acme-dev-data', 'postgresql-addon'),
            app('acme-home-next'),
            app('acme-home-prod-app'),
            app('dune-api-hazel', [], 'docker'),
            app('dune-console-hazel', [], 'docker'),
            app('host-c5175a.example.com'),
            app('host-b7609a.example.com'),
          ],
          context(),
        ),
      ),
    ).toEqual({
      'ff-acme-api-dev-app': ['env:dev', 'project:ff-acme'],
      'ff-acme-dev-data': ['env:dev', 'project:ff-acme'],
      'acme-home-next': ['(env:prod)', 'project:acme-home'],
      'acme-home-prod-app': ['env:prod', 'project:acme-home'],
      'dune-api-hazel': ['project:dune-hazel'],
      'dune-console-hazel': ['project:dune-hazel'],
      'host-c5175a.example.com': ['project:example'],
      'host-b7609a.example.com': ['project:example'],
    });
  });

  it('follows the keys and the spelling of the organisation, and its other known values', () => {
    const tagsInUse = ['environment:production', 'environment:development', 'environment:development', 'client:maif'];
    expect(
      outline(suggestSmartTags([app('prod-ds-maif-api'), app('ds-maif-front-dev')], context({ tags: tagsInUse }))),
    ).toEqual({
      'prod-ds-maif-api': ['environment:production', 'project:ds-maif', 'client:maif'],
      'ds-maif-front-dev': ['environment:development', 'project:ds-maif', 'client:maif'],
    });
  });

  it('prefers a project the organisation already has, and an environment it names its own way', () => {
    const tagsInUse = ['project:ds-maif', 'project:shop', 'env:rec7', 'env:prod'];
    expect(
      outline(suggestSmartTags([app('ds-maif-rec7-api'), app('other-api')], context({ tags: tagsInUse }))),
    ).toEqual({
      'ds-maif-rec7-api': ['env:rec7', 'project:ds-maif'],
      'other-api': ['(project:other)'],
    });
  });

  it('offers, not picked, the one project of the organisation that holds a single word read', () => {
    const tagsInUse = ['project:apps-mcp', 'project:shop'];
    const suggestions = suggestSmartTags([app('thistle-mcp-app'), app('zephyr-mcp-app')], context({ tags: tagsInUse }));
    expect(outline(suggestions)).toEqual({
      'thistle-mcp-app': ['(project:apps-mcp)'],
      'zephyr-mcp-app': ['(project:apps-mcp)'],
    });
    expect(suggestions[0].proposals[0].reason).toEqual({ kind: 'close', words: 'mcp' });
  });

  it('gives an add-on the project and the environment of the applications linked to it', () => {
    const linkedApp = app('Shop API', ['project:shop', 'env:prod']);
    const suggestions = suggestSmartTags(
      [addon('PostgreSQL', 'postgresql-addon'), addon('Shared config', 'config-provider')],
      context({ resources: [linkedApp], links: link(linkedApp.id, ['addon_PostgreSQL', 'addon_Shared config']) }),
    );
    expect(outline(suggestions)).toEqual({ PostgreSQL: ['env:prod', 'project:shop'], 'Shared config': [] });
    expect(suggestions[0].proposals[0].reason).toEqual({ kind: 'linked', names: ['Shop API'] });
  });

  it('gives an application the environment of its add-ons and of the applications it is linked to', () => {
    const db = addon('orders-db', 'postgresql-addon', ['env:dev', 'project:orders']);
    const config = addon('Shared config', 'config-provider', ['env:prod']);
    const gateway = app('gateway', ['env:dev']);
    const suggestions = suggestSmartTags(
      [app('orders-api'), app('orders-worker'), app('billing-front'), addon('billing-cache', 'redis-addon')],
      context({
        resources: [db, config, gateway],
        links: {
          ...link('app_orders-api', [db.id, config.id]),
          ...link('app_orders-worker', [], ['app_orders-api']),
          ...link('app_billing-front', ['addon_billing-cache'], [gateway.id]),
        },
      }),
    );
    expect(outline(suggestions)).toEqual({
      // The database says dev; the configuration provider, shared across environments, says nothing.
      'orders-api': ['env:dev', 'project:orders'],
      // Along the chain: the worker depends on the API, which uses the database.
      'orders-worker': ['env:dev', 'project:orders'],
      'billing-front': ['env:dev', 'project:billing'],
      'billing-cache': ['env:dev', 'project:billing'],
    });
    expect(suggestions[1].proposals[0].reason).toEqual({ kind: 'linked', names: ['orders-api'] });
  });

  it('takes the project from an add-on, never from another application', () => {
    const db = addon('orders-db', 'postgresql-addon', ['env:dev', 'project:orders']);
    const gateway = app('gateway', ['env:dev', 'project:edge']);
    expect(
      outline(
        suggestSmartTags(
          [app('worker'), app('cron')],
          context({
            resources: [db, gateway],
            links: { ...link('app_worker', [db.id]), ...link('app_cron', [], [gateway.id]) },
          }),
        ),
      ),
    ).toEqual({ worker: ['env:dev', 'project:orders'], cron: ['env:dev'] });
  });

  it('says nothing from links that disagree', () => {
    const dev = addon('a-db', 'postgresql-addon', ['env:dev']);
    const prod = addon('b-db', 'postgresql-addon', ['env:prod']);
    expect(
      outline(
        suggestSmartTags(
          [app('mixed')],
          context({ resources: [dev, prod], links: link('app_mixed', [dev.id, prod.id]) }),
        ),
      ),
    ).toEqual({ mixed: ['project:mixed'] });
  });

  it('learns the projects from the names already tagged in the organisation', () => {
    const resources = [
      app('ff-acme-api-dev-app', ['project:feature-flipping', 'env:dev']),
      addon('ff-acme-dev-data', 'postgresql-addon', ['project:feature-flipping', 'env:dev']),
      app('kelp-api', ['project:services-indigo']),
      app('pdf-to-markdown-service', ['project:services-indigo']),
      app('sage-mcp-app', ['project:apps-mcp']),
      app('thistle-mcp-app', ['project:apps-mcp']),
      app('tundra-prod-app', ['project:site-tundra']),
      app('maif-portal', ['project:maif-legacy']),
      app('maif-crm', ['project:maif-legacy']),
    ];
    const suggestions = suggestSmartTags(
      [app('ff-acme-walnut-prod-app'), addon('ff-acme-prod-data', 'postgresql-addon')],
      context({ resources }),
    );
    expect(outline(suggestions)).toEqual({
      'ff-acme-walnut-prod-app': ['env:prod', 'project:feature-flipping'],
      'ff-acme-prod-data': ['env:prod', 'project:feature-flipping'],
    });
    expect(suggestions[0].proposals[1].reason).toEqual({
      kind: 'like',
      names: ['ff-acme-api-dev-app', 'ff-acme-dev-data'],
      count: 2,
    });
    const read = (...names: string[]) =>
      outline(
        suggestSmartTags(
          names.map((name) => app(name)),
          context({ resources }),
        ),
      );
    // Names that share nothing teach each their own words.
    expect(read('pdf-to-markdown-worker')).toEqual({ 'pdf-to-markdown-worker': ['project:services-indigo'] });
    // Two projects hold as many words of the name: the one with more names, not picked.
    expect(read('tundra-mcp-new')).toEqual({ 'tundra-mcp-new': ['(project:apps-mcp)'] });
    // Fewer words than the selection shares: offered, not picked, when they are two at least; else the selection wins.
    expect(read('ff-acme-new-api', 'ff-acme-new-worker')).toEqual({
      'ff-acme-new-api': ['(project:feature-flipping)'],
      'ff-acme-new-worker': ['(project:feature-flipping)'],
    });
    // The names a project explains no longer count among the words the others share.
    expect(read('ff-acme-walnut-prod-app', 'acme-ui-kit', 'nova-app')).toEqual({
      'ff-acme-walnut-prod-app': ['env:prod', 'project:feature-flipping'],
      'acme-ui-kit': ['(project:acme-kit)'],
      'nova-app': ['(project:nova)'],
    });
    expect(read('DEV-ds-maif-api', 'DEV-ds-maif-db')).toEqual({
      'DEV-ds-maif-api': ['env:dev', 'project:ds-maif'],
      'DEV-ds-maif-db': ['env:dev', 'project:ds-maif'],
    });
  });

  it('finds a value of the organisation written with or without separators', () => {
    expect(outline(suggestSmartTags([app('DEV-ds-maif-api')], context({ tags: ['project:dsmaif'] })))).toEqual({
      'DEV-ds-maif-api': ['env:dev', 'project:dsmaif'],
    });
    expect(outline(suggestSmartTags([app('dsmaif-api-prod')], context({ tags: ['project:ds-maif'] })))).toEqual({
      'dsmaif-api-prod': ['env:prod', 'project:ds-maif'],
    });
  });

  it('gives a resource without an environment word the one the rest of its project agrees on', () => {
    expect(
      outline(
        suggestSmartTags(
          [
            app('DEV-ds-maif-api', ['team:data']),
            addon('DEV-ds-maif-db', 'postgresql-addon', ['team:data']),
            addon('ds-maif-cellar', 'cellar-addon'),
          ],
          context(),
        ),
      ),
    ).toEqual({
      'DEV-ds-maif-api': ['env:dev', 'project:ds-maif'],
      'DEV-ds-maif-db': ['env:dev', 'project:ds-maif'],
      'ds-maif-cellar': ['env:dev', 'project:ds-maif', 'team:data'],
    });
  });

  it('proposes nothing already there, and does not pick a key the resource has with another value', () => {
    const suggestions = suggestSmartTags([app('dev-shop-api', ['env:prod', 'project:shop'])], context());
    expect(outline(suggestions)).toEqual({ 'dev-shop-api': ['(env:dev)'] });
    expect(suggestions[0].proposals[0].conflict).toBe('env:prod');
  });

  it('says no environment for a name that holds two', () => {
    expect(outline(suggestSmartTags([app('dev-to-prod-sync')], context()))).toEqual({
      'dev-to-prod-sync': ['project:to-sync'],
    });
  });

  it('plans the picked additions, under their edited name', () => {
    const suggestions = suggestSmartTags([app('dev-shop-api'), app('dev-shop-front', ['env:dev'])], context());
    const steps = planSmartTags(
      suggestions,
      (_, tag) => tag !== 'env:dev',
      (tag) => (tag === 'project:shop' ? 'project:boutique' : tag),
    );
    expect(steps.map((step) => `+${step.tag}@${step.resource.name}`)).toEqual([
      '+project:boutique@dev-shop-api',
      '+project:boutique@dev-shop-front',
    ]);
  });
});
