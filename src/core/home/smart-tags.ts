/**
 * Smart tags: `key:value` tags read from the names of a selection of
 * applications and add-ons, the selection taken as a whole.
 *
 * Each name is cut into words (`DEV-ds-maif-api`, `ds_maif_db_dev` and
 * `dsMaifCellar` alike). An environment word gives the environment
 * (`dev`, `development` → `env:dev`); role words (`api`, `db`, `cellar`,
 * `front`…), the runtime or provider of the resource and numbers are set
 * aside; what is left is the project, read as the run of words that the most
 * names of the selection share, wherever it sits in each name
 * (`project:ds-maif`).
 *
 * The organisation's own tags come first: the keys it uses for the
 * environment and the project, the spelling of its values (`env:production`
 * rather than `env:prod`), and any `key:value` whose value shows in a name.
 * Then the selection fills its gaps: an add-on takes the project and the
 * environment of the applications it is linked to, and a resource without an
 * environment word takes the one the rest of its project agrees on.
 *
 * Only additions are proposed, each picked or not by default: a guess, or a
 * tag whose key the resource already has with another value, is not picked.
 * The dialog previews them all before anything is sent.
 */
import { normalise } from '../palette.js';
import { tagValue, WEAK_LINK_PROVIDERS, type LinksIndex } from './grouping.js';
import { validateTag, type TagResource, type TagStep } from './tagging.js';

export interface SmartTagResource extends TagResource {
  /** The runtime of an application (`node`) or the provider of an add-on (`postgresql-addon`): words that tell nothing of the project. */
  type: string;
}

export interface SmartTagContext {
  /** The tags of every application and add-on of the organisation, once per resource: its conventions and known values. */
  tagsInUse: readonly string[];
  /** Every application of the organisation, for an add-on linked to one outside the selection. */
  apps: readonly TagResource[];
  /** The add-ons linked to each application, as far as they are known. */
  links: LinksIndex;
}

export type SmartTagReason =
  /** An environment word of the name. */
  | { kind: 'env'; word: string }
  /** A value the organisation already uses, found in the name. */
  | { kind: 'known' }
  /** The words that `count` names of the selection share. */
  | { kind: 'shared'; count: number }
  /** The only value of the organisation that holds the words read, `words`: a guess. */
  | { kind: 'close'; words: string }
  /** What is left of the name once the environment and the roles are set aside: a guess. */
  | { kind: 'rest' }
  /** From the applications the add-on is linked to. */
  | { kind: 'linked'; names: string[] }
  /** What the other resources of its project in the selection agree on. */
  | { kind: 'project'; project: string };

export interface SmartTagProposal {
  tag: string;
  key: string;
  reason: SmartTagReason;
  /** Picked by default. */
  picked: boolean;
  /** A tag of the resource with the same key and another value; the proposal is then not picked. */
  conflict: string | null;
}

export interface SmartTagSuggestion {
  resource: SmartTagResource;
  proposals: SmartTagProposal[];
}

/** Environment words by the value proposed when the organisation spells none of them. */
const ENVIRONMENTS: Readonly<Record<string, readonly string[]>> = {
  prod: ['prod', 'production', 'prd'],
  preprod: ['preprod', 'preproduction', 'pprod'],
  staging: ['staging', 'stage', 'stg'],
  qua: ['qua', 'qualif', 'qualification'],
  recette: ['recette', 'rec'],
  uat: ['uat'],
  qa: ['qa'],
  test: ['test', 'tests', 'testing', 'tst'],
  int: ['int', 'integ', 'integration'],
  dev: ['dev', 'develop', 'development', 'devel'],
  demo: ['demo'],
  sandbox: ['sandbox', 'sbx'],
  preview: ['preview'],
};

const ENV_WORDS: ReadonlyMap<string, string> = new Map(
  Object.entries(ENVIRONMENTS).flatMap(([env, words]) => words.map((word): [string, string] => [word, env])),
);

/** Words that name the part a resource plays, its technology or its kind, never its project. */
const ROLE_WORDS: ReadonlySet<string> = new Set([
  // parts of a service
  'api',
  'apis',
  'back',
  'backend',
  'bff',
  'front',
  'frontend',
  'web',
  'www',
  'site',
  'ui',
  'app',
  'apps',
  'admin',
  'backoffice',
  'bo',
  'worker',
  'workers',
  'cron',
  'crons',
  'job',
  'jobs',
  'batch',
  'scheduler',
  'consumer',
  'producer',
  'server',
  'host',
  'srv',
  'service',
  'svc',
  'gateway',
  'gw',
  'proxy',
  'static',
  'assets',
  'cdn',
  'docs',
  'doc',
  'bot',
  'mail',
  'mailer',
  'smtp',
  'auth',
  'sso',
  'search',
  'cache',
  'queue',
  'mq',
  'storage',
  'files',
  'bucket',
  'buckets',
  'data',
  'db',
  'database',
  'bdd',
  'sql',
  'shared',
  'common',
  // add-ons
  'addon',
  'pg',
  'postgres',
  'postgresql',
  'psql',
  'mysql',
  'mariadb',
  'mongo',
  'mongodb',
  'redis',
  'kv',
  'materia',
  'cellar',
  's3',
  'fs',
  'es',
  'elastic',
  'elasticsearch',
  'kibana',
  'apm',
  'pulsar',
  'kafka',
  'rabbitmq',
  'jenkins',
  'keycloak',
  'otoroshi',
  'matomo',
  'metabase',
  'grafana',
  'config',
  'conf',
  'cfg',
  // runtimes
  'node',
  'nodejs',
  'java',
  'jar',
  'war',
  'php',
  'python',
  'py',
  'go',
  'golang',
  'ruby',
  'rust',
  'docker',
  'dotnet',
  'scala',
  'elixir',
  'haskell',
  'deno',
  'bun',
  'frankenphp',
]);

/** Keys an organisation may use for the project, the first one by default. */
const PROJECT_KEYS = ['project', 'projet', 'product', 'produit', 'app', 'application'];
/** Keys an organisation may use for the environment when none of its values is an environment word. */
const ENV_KEYS = ['env', 'environment', 'environnement', 'stage'];

/** Words of a domain name, never a project: `host-c5175a.example.com`. */
const DOMAIN_WORDS: ReadonlySet<string> = new Set(['com', 'net', 'org', 'io', 'fr', 'eu', 'cleverapps']);

/** Numbers, versions and identifiers (`2`, `v2`, `c5175a`), and the words of a domain name. */
function isNoise(word: string): boolean {
  return /^v?\d+$/.test(word) || /^(?=.*\d)(?=.*\p{L})[\p{L}\d]{6,}$/u.test(word) || DOMAIN_WORDS.has(word);
}

/**
 * The words of a name, lower case and without accents: `DEV-ds-maif-api` → dev, ds, maif, api, and
 * camel case too (`dsMaifApi`). `pre-prod` and `pre-production` are one word.
 */
export function nameWords(name: string): string[] {
  const words = name
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/(\p{Ll})(\p{Lu})/gu, '$1 $2')
    .replace(/(\p{Lu})(\p{Lu}\p{Ll})/gu, '$1 $2')
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((word) => word !== '');
  const merged: string[] = [];
  for (const word of words) {
    if (merged.at(-1) === 'pre' && ENV_WORDS.has(`pre${word}`)) {
      merged[merged.length - 1] = `pre${word}`;
    } else {
      merged.push(word);
    }
  }
  return merged;
}

/** The environment a value or a word stands for, or null. */
function environmentOf(value: string): string | null {
  return ENV_WORDS.get(nameWords(value).join('')) ?? null;
}

// --- the organisation's conventions ----------------------------------------

interface KnownValue {
  value: string;
  words: string[];
}

interface Conventions {
  envKey: string;
  projectKey: string;
  /** The organisation's spelling of each environment it uses. */
  envSpelling: Map<string, string>;
  /** The values in use, by key, most used first. */
  known: Map<string, KnownValue[]>;
}

function splitTag(tag: string): { key: string; value: string } | null {
  const colon = tag.indexOf(':');
  if (colon <= 0) {
    return null;
  }
  const key = normalise(tag.slice(0, colon));
  const value = tagValue(tag, key);
  return value == null ? null : { key, value };
}

function mostUsed<T>(counts: ReadonlyMap<T, number>): T | null {
  let best: T | null = null;
  let bestCount = 0;
  for (const [item, count] of counts) {
    if (count > bestCount) {
      best = item;
      bestCount = count;
    }
  }
  return best;
}

function conventionsOf(tagsInUse: readonly string[]): Conventions {
  const uses = new Map<string, Map<string, number>>();
  for (const tag of tagsInUse) {
    const split = splitTag(tag);
    if (split == null) {
      continue;
    }
    const values = uses.get(split.key) ?? new Map<string, number>();
    values.set(split.value, (values.get(split.value) ?? 0) + 1);
    uses.set(split.key, values);
  }
  const envUses = new Map<string, number>();
  for (const [key, values] of uses) {
    const count = [...values].reduce((sum, [value, n]) => sum + (environmentOf(value) != null ? n : 0), 0);
    if (count > 0) {
      envUses.set(key, count);
    }
  }
  const envKey = mostUsed(envUses) ?? ENV_KEYS.find((key) => uses.has(key)) ?? ENV_KEYS[0];
  const projectKey =
    mostUsed(
      new Map(
        PROJECT_KEYS.filter((key) => uses.has(key)).map((key) => [
          key,
          [...uses.get(key)!.values()].reduce((a, b) => a + b, 0),
        ]),
      ),
    ) ?? PROJECT_KEYS[0];
  const spellings = new Map<string, Map<string, number>>();
  for (const [value, count] of uses.get(envKey) ?? []) {
    const env = environmentOf(value);
    if (env != null) {
      const forEnv = spellings.get(env) ?? new Map<string, number>();
      forEnv.set(value, count);
      spellings.set(env, forEnv);
    }
  }
  const known = new Map<string, KnownValue[]>();
  for (const [key, values] of uses) {
    known.set(
      key,
      [...values]
        .sort((a, b) => b[1] - a[1])
        .map(([value]) => ({ value, words: nameWords(value) }))
        .filter(({ value, words }) => value.length >= 2 && words.some((word) => !isNoise(word))),
    );
  }
  return {
    envKey,
    projectKey,
    envSpelling: new Map([...spellings].map(([env, forEnv]) => [env, mostUsed(forEnv)!])),
    known,
  };
}

// --- shared words ----------------------------------------------------------

/** Where `run` sits in `words`, its words next to each other in any order (`ds-maif`, `maif-ds`), or -1. */
function findRun(words: readonly string[], run: readonly string[]): number {
  const key = [...run].sort().join(' ');
  for (let start = 0; start + run.length <= words.length; start++) {
    if ([...words.slice(start, start + run.length)].sort().join(' ') === key) {
      return start;
    }
  }
  return -1;
}

/** The longest known value found in the words, the most used first; null when none is. */
function knownIn(words: readonly string[], values: readonly KnownValue[]): (KnownValue & { start: number }) | null {
  let best: (KnownValue & { start: number }) | null = null;
  for (const known of values) {
    if (best != null && known.words.length <= best.words.length) {
      continue;
    }
    const start = findRun(words, known.words);
    if (start !== -1) {
      best = { ...known, start };
    }
  }
  return best;
}

interface Core {
  id: string;
  words: readonly string[];
  set: ReadonlySet<string>;
}

/** The words of a set in the order most of the names give them. */
function spelled(words: ReadonlySet<string>, among: readonly Core[]): string[] {
  const orders = new Map<string, number>();
  for (const core of among) {
    const order = [...new Set(core.words.filter((word) => words.has(word)))].join(' ');
    orders.set(order, (orders.get(order) ?? 0) + 1);
  }
  return mostUsed(orders)!.split(' ');
}

/**
 * The project words of each resource, read across the selection. The words every name shares are the
 * project of the whole selection (`DEV-ds-maif-api`, `ds-maif-db-dev` → ds, maif). A selection that
 * shares none, across several projects, is read family by family: each resource takes the most words
 * it shares with another one, next to each other or not.
 */
function sharedWords(cores: ReadonlyMap<string, readonly string[]>): Map<string, { words: string[]; count: number }> {
  const result = new Map<string, { words: string[]; count: number }>();
  const entries: Core[] = [...cores]
    .filter(([, words]) => words.length > 0)
    .map(([id, words]) => ({ id, words, set: new Set(words) }));
  if (entries.length < 2) {
    return result;
  }
  const holders = (words: ReadonlySet<string>) =>
    entries.filter(({ set }) => [...words].every((word) => set.has(word)));
  const common = new Set(entries[0].words.filter((word) => entries.every(({ set }) => set.has(word))));
  if (common.size > 0) {
    const words = spelled(common, entries);
    for (const { id } of entries) {
      result.set(id, { words, count: entries.length });
    }
    return result;
  }
  const support = new Map<string, number>();
  const supportOf = (words: ReadonlySet<string>) => {
    const key = [...words].sort().join(' ');
    const count = support.get(key) ?? holders(words).length;
    support.set(key, count);
    return count;
  };
  for (const entry of entries) {
    let best: { words: Set<string>; count: number } | null = null;
    for (const other of entries) {
      const words = new Set(entry.words.filter((word) => other !== entry && other.set.has(word)));
      if (words.size === 0) {
        continue;
      }
      const count = supportOf(words);
      if (best == null || words.size > best.words.size || (words.size === best.words.size && count > best.count)) {
        best = { words, count };
      }
    }
    if (best != null) {
      result.set(entry.id, { words: spelled(best.words, holders(best.words)), count: best.count });
    }
  }
  return result;
}

// --- reading the selection -------------------------------------------------

interface Inference {
  value: string;
  reason: SmartTagReason;
  picked: boolean;
}

interface Reading {
  resource: SmartTagResource;
  words: string[];
  /** The words left for the project. */
  core: string[];
  inferred: Map<string, Inference>;
}

/** The values a resource already has for a key. */
function valuesFor(tags: readonly string[], key: string): string[] {
  return tags.map((tag) => tagValue(tag, key)).filter((value): value is string => value != null);
}

/** The value a resource has or is given for a key: its own tag first, else a picked inference. */
function effective(reading: Reading, key: string): string | null {
  return (
    valuesFor(reading.resource.tags, key)[0] ??
    (reading.inferred.get(key)?.picked ? reading.inferred.get(key)!.value : null)
  );
}

function read(resource: SmartTagResource, conventions: Conventions): Reading {
  const words = nameWords(resource.name);
  const typeWords = new Set(nameWords(resource.type));
  const inferred = new Map<string, Inference>();
  const envWords = new Set<number>();
  // An environment the organisation names its own way first (`env:rec7`), else an environment word.
  const knownEnv = knownIn(
    words,
    (conventions.known.get(conventions.envKey) ?? []).filter((known) => environmentOf(known.value) == null),
  );
  if (knownEnv != null) {
    knownEnv.words.forEach((_, index) => envWords.add(knownEnv.start + index));
    inferred.set(conventions.envKey, {
      value: knownEnv.value,
      reason: { kind: 'env', word: words.slice(knownEnv.start, knownEnv.start + knownEnv.words.length).join('-') },
      picked: true,
    });
  }
  const found = new Map<string, string>();
  words.forEach((word, index) => {
    const env = ENV_WORDS.get(word);
    if (env != null && !envWords.has(index)) {
      envWords.add(index);
      found.set(env, found.get(env) ?? word);
    }
  });
  // Two environments in one name (`dev-to-prod-sync`) say none.
  if (knownEnv == null && found.size === 1) {
    const [[env, word]] = found;
    inferred.set(conventions.envKey, {
      value: conventions.envSpelling.get(env) ?? env,
      reason: { kind: 'env', word },
      picked: true,
    });
  }
  // Values of the organisation's other keys found in the name (`client:maif`), unless they only name a role.
  for (const [key, values] of conventions.known) {
    if (key === conventions.envKey || key === conventions.projectKey) {
      continue;
    }
    const known = knownIn(
      words,
      values.filter((value) => value.words.some((word) => !ROLE_WORDS.has(word) && !ENV_WORDS.has(word))),
    );
    if (known != null) {
      inferred.set(key, { value: known.value, reason: { kind: 'known' }, picked: true });
    }
  }
  const core = words.filter(
    (word, index) => !envWords.has(index) && !ROLE_WORDS.has(word) && !typeWords.has(word) && !isNoise(word),
  );
  return { resource, words, core, inferred };
}

function inferProjects(readings: readonly Reading[], conventions: Conventions): void {
  const { projectKey } = conventions;
  const known = conventions.known.get(projectKey) ?? [];
  const shared = sharedWords(new Map(readings.map((reading) => [reading.resource.id, reading.core])));
  for (const reading of readings) {
    const exact = knownIn(reading.words, known);
    const run = shared.get(reading.resource.id) ?? (reading.core.length > 0 ? { words: reading.core, count: 1 } : null);
    if (exact != null && (run == null || exact.words.length >= run.words.length)) {
      reading.inferred.set(projectKey, { value: exact.value, reason: { kind: 'known' }, picked: true });
      continue;
    }
    if (run == null) {
      continue;
    }
    // A single word, or a name alone, may be a piece of a project the organisation already has.
    const holding =
      run.words.length === 1 || run.count === 1
        ? known.filter(
            (value) => value.words.length > run.words.length && run.words.every((word) => value.words.includes(word)),
          )
        : [];
    if (holding.length === 1) {
      reading.inferred.set(projectKey, {
        value: holding[0].value,
        reason: { kind: 'close', words: run.words.join('-') },
        picked: false,
      });
    } else {
      reading.inferred.set(projectKey, {
        value: run.words.join('-'),
        reason: run.count > 1 ? { kind: 'shared', count: run.count } : { kind: 'rest' },
        // A name alone in a selection of several matches none of the others: a guess.
        picked: run.count > 1 || readings.length === 1,
      });
    }
  }
}

/** An add-on without a project or an environment of its own takes those of the applications linked to it. */
function inferFromLinks(readings: readonly Reading[], conventions: Conventions, context: SmartTagContext): void {
  const byId = new Map(readings.map((reading) => [reading.resource.id, reading]));
  for (const reading of readings) {
    const { resource } = reading;
    if (resource.kind !== 'addon' || WEAK_LINK_PROVIDERS.has(resource.type)) {
      continue;
    }
    const linked = context.apps.filter((app) => context.links[app.id]?.addonIds.includes(resource.id));
    for (const key of [conventions.projectKey, conventions.envKey]) {
      if (valuesFor(resource.tags, key).length > 0 || reading.inferred.get(key)?.picked) {
        continue;
      }
      const values = new Map<string, string[]>();
      for (const app of linked) {
        const selected = byId.get(app.id);
        const value = selected != null ? effective(selected, key) : (valuesFor(app.tags, key)[0] ?? null);
        if (value != null) {
          values.set(value, [...(values.get(value) ?? []), app.name]);
        }
      }
      if (values.size === 1) {
        const [[value, names]] = values;
        reading.inferred.set(key, { value, reason: { kind: 'linked', names }, picked: true });
      }
    }
  }
}

/**
 * Within each project of the selection, a key on which the resources carrying it agree goes to those
 * lacking it: picked when most of the project carries it.
 */
function inferFromProjects(readings: readonly Reading[], conventions: Conventions): void {
  const projects = new Map<string, Reading[]>();
  for (const reading of readings) {
    const project = effective(reading, conventions.projectKey);
    if (project != null) {
      const key = normalise(project);
      projects.set(key, [...(projects.get(key) ?? []), reading]);
    }
  }
  for (const members of projects.values()) {
    if (members.length < 2) {
      continue;
    }
    const project = effective(members[0], conventions.projectKey)!;
    const keys = new Set([
      conventions.envKey,
      ...members.flatMap((member) => member.resource.tags.map((tag) => splitTag(tag)?.key ?? '')),
    ]);
    keys.delete('');
    keys.delete(conventions.projectKey);
    for (const key of keys) {
      const valuesOf = (member: Reading) => {
        const own = valuesFor(member.resource.tags, key);
        const value = effective(member, key);
        return own.length > 0 ? own : value != null ? [value] : [];
      };
      const carriers = members.filter((member) => valuesOf(member).length > 0);
      const values = new Set(carriers.flatMap((member) => valuesOf(member).map((value) => normalise(value))));
      if (values.size !== 1 || carriers.length === members.length) {
        continue;
      }
      const value = valuesOf(carriers[0])[0];
      for (const member of members) {
        if (valuesOf(member).length === 0) {
          member.inferred.set(key, {
            value,
            reason: { kind: 'project', project },
            picked: carriers.length * 2 > members.length,
          });
        }
      }
    }
  }
}

/** The tags proposed for each resource of the selection, the environment first, then the project. */
export function suggestSmartTags(
  resources: readonly SmartTagResource[],
  context: SmartTagContext,
): SmartTagSuggestion[] {
  const conventions = conventionsOf(context.tagsInUse);
  const readings = resources.map((resource) => read(resource, conventions));
  inferProjects(readings, conventions);
  inferFromLinks(readings, conventions, context);
  inferFromProjects(readings, conventions);
  const rank = (key: string) => (key === conventions.envKey ? 0 : key === conventions.projectKey ? 1 : 2);
  return readings.map(({ resource, inferred }) => ({
    resource,
    proposals: [...inferred]
      .sort(([a], [b]) => rank(a) - rank(b) || a.localeCompare(b))
      .flatMap(([key, { value, reason, picked }]): SmartTagProposal[] => {
        const tag = `${key}:${value}`;
        const own = valuesFor(resource.tags, key);
        if (validateTag(tag) != null || own.some((existing) => normalise(existing) === normalise(value))) {
          return [];
        }
        const conflict =
          own.length > 0 ? (resource.tags.find((existing) => tagValue(existing, key) != null) ?? null) : null;
        return [{ tag, key, reason, picked: picked && conflict == null, conflict }];
      }),
  }));
}

/**
 * The additions that apply the picked proposals, each under the name the dialog gives it (a value
 * edited for every resource at once); nothing for a tag a resource already has, or twice.
 */
export function planSmartTags(
  suggestions: readonly SmartTagSuggestion[],
  isPicked: (resourceId: string, tag: string) => boolean,
  renamed: (tag: string) => string = (tag) => tag,
): TagStep[] {
  const steps: TagStep[] = [];
  for (const { resource, proposals } of suggestions) {
    const added = new Set<string>();
    for (const proposal of proposals) {
      const tag = renamed(proposal.tag).trim();
      if (
        isPicked(resource.id, proposal.tag) &&
        validateTag(tag) == null &&
        !resource.tags.includes(tag) &&
        !added.has(tag)
      ) {
        added.add(tag);
        steps.push({ resource, action: 'add', tag });
      }
    }
  }
  return steps;
}
