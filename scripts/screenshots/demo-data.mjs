/**
 * What the screenshots show that was never recorded: environment variables,
 * the views kept by the sync, the platform status, the latest clever-tools
 * release, log lines. All made up.
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

const RUNTIME = [
  ['info', 'Started DemoApplication in 6.218 seconds (process running for 7.1)'],
  ['info', 'GET /api/menus 200 18ms'],
  ['info', 'GET /api/menus/today 200 9ms'],
  ['info', 'POST /api/orders 201 42ms'],
  ['warning', 'Slow query on orders: 812ms'],
  ['info', 'GET /health 200 2ms'],
  ['info', 'GET /api/restaurants 200 23ms'],
  ['info', 'Scheduled job "send-reminders" done: 14 messages'],
  ['info', 'GET /api/menus 200 15ms'],
  ['err', 'Payment provider timed out after 5000ms (order 4812), retrying'],
  ['info', 'POST /api/orders 201 37ms'],
  ['info', 'GET /api/me 200 6ms'],
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

function lines(messages, appId, deploymentId, now, spacing, service) {
  return messages.map(([severity, message], index) => ({
    id: `${appId}-${deploymentId ?? 'live'}-${index}`,
    date: new Date(now - (messages.length - index) * spacing).toISOString(),
    applicationId: appId,
    deploymentId: deploymentId ?? 'deployment_demo',
    instanceId: 'instance_demo',
    service,
    severity,
    message,
    region: 'par',
    zone: 'par',
  }));
}

/** Log lines by application, and the lines of the failed deployment. */
export function logLines(ids, now, deploymentDate) {
  const apps = {};
  [ids.app, ...ids.logsApps].forEach((appId, index) => {
    const offset = index * 4_000;
    apps[appId] = lines(RUNTIME, appId, null, now - offset, 9_000, 'bas');
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
      ),
    },
  };
}
