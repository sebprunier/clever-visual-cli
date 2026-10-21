/**
 * Turns the answers recorded by record.mjs (scripts/screenshots/.raw/, never
 * committed) into the demo data the screenshots are taken from
 * (scripts/screenshots/fixtures/, committed): one organisation and the personal
 * space only, every name, tag, domain, person, email address, id, commit and
 * amount replaced, deterministically so the same name gets the same stand-in
 * everywhere. Variables, descriptions and webhooks are emptied. It ends by
 * checking that no recorded name, id or address is left, and fails otherwise.
 *
 *   node scripts/screenshots/anonymise.mjs
 */
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const RAW = new URL('./.raw/', import.meta.url);
const OUT = new URL('./fixtures/', import.meta.url);
const responses = JSON.parse(readFileSync(new URL('responses.json', RAW), 'utf8'));
const recordedIds = JSON.parse(readFileSync(new URL('ids.json', RAW), 'utf8'));

const ORGANISATION_NAME = 'Acme';
const PEOPLE = [
  'Alex Martin',
  'Sam Rivera',
  'Jordan Blake',
  'Robin Chen',
  'Taylor Nguyen',
  'Charlie Moreau',
  'Morgan Diaz',
];
/** Words that say nothing about anyone: kept as they are in names. */
const GENERIC = new Set(
  (
    'app apps api prod preprod production staging stage dev develop test tests demo data db database cache ' +
    'redis mysql postgresql postgres pg mongo mongodb cellar fs bucket buckets storage static classic new home ' +
    'site www web front back backend frontend worker cron admin portal console gw gateway es kibana apm ui kit ' +
    'service services server module feature flipping markdown pdf to at of the and in on for mcp oto otoroshi ' +
    'keycloak docker node java maven python php go ruby rust scala elixir dotnet html apache nginx provider ' +
    'config addon addons env project auth sso proxy ai analytics backoffice ds core hub live next old main ' +
    'public private internal external mail mailer search queue jobs job batch report reports media files ' +
    'assets images img cdn blog docs doc wiki shop store pay payment payments billing account accounts user ' +
    'users mobile ios android bot bots chat ws io sdk lib libs tools tool infra ops monitoring logs log metrics ' +
    'grafana prometheus vault secret secrets key keys sandbox preview review qa uat int dashboard dashboards ' +
    'com fr io net org eu tech cloud be ch info clever cleverapps status backup backups'
  ).split(' '),
);
const FAKE_WORDS = (
  'harbor orchard lantern meadow falcon willow summit pebble canyon ember glacier harvest juniper kestrel ' +
  'lagoon marble nectar oasis prairie quartz raven saffron tundra umber velvet walnut yarrow zephyr acorn ' +
  'birch cobalt dune fern grove heron iris jasper kelp lotus maple nova onyx pine quill reef sage thistle ' +
  'tulip vale wren beacon cedar delta echo fjord garnet hazel indigo jade koala lynx mango nimbus otter ' +
  'poppy quokka rumba sierra topaz upland vortex wombat xenon yukon zinnia amber basil clover dahlia'
).split(' ');

const hash = (value, size = 8) => createHash('sha256').update(`cvc-demo:${value}`).digest('hex').slice(0, size);
const fakeUuid = (value) => {
  const h = createHash('sha256').update(`cvc-demo-uuid:${value}`).digest('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20, 32)}`;
};

// --- what is kept --------------------------------------------------------------

const summaryKey = Object.keys(responses).find((key) => key.endsWith('/v2/summary'));
const summary = JSON.parse(responses[summaryKey].body);
const orga = summary.organisations.find((candidate) => candidate.id === recordedIds.orga);
const personalId = summary.user.id;
const keptOwners = new Set([orga.id, personalId]);
const keptResources = new Set([
  ...orga.applications.flatMap((app) => [app.id]),
  ...orga.addons.flatMap((addon) => [addon.id, addon.realId]),
  ...summary.user.applications.map((app) => app.id),
  ...summary.user.addons.flatMap((addon) => [addon.id, addon.realId]),
]);
const ID_IN_PATH = /\b(?:orga|user|app|addon|[a-z]+)_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/g;

function kept(key) {
  if (key === summaryKey) {
    return true;
  }
  const path = key.split(' ')[1];
  for (const id of path.match(ID_IN_PATH) ?? []) {
    if (id.startsWith('orga_') || id.startsWith('user_')) {
      if (!keptOwners.has(id)) {
        return false;
      }
    } else if (id.startsWith('app_') || id.startsWith('addon_')) {
      if (!keptResources.has(id)) {
        return false;
      }
    } else if (!id.startsWith('deployment_') && !keptResources.has(id)) {
      // A real id (postgresql_…, cellar_…, keycloak_…) of a resource of another organisation.
      return false;
    }
  }
  return true;
}

const keptResponses = Object.fromEntries(Object.entries(responses).filter(([key]) => kept(key)));
// The summary: this organisation and the personal space only.
keptResponses[summaryKey] = {
  ...responses[summaryKey],
  body: JSON.stringify({ ...summary, organisations: [orga] }),
};

// --- what is sensitive ------------------------------------------------------------

const sensitiveTokens = new Set();
const people = new Map();
const emails = new Map();
const addToken = (text) => {
  // Letters with accents are letters: a name such as "vélo-club" is two words, not three.
  for (const token of String(text)
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)) {
    // Fragments of ids (anything with a digit) are not names: ids have their own replacement.
    if (token.length >= 3 && !GENERIC.has(token) && !/\d/.test(token)) {
      sensitiveTokens.add(token);
    }
  }
};
const addPerson = (name) => {
  if (typeof name === 'string' && name.trim() !== '' && !people.has(name)) {
    people.set(name, PEOPLE[people.size % PEOPLE.length]);
  }
};
addPerson(summary.user.name);
for (const resource of [...orga.applications, ...orga.addons, ...summary.user.addons, ...summary.user.applications]) {
  addToken(resource.name);
  for (const tag of resource.customerTags ?? []) {
    addToken(tag.split(':').slice(1).join(':'));
  }
}
addToken(orga.name);
const walk = (value, visit) => {
  if (Array.isArray(value)) {
    value.forEach((item) => walk(item, visit));
  } else if (value != null && typeof value === 'object') {
    for (const [key, inner] of Object.entries(value)) {
      visit(key, inner, value);
      walk(inner, visit);
    }
  }
};
for (const response of Object.values(keptResponses)) {
  let body;
  try {
    body = JSON.parse(response.body);
  } catch {
    continue;
  }
  walk(body, (key, value, parent) => {
    if (key === 'author' && value?.name) {
      addPerson(value.name);
    }
    if (key === 'name' && parent?.email) {
      addPerson(value);
    }
    if ((key === 'fqdn' || key === 'host') && typeof value === 'string') {
      // The labels of a host name, but its top-level domain.
      addToken(value.replace(/\/$/, '').split('.').slice(0, -1).join('.'));
    }
    if ((key === 'app_name' || key === 'name') && typeof value === 'string' && parent?.objectsCount != null) {
      addToken(value);
    }
    if (key === 'app_name' && typeof value === 'string') {
      addToken(value);
    }
  });
}
// Tokens are replaced by words; each distinct word gets its own. The organisation's own name becomes "acme".
const tokenMap = new Map();
const organisationTokens = orga.name
  .toLowerCase()
  .split(/[^\p{L}\p{N}]+/u)
  .filter((token) => sensitiveTokens.has(token));
for (const token of organisationTokens) {
  tokenMap.set(token, organisationTokens.length === 1 ? 'acme' : `acme${tokenMap.size + 1}`);
}
for (const token of [...sensitiveTokens].sort()) {
  if (tokenMap.has(token)) {
    continue;
  }
  let index = parseInt(hash(token, 6), 16) % FAKE_WORDS.length;
  let word = FAKE_WORDS[index];
  for (let attempt = 1; [...tokenMap.values()].includes(word); attempt += 1) {
    word = `${FAKE_WORDS[(index + attempt) % FAKE_WORDS.length]}${attempt > FAKE_WORDS.length ? attempt : ''}`;
  }
  tokenMap.set(token, word);
}

// --- replacing ------------------------------------------------------------------------

// Not \b: ids come after a prefix and an underscore (`orga_…`), which \b does not separate.
const UUID = /(?<![0-9a-f])[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(?![0-9a-f])/gi;
const SHA = /(?<![0-9a-f])[0-9a-f]{40}(?![0-9a-f])/g;
const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
/** Host names outside Clever Cloud: a word and example.com. */
const HOST = /\b(?:[a-z0-9-]+\.)+(?:com|fr|io|net|org|eu|dev|tech|app|cloud|be|ch|info)\b/gi;
const CLEVER_HOSTS =
  /(?:^|\.)(cleverapps\.io|clever-cloud\.com|clevercloudstatus\.com|clever\.cloud|gravatar\.com|example\.com)$/i;
const TOKEN = new RegExp(
  `(?<![\\p{L}\\p{N}])(${[...tokenMap.keys()]
    .sort((a, b) => b.length - a.length)
    .map(escape)
    .join('|')})(?![\\p{L}\\p{N}])`,
  'giu',
);
const peoplePattern =
  people.size === 0
    ? null
    : new RegExp(
        [...people.keys()]
          .sort((a, b) => b.length - a.length)
          .map(escape)
          .join('|'),
        'gi',
      );

function escape(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function emailFor(original) {
  if (!emails.has(original.toLowerCase())) {
    const name = PEOPLE[emails.size % PEOPLE.length];
    emails.set(original.toLowerCase(), `${name.toLowerCase().replace(/\s+/g, '.')}@example.com`);
  }
  return emails.get(original.toLowerCase());
}

function anonymiseText(text) {
  let out = String(text);
  out = out.replace(EMAIL, (match) => emailFor(match));
  if (peoplePattern != null) {
    out = out.replace(peoplePattern, (match) =>
      people.get([...people.keys()].find((name) => name.toLowerCase() === match.toLowerCase())),
    );
  }
  out = out.replace(UUID, (match) => fakeUuid(match.toLowerCase()));
  out = out.replace(SHA, (match) => createHash('sha1').update(`cvc-demo:${match}`).digest('hex'));
  out = out.replace(HOST, (match) =>
    CLEVER_HOSTS.test(match)
      ? match
      : `${tokenMap.get(match.split('.')[0].toLowerCase()) ?? `host-${hash(match, 6)}`}.example.com`,
  );
  if (tokenMap.size > 0) {
    out = out.replace(TOKEN, (match) => tokenMap.get(match.toLowerCase()));
  }
  if (orga.name.length >= 3) {
    out = out.replace(new RegExp(escape(orga.name), 'gi'), ORGANISATION_NAME);
  }
  return out;
}

/** A request as recorded (host, API path, ids, query): only its ids change, so the replay finds it. */
function anonymiseKey(key) {
  return key
    .replace(UUID, (match) => fakeUuid(match.toLowerCase()))
    .replace(SHA, (match) => createHash('sha1').update(`cvc-demo:${match}`).digest('hex'));
}

/** Amounts of the billing, scaled: plausible, and not the recorded ones. */
const AMOUNT_FACTOR = 1.37;
/** Fields emptied or set, whatever their content. */
function sanitise(key, value) {
  switch (key) {
    case 'env':
      return Array.isArray(value) ? [] : value;
    case 'description':
      return '';
    case 'webhookUrl':
      return null;
    case 'city':
      return 'Springfield';
    case 'zipcode':
      return '00000';
    case 'emergencyNumber':
      return '';
    case 'partnerName':
      return value === '' ? value : 'Demo partner';
    case 'oauthApps':
      return [];
    case 'url':
    case 'httpUrl':
    case 'deployUrl':
    case 'repository':
      // A git repository names its owner: replaced as a whole.
      return typeof value === 'string' && /\.git$|github|gitlab|bitbucket/i.test(value)
        ? `https://git.example.com/demo/${hash(value, 10)}.git`
        : value;
    case 'host':
      return typeof value === 'string' && value.endsWith('.clever-cloud.com')
        ? value.replace(/^[a-z0-9]+-/, `b${hash(value, 19)}-`)
        : value;
    case 'user':
    case 'database':
      return typeof value === 'string' ? `${value.charAt(0) || 'u'}${hash(value, 19)}` : value;
    case 'price':
      return typeof value === 'number' ? Math.round(value * AMOUNT_FACTOR * 10000) / 10000 : value;
    default:
      return value;
  }
}

/** Emptied before anything else, whatever they hold: variables and the like. */
const EMPTIED = new Set(['env', 'oauthApps', 'exposedEnv']);

function anonymiseValue(value, key = '', billing = false) {
  if (EMPTIED.has(key) && Array.isArray(value)) {
    return [];
  }
  if (Array.isArray(value)) {
    return value.map((item) => anonymiseValue(item, key, billing));
  }
  if (value != null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([innerKey, inner]) => [
        anonymiseText(innerKey),
        anonymiseValue(inner, innerKey, billing),
      ]),
    );
  }
  const sanitised = key === 'price' && !billing ? value : sanitise(key, value);
  return typeof sanitised === 'string' ? anonymiseText(sanitised) : sanitised;
}

const fixtures = {};
for (const [key, response] of Object.entries(keptResponses)) {
  const billing = key.includes('/v4/billing/') && key.includes('/consumption');
  let body = response.body;
  try {
    body = JSON.stringify(anonymiseValue(JSON.parse(body), '', billing));
  } catch {
    body = anonymiseText(body);
  }
  fixtures[anonymiseKey(key)] = { ...response, body };
}
const ids = JSON.parse(anonymiseKey(JSON.stringify(recordedIds)));
// The organisation, as the interface names it.
const fixtureSummaryKey = anonymiseKey(summaryKey);
const demoSummary = JSON.parse(fixtures[fixtureSummaryKey].body);
demoSummary.organisations[0].name = ORGANISATION_NAME;
fixtures[fixtureSummaryKey].body = JSON.stringify(demoSummary);

// --- checking -----------------------------------------------------------------------------

const output = JSON.stringify({ fixtures, ids }).toLowerCase();
const leaks = [];
/** Found as a whole word or id, not inside another word ("work" in "network"). */
const found = (value) => new RegExp(`(?<![a-z0-9])${escape(String(value).toLowerCase())}(?![a-z0-9])`).test(output);
const check = (label, values) => {
  for (const value of values) {
    if (value != null && String(value).length >= 4 && found(value)) {
      leaks.push(label);
      if (process.env.CVC_DEBUG) {
        const at = output.indexOf(String(value).toLowerCase());
        console.error(label, JSON.stringify(String(value)), '…', output.slice(Math.max(0, at - 60), at + 40));
      }
    }
  }
};
check('organisation name', [orga.name]);
check('person', people.keys());
// Each first and last name on its own too, even inside another word (a git owner such as "janedoeacme").
for (const part of [...people.keys()].flatMap((name) => name.split(/\s+/)).filter((part) => part.length >= 5)) {
  for (const spelling of new Set([part, part.normalize('NFD').replace(/[\u0300-\u036f]/g, '')])) {
    if (output.includes(spelling.toLowerCase())) {
      leaks.push('person');
    }
  }
}
check('email', [summary.user.email, ...[...Object.values(responses)].flatMap((r) => r.body.match(EMAIL) ?? [])]);
check('name token', sensitiveTokens);
check(
  'id',
  [...keptOwners, ...keptResources].map((id) => id.replace(/^[a-z]+_/, '')),
);
check(
  'commit',
  Object.values(keptResponses).flatMap((r) => r.body.match(SHA) ?? []),
);
if (leaks.length > 0) {
  const counts = leaks.reduce((acc, label) => ({ ...acc, [label]: (acc[label] ?? 0) + 1 }), {});
  console.error('Not anonymised, nothing written:', counts);
  process.exit(1);
}

mkdirSync(OUT, { recursive: true });
writeFileSync(new URL('responses.json', OUT), `${JSON.stringify(fixtures, null, 1)}\n`);
writeFileSync(new URL('ids.json', OUT), `${JSON.stringify(ids, null, 2)}\n`);
console.log(
  `${Object.keys(fixtures).length} answers anonymised (${Object.keys(responses).length - Object.keys(keptResponses).length} left out), ${tokenMap.size} names, ${people.size} people`,
);
