import { describe, expect, it } from 'vitest';
import { addonDocsPath, appDocsPath } from './docs.js';

describe('documentation sections', () => {
  it('points each tab of the application page at its section', () => {
    expect(appDocsPath('env')).toBe('guide/application.html#variables');
    expect(appDocsPath('deployments')).toBe('guide/application.html#activity');
    expect(appDocsPath('logs')).toBe('guide/application.html#logs');
    expect(appDocsPath('logs', true)).toBe('guide/application.html#deployment-logs');
  });

  it('points an add-on at the section of its family', () => {
    expect(addonDocsPath('postgresql-addon', 'overview')).toBe('guide/addons.html#databases');
    expect(addonDocsPath('mysql-addon', 'backups')).toBe('guide/addons.html#backups');
    expect(addonDocsPath('cellar-addon', 'buckets')).toBe('guide/addons.html#cellar');
    expect(addonDocsPath('config-provider', 'env')).toBe('guide/addons.html#configuration-providers');
    expect(addonDocsPath('fs-bucket', 'overview')).toBe('guide/addons.html#page');
  });
});
