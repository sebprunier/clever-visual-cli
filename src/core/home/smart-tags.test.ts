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
const context = (overrides: Partial<SmartTagContext> = {}): SmartTagContext => ({
  tagsInUse: [],
  apps: [],
  links: {},
  ...overrides,
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
      outline(suggestSmartTags([app('prod-ds-maif-api'), app('ds-maif-front-dev')], context({ tagsInUse }))),
    ).toEqual({
      'prod-ds-maif-api': ['environment:production', 'project:ds-maif', 'client:maif'],
      'ds-maif-front-dev': ['environment:development', 'project:ds-maif', 'client:maif'],
    });
  });

  it('prefers a project the organisation already has, and an environment it names its own way', () => {
    const tagsInUse = ['project:ds-maif', 'project:shop', 'env:rec7', 'env:prod'];
    expect(outline(suggestSmartTags([app('ds-maif-rec7-api'), app('other-api')], context({ tagsInUse })))).toEqual({
      'ds-maif-rec7-api': ['env:rec7', 'project:ds-maif'],
      'other-api': ['(project:other)'],
    });
  });

  it('offers, not picked, the one project of the organisation that holds a single word read', () => {
    const tagsInUse = ['project:apps-mcp', 'project:shop'];
    const suggestions = suggestSmartTags([app('thistle-mcp-app'), app('zephyr-mcp-app')], context({ tagsInUse }));
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
      context({
        apps: [linkedApp],
        links: { [linkedApp.id]: { addonIds: ['addon_PostgreSQL', 'addon_Shared config'], applicationIds: [] } },
      }),
    );
    expect(outline(suggestions)).toEqual({ PostgreSQL: ['env:prod', 'project:shop'], 'Shared config': [] });
    expect(suggestions[0].proposals[0].reason).toEqual({ kind: 'linked', names: ['Shop API'] });
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
