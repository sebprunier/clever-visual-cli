import { describe, expect, it } from 'vitest';
import { archiveCurl, confirmsName } from './danger-zone.js';

describe('archiveCurl', () => {
  it('sends archived to the application', () => {
    expect(archiveCurl('orga_1', 'app_2', true)).toBe(
      `clever curl -X PUT -H 'Content-Type: application/json' -d '{"archived":true}' https://api.clever-cloud.com/v2/organisations/orga_1/applications/app_2`,
    );
    expect(archiveCurl('orga_1', 'app_2', false)).toContain(`-d '{"archived":false}'`);
  });
});

describe('confirmsName', () => {
  it('wants the name as it is', () => {
    expect(confirmsName('serli-ui-kit', 'serli-ui-kit')).toBe(true);
    expect(confirmsName('  serli-ui-kit ', 'serli-ui-kit')).toBe(true);
    expect(confirmsName('Serli-UI-Kit', 'serli-ui-kit')).toBe(false);
    expect(confirmsName('serli', 'serli-ui-kit')).toBe(false);
    expect(confirmsName('', '')).toBe(false);
  });
});
