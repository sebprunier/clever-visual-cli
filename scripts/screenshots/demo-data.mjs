/**
 * What the screenshots show that was never recorded: environment variables,
 * the views kept by the sync, the platform status, the latest clever-tools
 * release, log lines, the instances that wrote them. All made up.
 */

/** An application's variables (shown hidden). */
export const VARIABLES = [
  { name: 'CC_JAVA_VERSION', value: '21' },
  { name: 'CC_PRE_RUN_HOOK', value: './scripts/migrate.sh' },
  { name: 'DATABASE_URL', value: 'postgresql://demo:demo@db.example.com:5432/demo' },
  { name: 'JAVA_OPTS', value: '-Xmx512m' },
  { name: 'MAIL_FROM', value: 'noreply@example.com' },
  { name: 'PORT', value: '8080' },
  { name: 'SPRING_PROFILES_ACTIVE', value: 'prod' },
];

/** Favourite views of the organisation shown. */
export function favourites(updatedAt) {
  const sort = { column: 'name', direction: 'asc' };
  return {
    views: [
      { id: 'demo-prod', name: 'Production by project', filter: 'env:prod', grouping: 'project', sort, updatedAt },
      { id: 'demo-watch', name: 'To watch', filter: 'is:watch', grouping: 'project > env', sort, updatedAt },
      {
        id: 'demo-db',
        name: 'Databases',
        filter: 'is:postgresql OR is:mysql OR is:redis',
        grouping: 'type',
        sort,
        updatedAt,
      },
    ],
    updatedAt,
  };
}

/** The variables of the sync add-on: the same views. */
export function syncVariables(orgaId, updatedAt) {
  const key = `CVC_ORGA_${orgaId
    .replace(/^orga_/, '')
    .replace(/-/g, '_')
    .toUpperCase()}`;
  return [
    { name: 'CVC_META', value: '{"version":1}' },
    {
      name: key,
      value: JSON.stringify({
        ownerId: orgaId,
        prefs: {
          grouping: 'project > env',
          sort: { column: 'name', direction: 'asc' },
          collapsed: [],
          costs: true,
          costSource: 'days30',
          updatedAt,
        },
        favorites: favourites(updatedAt),
      }),
    },
  ];
}

/** The status page: all is well, the last incident resolved a few days ago. */
export function platformStatus(now) {
  const day = 86_400_000;
  return {
    status: { status: 1, label: 'Operational', active_incidents_count: 0 },
    incidents: {
      data: [
        {
          uuid: 'demo-incident',
          name: 'Slower deployments in one zone',
          occurred_at: new Date(now - 3 * day).toISOString(),
          resolved_at: new Date(now - 3 * day + 2 * 3_600_000).toISOString(),
          components: [{ name: 'Deployments' }],
        },
      ],
    },
  };
}

/**
 * The live logs tell one incident across three applications, as `[seconds ago, severity, message]`:
 * 27 s ago the API gives up on the payment provider, the gateway answers 502 and opens its circuit,
 * the worker keeps order 4812 waiting.
 */
const API = [
  [108, 'info', 'Started DemoApplication in 6.218 seconds (process running for 7.1)'],
  [99, 'info', 'GET /api/menus 200 18ms'],
  [90, 'info', 'GET /api/menus/today 200 9ms'],
  [81, 'info', 'POST /api/orders 201 42ms'],
  [72, 'warning', 'Slow query on orders: 812ms'],
  [63, 'info', 'GET /health 200 2ms'],
  [54, 'info', 'GET /api/restaurants 200 23ms'],
  [45, 'info', 'Scheduled job "send-reminders" done: 14 messages'],
  [36, 'info', 'GET /api/menus 200 15ms'],
  [27, 'err', 'Payment provider timed out after 5000ms (order 4812), retrying'],
  [18, 'info', 'POST /api/orders 201 37ms'],
  [9, 'info', 'GET /api/me 200 6ms'],
];
const GATEWAY = [
  [104, 'info', 'Listening on :8080, 3 upstreams'],
  [98.6, 'info', 'api GET /api/menus 200 21ms'],
  [80.6, 'info', 'api POST /api/orders 201 45ms'],
  [71.8, 'warning', 'api GET /api/orders 200 826ms (slow)'],
  [53.6, 'info', 'api GET /api/restaurants 200 26ms'],
  [26.8, 'err', 'api POST /api/payments 502 after 5004ms'],
  [26.5, 'warning', 'circuit "payments" open, next try in 10s'],
  [17.6, 'info', 'api POST /api/orders 201 40ms'],
  [8.6, 'info', 'api GET /api/me 200 8ms'],
];
const WORKER = [
  [101, 'info', 'Worker started, queue "orders", 3 consumers'],
  [78, 'info', 'Order 4810 confirmed, receipt sent'],
  [60, 'info', 'Order 4811 confirmed, receipt sent'],
  [44.5, 'info', 'Reminders: 14 messages queued'],
  [25.5, 'warning', 'Order 4812 waiting for payment, attempt 1/3'],
  [24, 'err', 'Order 4812: payment provider unreachable, retry in 30s'],
  [12, 'info', 'Order 4813 confirmed, receipt sent'],
];

const FAILED_BUILD = [
  ['info', 'Cloning repository and checking out commit'],
  ['info', 'Using Java 21 and Maven 3.9'],
  ['info', '[INFO] Scanning for projects...'],
  ['info', '[INFO] Building demo-app 2.4.0'],
  ['info', '[INFO] --- compiler:3.13.0:compile (default-compile) @ demo-app ---'],
  ['info', '[INFO] Compiling 142 source files with javac [debug release 21] to target/classes'],
  ['err', '[ERROR] /build/src/main/java/com/example/booking/SlotService.java:[57,24] cannot find symbol'],
  ['err', '[ERROR]   symbol:   method findAvailable(java.time.LocalDate)'],
  ['info', '[INFO] BUILD FAILURE'],
  ['info', '[INFO] Total time:  41.6 s'],
  ['err', '[ERROR] Failed to execute goal org.apache.maven.plugins:maven-compiler-plugin:3.13.0:compile'],
  ['err', 'Deploy failed in 0 minutes and 53 seconds. Please review the lines above to find out why.'],
];

/** The instances made up next to the recorded ones (#38). */
export const DEMO_IDS = {
  /** The deployment of the API three minutes ago, a maintenance, and its instance. */
  redeployment: 'deployment_5b1e9d27-c3a4-4e8f-b6d2-7a9c0e1f3d45',
  current: '3c9e5a14-7b2d-4f61-9a8e-2d4b6c8f0e13',
  /** A second instance of the deployment before, under last night's load. */
  night: 'a41f7c26-5e83-4b9d-8c17-6f2e0d9b3a58',
  /** The instance of the failed deployment of the other application: it built, and failed. */
  failed: '9d2b6e41-0c7f-4a35-b8e9-1f4d7a2c6e90',
};
/** Seconds ago: the redeployment of the API, its new instance created, the previous one deleted. */
const REDEPLOYED = 170;
const CURRENT_CREATED = 150;
const PREVIOUS_DELETED = 22;
/** The lines of the API its new instance wrote: it started, answered its health check, then served alone. */
const CURRENT_LINES = new Set([108, 63, 18, 9]);

/**
 * Who wrote a line of the API: the new instance, or the previous one, which served until it was
 * deleted 22 s ago and wrote the slow query and the payment timeout.
 */
function apiSource(previous) {
  return (secondsAgo) =>
    CURRENT_LINES.has(secondsAgo) || secondsAgo < PREVIOUS_DELETED
      ? { instanceId: DEMO_IDS.current, deploymentId: DEMO_IDS.redeployment }
      : { instanceId: previous.id, deploymentId: previous.deploymentId };
}

function lines(messages, appId, deploymentId, now, spacing, service, source) {
  return timeline(
    messages.map(([severity, message], index) => [((messages.length - index) * spacing) / 1000, severity, message]),
    appId,
    deploymentId,
    now,
    service,
    source,
  );
}

function timeline(entries, appId, deploymentId, now, service, source = () => ({})) {
  return entries.map(([secondsAgo, severity, message], index) => ({
    id: `${appId}-${deploymentId ?? 'live'}-${index}`,
    date: new Date(now - secondsAgo * 1000).toISOString(),
    applicationId: appId,
    deploymentId: deploymentId ?? 'deployment_demo',
    instanceId: 'instance_demo',
    ...source(secondsAgo),
    service,
    severity,
    message,
    region: 'par',
    zone: 'par',
  }));
}

/**
 * The instances of the demo, as the API lists them (#38), by application. The API was redeployed
 * three minutes ago for a maintenance: `previous`, its recorded instance, served until the new
 * one was up; a second instance of the same deployment ran last night, out of the default window
 * but within the last 24 hours. The failed deployment had one instance, which built and failed.
 */
export function demoInstances(ids, now, previous, failedDeployment) {
  const ago = (seconds) => new Date(now - seconds * 1000).toISOString();
  const made = { network: null, isBuildVm: false };
  return {
    [ids.app]: [
      { ...previous, state: 'DELETED', deletionDate: ago(PREVIOUS_DELETED) },
      {
        ...previous,
        ...made,
        id: DEMO_IDS.night,
        name: 'Calm lapras',
        index: 1,
        state: 'DELETED',
        hypervisorId: 'hv-par8-014',
        creationDate: ago(13 * 3600),
        deletionDate: ago(10 * 3600),
      },
      {
        ...previous,
        ...made,
        id: DEMO_IDS.current,
        deploymentId: DEMO_IDS.redeployment,
        name: 'Swift ninjask',
        index: 0,
        state: 'UP',
        hypervisorId: 'hv-par8-021',
        creationDate: ago(CURRENT_CREATED),
        deletionDate: null,
      },
    ],
    [ids.failedApp]: [
      {
        ...made,
        id: DEMO_IDS.failed,
        ownerId: ids.orga,
        applicationId: ids.failedApp,
        resourceId: ids.failedApp,
        deploymentId: ids.failedDeployment,
        name: 'Eager bagon',
        flavor: 'XS',
        index: 0,
        state: 'DELETED',
        hypervisorId: 'hv-par8-007',
        creationDate: new Date(Date.parse(failedDeployment.startDate) + 1500).toISOString(),
        deletionDate: failedDeployment.steps.at(-1).date,
      },
    ],
  };
}

/** The deployments of the demo, newest first, before the recorded ones (v2): the redeployment of the API. */
export function demoDeployments(ids, now, before) {
  return {
    [ids.app]: [
      {
        ...before,
        id: before.id + 1,
        uuid: DEMO_IDS.redeployment,
        date: now - REDEPLOYED * 1000,
        state: 'OK',
        action: 'DEPLOY',
        cause: 'Maintenance',
        instances: 1,
      },
    ],
  };
}

/**
 * Log lines by application (the API, then a gateway and a worker), and the lines of the failed
 * deployment, each from the instance that wrote it.
 */
export function logLines(ids, now, deploymentDate, previous) {
  const others = ids.logsApps.filter((appId) => appId !== ids.app);
  const apps = { [ids.app]: timeline(API, ids.app, null, now, 'bas', apiSource(previous)) };
  [GATEWAY, WORKER].forEach((entries, index) => {
    if (others[index] != null) {
      apps[others[index]] = timeline(entries, others[index], null, now, 'bas');
    }
  });
  return {
    apps,
    deployments: {
      [ids.failedDeployment]: lines(
        FAILED_BUILD,
        ids.failedApp,
        ids.failedDeployment,
        Date.parse(deploymentDate) + 60_000,
        4_000,
        'bas',
        () => ({ instanceId: DEMO_IDS.failed }),
      ),
    },
  };
}

/** The API's requests, as `[seconds ago, method, path, status, duration in ms, bytes sent]`. */
const REQUESTS = [
  [99.4, 'GET', '/api/menus', 200, 18, 4210],
  [90.3, 'GET', '/api/menus/today', 200, 9, 1830],
  [81.2, 'POST', '/api/orders', 201, 42, 512],
  [72.9, 'GET', '/api/orders', 200, 823, 9640],
  [63.1, 'GET', '/health', 200, 2, 64],
  [54.3, 'GET', '/api/restaurants', 200, 23, 8810],
  [47, 'GET', '/assets/app.js', 304, 1, 0],
  [36.2, 'GET', '/api/menus', 200, 15, 4210],
  [32, 'POST', '/api/payments', 502, 5003, 128],
  [21, 'GET', '/api/orders/4812', 404, 4, 96],
  [18.3, 'POST', '/api/orders', 201, 37, 498],
  [9.2, 'GET', '/api/me', 200, 6, 712],
];
/** Clients from the documentation address range (RFC 5737), never real ones. */
const CLIENTS = [
  ['203.0.113.24', 'Nantes', 'FR'],
  ['203.0.113.71', 'Lyon', 'FR'],
  ['203.0.113.130', 'Paris', 'FR'],
  ['203.0.113.205', 'Brussels', 'BE'],
];

/**
 * Access log entries of the API, as the stream sends them: each request next to what the API logged
 * of it, served by the previous instance until it was deleted, then by the new one.
 */
export function accessLines(appId, now, previous) {
  return REQUESTS.map(([secondsAgo, method, path, statusCode, time, bytesOut], index) => {
    const [ip, city, countryCode] = CLIENTS[index % CLIENTS.length];
    return {
      id: `${appId}-access-${index}`,
      date: new Date(now - secondsAgo * 1000).toISOString(),
      applicationId: appId,
      instanceId: secondsAgo < PREVIOUS_DELETED ? DEMO_IDS.current : previous.id,
      requestId: `request-${index}`,
      bytesIn: method === 'POST' ? 420 : 0,
      bytesOut,
      source: { ip, port: 50_000 + index, city, countryCode },
      destination: { ip: '192.0.2.10', port: 8080 },
      zone: 'par',
      http: {
        request: { method, path, host: 'demo.example.com', scheme: 'https', userAgent: 'Mozilla/5.0' },
        response: { statusCode, time },
      },
    };
  });
}
