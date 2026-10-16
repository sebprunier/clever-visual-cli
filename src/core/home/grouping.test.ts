import { describe, expect, it } from 'vitest';
import type { AddonSummary, ApplicationSummary } from '../../data/api.js';
import {
  buildTree,
  defaultGrouping,
  groupingSuggestions,
  linkedAddons,
  parseGrouping,
  tagValue,
  type GroupNode,
  type GroupingContext,
} from './grouping.js';

function app(
  id: string,
  name: string,
  tags: string[] = [],
  state: ApplicationSummary['state'] = 'SHOULD_BE_UP',
  variantName = 'Node.js',
): ApplicationSummary {
  return {
    id,
    name,
    instanceType: 'node',
    variantName,
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
  app('api', 'shop-api', ['project:shop:prod', 'env:prod'], 'SHOULD_BE_DOWN', 'Java + Maven'),
  app('dev', 'shop-dev', ['project:shop:dev', 'env:dev']),
  app('blog', 'blog', ['project:blog']),
  app('lonely', 'lonely-app'),
];
const addons = [
  addon('pg', 'shop-db', 'postgresql-addon', ['project:shop:prod']),
  addon('redis', 'shop-cache', 'redis-addon'),
  addon('config', 'global-config', 'config-provider'),
  addon('bucket', 'old-bucket', 'cellar-addon'),
];
const context: GroupingContext = {
  apps,
  addons,
  links: {
    web: { addonIds: ['pg', 'redis', 'config'], applicationIds: ['api'] },
    api: { addonIds: ['pg', 'config'], applicationIds: [] },
    dev: { addonIds: ['config'], applicationIds: [] },
    blog: { addonIds: [], applicationIds: [] },
    lonely: { addonIds: [], applicationIds: [] },
  },
  stateLabel: (state) => (state === 'SHOULD_BE_UP' ? 'démarrée' : 'arrêtée'),
};

function outline(nodes: GroupNode[], depth = 0): string[] {
  return nodes.flatMap((node) => {
    const items = [...node.apps, ...node.addons].map((item) => (node.inferred.has(item.id) ? `${item.id}?` : item.id));
    const line = `${'  '.repeat(depth)}${node.label || '(root)'}[${node.appCount}/${node.addonCount}]${items.length ? ': ' + items.join(',') : ''}`;
    return [line, ...outline(node.children, depth + 1)];
  });
}

describe('home grouping', () => {
  it('parses keys, separators, orders and errors', () => {
    expect(parseGrouping('')).toEqual({ raw: '', keys: [], error: null });
    expect(parseGrouping('project > env').keys).toEqual([
      { key: 'project', order: [] },
      { key: 'env', order: [] },
    ]);
    expect(parseGrouping('Project,env(Prod, qua,dev)').keys).toEqual([
      { key: 'project', order: [] },
      { key: 'env', order: ['prod', 'qua', 'dev'] },
    ]);
    expect(parseGrouping('project >').keys).toEqual([{ key: 'project', order: [] }]);
    expect(parseGrouping('project > > env').error).toBe('clé vide');
    expect(parseGrouping('a > b > c > d').error).toBe('3 niveaux maximum');
    expect(parseGrouping('project > project').error).toBe('clé « project » en double');
    expect(parseGrouping('env(prod').error).toBe('syntaxe attendue : clé ou clé(valeur, valeur)');
  });

  it('reads tag values and suggests keys', () => {
    expect(tagValue('project:shop:prod', 'project')).toBe('shop');
    expect(tagValue('env:prod', 'env')).toBe('prod');
    expect(tagValue('env:prod', 'project')).toBeNull();
    expect(tagValue('MaVille', 'project')).toBeNull();
    expect(groupingSuggestions([...apps, ...addons])).toEqual([
      'project',
      'env',
      'project > env',
      'env > project',
      'type',
      'runtime',
      'provider',
      'state',
    ]);
    expect(defaultGrouping(apps)).toBe('project');
    expect(defaultGrouping([app('x', 'x')])).toBe('type');
  });

  it('puts everything in one level-0 node without grouping', () => {
    const [root] = buildTree(parseGrouping(''), apps, addons, context);
    expect(root.level).toBe(0);
    expect(root.apps.map((item) => item.id)).toEqual(['blog', 'lonely', 'api', 'dev', 'web']);
    expect(root.addons.map((item) => item.id)).toEqual(['config', 'bucket', 'redis', 'pg']);
  });

  it('groups by a tag key, infers add-ons from their linked applications, and keeps the rest last', () => {
    expect(outline(buildTree(parseGrouping('project'), apps, addons, context))).toEqual([
      'blog[1/0]: blog',
      'shop[3/3]: api,dev,web,config?,redis?,pg',
      'sans project[1/1]: lonely,bucket',
    ]);
  });

  it('nests levels, honours an explicit order, and repeats an item with two values', () => {
    expect(outline(buildTree(parseGrouping('project > env(prod,dev)'), apps, addons, context))).toEqual([
      'blog[1/0]',
      '  sans env[1/0]: blog',
      'shop[3/3]',
      '  prod[2/3]: api,web,config?,redis?,pg?',
      '  dev[1/1]: dev,config?',
      'sans project[1/1]',
      '  sans env[1/1]: lonely,bucket',
    ]);
    expect(outline(buildTree(parseGrouping('type > runtime'), apps, addons, context))).toEqual([
      'Add-ons[0/4]',
      '  cellar-addon[0/1]: bucket',
      '  config-provider[0/1]: config',
      '  postgresql-addon[0/1]: pg',
      '  redis-addon[0/1]: redis',
      'Applications[5/0]',
      '  Java + Maven[1/0]: api',
      '  Node.js[4/0]: blog,lonely,dev,web',
    ]);
    expect(outline(buildTree(parseGrouping('state'), apps, [], context))).toEqual([
      'arrêtée[1/0]: api',
      'démarrée[4/0]: blog,lonely,dev,web',
    ]);
  });

  it('lists linked add-ons with strong links first, tolerating missing links', () => {
    expect(linkedAddons('web', context).map((item) => item.id)).toEqual(['pg', 'redis', 'config']);
    expect(linkedAddons('unknown', context)).toEqual([]);
  });
});
