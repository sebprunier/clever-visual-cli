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
 * rather than `env:prod`), any `key:value` whose value shows in a name
 * (separators aside: `dsmaif` and `ds-maif`), and the projects whose names
 * already tagged look like this one (`ff-acme-api` tagged
 * `project:feature-flipping` → `ff-acme-front` too).
 * Then the links and the selection fill the gaps: a resource without an
 * environment takes the one of the resources it is linked to (an application
 * its add-ons' and the applications' it depends on or that depend on it, an
 * add-on its applications'), and the project too between an application and
 * its add-ons; a resource without an environment word also takes the one the
 * rest of its project in the selection agrees on.
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
  /**
   * Every application and add-on of the organisation: its conventions, the values it knows, the names
   * already tagged, and the applications an add-on of the selection is linked to.
   */
  resources: readonly SmartTagResource[];
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
  /** The project of `count` names of the organisation that look like this one, the first of them in `names`. */
  | { kind: 'like'; names: string[]; count: number }
  /** The only value of the organisation that holds the words read, `words`: a guess. */
  | { kind: 'close'; words: string }
  /** What is left of the name once the environment and the roles are set aside: a guess. */
  | { kind: 'rest' }
  /** From the applications the add-on is linked to. */
  | { kind: 'linked'; names: string[] }
  /** What the other resources of its project in the selection agree on. */
  | { kind: 'project'; project: string }
  /** Added by hand in the dialog. */
  | { kind: 'added' };

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
  'datastore',
  'db',
  'database',
  'bdd',
  'sql',
  'shared',
  'common',
  'backup',
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
  'stack',
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

/** Where the words of `value` sit in `words` written together or apart (`dsmaif`, `ds-maif`), as a run of words, or null. */
function findJoined(words: readonly string[], value: readonly string[]): { start: number; length: number } | null {
  const joined = value.join('');
  for (let start = 0; start < words.length; start++) {
    let run = '';
    for (let end = start; end < words.length && run.length < joined.length; end++) {
      run += words[end];
      if (run === joined) {
        return { start, length: end - start + 1 };
      }
    }
  }
  return null;
}

/**
 * The known value found in the words that covers the most of them, the most used first; null when
 * none is. `length` is the number of words of the name it covers.
 */
function knownIn(
  words: readonly string[],
  values: readonly KnownValue[],
): (KnownValue & { start: number; length: number }) | null {
  let best: (KnownValue & { start: number; length: number }) | null = null;
  for (const known of values) {
    const start = findRun(words, known.words);
    const found = start !== -1 ? { start, length: known.words.length } : findJoined(words, known.words);
    if (found != null && (best == null || found.length > best.length)) {
      best = { ...known, ...found };
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

/** The words of a name, its environment, and the words left for the project. */
function readName(
  resource: SmartTagResource,
  conventions: Conventions,
): { words: string[]; core: string[]; env: Inference | null } {
  const words = nameWords(resource.name);
  const typeWords = new Set(nameWords(resource.type));
  const envWords = new Set<number>();
  let env: Inference | null = null;
  // An environment the organisation names its own way first (`env:rec7`), else an environment word.
  const knownEnv = knownIn(
    words,
    (conventions.known.get(conventions.envKey) ?? []).filter((known) => environmentOf(known.value) == null),
  );
  if (knownEnv != null) {
    for (let index = knownEnv.start; index < knownEnv.start + knownEnv.length; index++) {
      envWords.add(index);
    }
    env = {
      value: knownEnv.value,
      reason: { kind: 'env', word: words.slice(knownEnv.start, knownEnv.start + knownEnv.length).join('-') },
      picked: true,
    };
  }
  const found = new Map<string, string>();
  words.forEach((word, index) => {
    const environment = ENV_WORDS.get(word);
    if (environment != null && !envWords.has(index)) {
      envWords.add(index);
      found.set(environment, found.get(environment) ?? word);
    }
  });
  // Two environments in one name (`dev-to-prod-sync`) say none.
  if (knownEnv == null && found.size === 1) {
    const [[environment, word]] = found;
    env = {
      value: conventions.envSpelling.get(environment) ?? environment,
      reason: { kind: 'env', word },
      picked: true,
    };
  }
  const core = words.filter(
    (word, index) => !envWords.has(index) && !ROLE_WORDS.has(word) && !typeWords.has(word) && !isNoise(word),
  );
  return { words, core, env };
}

function read(resource: SmartTagResource, conventions: Conventions): Reading {
  const { words, core, env } = readName(resource, conventions);
  const inferred = new Map<string, Inference>();
  if (env != null) {
    inferred.set(conventions.envKey, env);
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
  return { resource, words, core, inferred };
}

// --- names already tagged --------------------------------------------------

interface Family {
  value: string;
  /** The words its names share, or the words of one of them when they share none. */
  words: string[];
  /** The names it was learnt from. */
  names: string[];
}

/** The projects of the organisation as its names already tagged show them. */
function projectFamilies(resources: readonly SmartTagResource[], conventions: Conventions): Family[] {
  const members = new Map<string, Array<{ name: string; core: string[] }>>();
  for (const resource of resources) {
    const values = valuesFor(resource.tags, conventions.projectKey);
    const core = values.length > 0 ? readName(resource, conventions).core : [];
    if (core.length > 0) {
      for (const value of values) {
        members.set(value, [...(members.get(value) ?? []), { name: resource.name, core }]);
      }
    }
  }
  const families: Family[] = [];
  for (const [value, named] of members) {
    const common = [...new Set(named[0].core)].filter((word) => named.every(({ core }) => core.includes(word)));
    if (common.length > 0) {
      families.push({ value, words: common, names: named.map(({ name }) => name) });
    } else {
      families.push(...named.map(({ name, core }) => ({ value, words: [...new Set(core)], names: [name] })));
    }
  }
  return families;
}

/**
 * The project whose names look like this one: all its words are in the name, the most words first, then
 * the most names. Ambiguous when another project has as many words in it.
 */
function familyOf(core: readonly string[], families: readonly Family[]): { family: Family; ambiguous: boolean } | null {
  const words = new Set(core);
  const matching = families
    .filter((family) => family.words.every((word) => words.has(word)))
    .sort((a, b) => b.words.length - a.words.length || b.names.length - a.names.length);
  if (matching.length === 0) {
    return null;
  }
  const [family] = matching;
  return {
    family,
    ambiguous: matching.some((other) => other.value !== family.value && other.words.length === family.words.length),
  };
}

/**
 * The project of one resource: a project of the organisation found in its name, the project of the names
 * already tagged it looks like, the words it shares with the selection (`run`), or the rest of its name.
 */
function projectOf(
  reading: Reading,
  run: { words: string[]; count: number } | null,
  known: readonly KnownValue[],
  families: readonly Family[],
  single: boolean,
): Inference | null {
  const exact = knownIn(reading.words, known);
  // Names already tagged are worth more than a guess, and as much as the words the selection shares when
  // they hold them all; with fewer words, but two at least, they are offered without being picked.
  const like = familyOf(reading.core, families);
  const likeAll =
    like != null && (run == null || run.count === 1 || run.words.every((word) => like.family.words.includes(word)));
  const likeSome = like != null && !likeAll && like.family.words.length >= 2;
  if (
    exact != null &&
    (run == null || exact.length >= run.words.length) &&
    (!likeAll || exact.length >= like.family.words.length)
  ) {
    return { value: exact.value, reason: { kind: 'known' }, picked: true };
  }
  if (like != null && (likeAll || likeSome)) {
    return {
      value: like.family.value,
      reason: { kind: 'like', names: like.family.names.slice(0, 2), count: like.family.names.length },
      picked: likeAll && !like.ambiguous,
    };
  }
  if (run == null) {
    return null;
  }
  // A single word, or a name alone, may be a piece of a project the organisation already has.
  const holding =
    run.words.length === 1 || run.count === 1
      ? known.filter(
          (value) => value.words.length > run.words.length && run.words.every((word) => value.words.includes(word)),
        )
      : [];
  if (holding.length === 1) {
    return { value: holding[0].value, reason: { kind: 'close', words: run.words.join('-') }, picked: false };
  }
  return {
    value: run.words.join('-'),
    reason: run.count > 1 ? { kind: 'shared', count: run.count } : { kind: 'rest' },
    // A name alone in a selection of several matches none of the others: a guess.
    picked: run.count > 1 || single,
  };
}

function inferProjects(readings: readonly Reading[], conventions: Conventions, families: readonly Family[]): void {
  const { projectKey } = conventions;
  const known = conventions.known.get(projectKey) ?? [];
  const decide = (among: readonly Reading[]) => {
    const shared = sharedWords(new Map(among.map((reading) => [reading.resource.id, reading.core])));
    for (const reading of among) {
      const run =
        shared.get(reading.resource.id) ?? (reading.core.length > 0 ? { words: reading.core, count: 1 } : null);
      const project = projectOf(reading, run, known, families, readings.length === 1);
      if (project == null) {
        reading.inferred.delete(projectKey);
      } else {
        reading.inferred.set(projectKey, project);
      }
    }
  };
  decide(readings);
  // The names a project of the organisation explains no longer count among the words the others share.
  const open = readings.filter(
    (reading) => !['known', 'like'].includes(reading.inferred.get(projectKey)?.reason.kind ?? ''),
  );
  if (open.length > 0 && open.length < readings.length) {
    decide(open);
  }
}

/**
 * The resources linked to one, that likely share its environment: the applications an add-on serves; the
 * add-ons of an application (those shared across unrelated applications left out), the applications it
 * depends on and those depending on it. Applications linked to each other may belong to different
 * projects, so `project` leaves them out.
 */
function linkedTo(
  resource: SmartTagResource,
  resources: readonly SmartTagResource[],
  links: LinksIndex,
  project: boolean,
): SmartTagResource[] {
  if (resource.kind === 'addon') {
    return WEAK_LINK_PROVIDERS.has(resource.type)
      ? []
      : resources.filter((other) => other.kind === 'app' && links[other.id]?.addonIds.includes(resource.id));
  }
  const own = links[resource.id];
  return resources.filter((other) =>
    other.kind === 'addon'
      ? !WEAK_LINK_PROVIDERS.has(other.type) && (own?.addonIds.includes(other.id) ?? false)
      : !project &&
        other.id !== resource.id &&
        ((own?.applicationIds.includes(other.id) ?? false) ||
          (links[other.id]?.applicationIds.includes(resource.id) ?? false)),
  );
}

/**
 * A resource without a project or an environment of its own takes the one its linked resources agree
 * on (see `linkedTo`), again and again so that it goes along a chain: an application, its database,
 * another application on that database.
 */
function inferFromLinks(readings: readonly Reading[], conventions: Conventions, context: SmartTagContext): void {
  const byId = new Map(readings.map((reading) => [reading.resource.id, reading]));
  const resources = [
    ...new Map([...context.resources, ...readings.map((reading) => reading.resource)].map((r) => [r.id, r])).values(),
  ];
  const keys = [conventions.projectKey, conventions.envKey];
  const linked = new Map(
    readings.map((reading) => [
      reading.resource.id,
      keys.map((key) => linkedTo(reading.resource, resources, context.links, key === conventions.projectKey)),
    ]),
  );
  for (let pass = 0, changed = true; changed && pass < 3; pass++) {
    changed = false;
    for (const reading of readings) {
      keys.forEach((key, index) => {
        if (valuesFor(reading.resource.tags, key).length > 0 || reading.inferred.get(key)?.picked) {
          return;
        }
        const values = new Map<string, string[]>();
        for (const other of linked.get(reading.resource.id)![index]) {
          const selected = byId.get(other.id);
          const value = selected != null ? effective(selected, key) : (valuesFor(other.tags, key)[0] ?? null);
          if (value != null) {
            values.set(value, [...(values.get(value) ?? []), other.name]);
          }
        }
        if (values.size === 1) {
          const [[value, names]] = values;
          reading.inferred.set(key, { value, reason: { kind: 'linked', names }, picked: true });
          changed = true;
        }
      });
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
  const conventions = conventionsOf(context.resources.flatMap((resource) => resource.tags));
  const readings = resources.map((resource) => read(resource, conventions));
  inferProjects(readings, conventions, projectFamilies(context.resources, conventions));
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
