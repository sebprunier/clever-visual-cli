/**
 * Where the user documentation lives (#15): beside the interface under `docs/`
 * once published; from the development server, the published one.
 */
import { operatorKind } from './addons/operator.js';
import type { AddonTab, AppTab } from './router.js';

const PUBLISHED_DOCS = 'https://sebprunier.github.io/clever-visual-cli/docs/';

/** A page of the documentation, with its section: `docsUrl('guide/application.html#logs')`. */
export function docsUrl(path = ''): string {
  const root = import.meta.env.DEV ? PUBLISHED_DOCS : `${import.meta.env.BASE_URL}docs/`;
  return `${root}${path}`;
}

const APP_SECTIONS: Record<AppTab, string> = {
  overview: 'overview',
  logs: 'logs',
  deployments: 'activity',
  domains: 'domains',
  env: 'variables',
  dependencies: 'dependencies',
};

/** The section about a tab of the application page; a deployment's logs have their own. */
export function appDocsPath(tab: AppTab, deployment = false): string {
  return `guide/application.html#${tab === 'logs' && deployment ? 'deployment-logs' : APP_SECTIONS[tab]}`;
}

const DATABASES = ['postgresql-addon', 'mysql-addon', 'redis-addon', 'mongodb-addon'];

/** The section about an add-on's family, or its Backups tab; the add-on page in general otherwise. */
export function addonDocsPath(providerId: string, tab: AddonTab): string {
  let section = 'page';
  if (DATABASES.includes(providerId)) {
    section = tab === 'backups' ? 'backups' : 'databases';
  } else if (providerId === 'es-addon') {
    section = tab === 'backups' ? 'backups' : 'elasticsearch';
  } else if (providerId === 'config-provider') {
    section = 'configuration-providers';
  } else if (providerId === 'cellar-addon') {
    section = 'cellar';
  } else if (operatorKind(providerId) != null) {
    section = 'operators';
  }
  return `guide/addons.html#${section}`;
}
