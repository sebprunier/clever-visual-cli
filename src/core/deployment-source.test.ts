import { describe, expect, it } from 'vitest';
import type { Application } from '../data/api.js';
import { branchCurl, deploymentSource } from './deployment-source.js';

type Source = Pick<Application, 'deployment' | 'branch' | 'oauthApp'>;

const github: Source = {
  deployment: {
    canShutdown: false,
    type: 'GIT',
    repoState: 'NOT_NEEDED',
    url: 'https://github.com/serli/ui-kit.git',
    httpUrl: 'https://github.com/serli/ui-kit.git',
  },
  branch: 'prod',
  oauthApp: { type: 'github', secret: 'not-shown', webhookUrl: 'https://example.test/hook' },
};

describe('deploymentSource', () => {
  it('tells a GitHub repository, with the branch it deploys', () => {
    expect(deploymentSource(github)).toEqual({
      kind: 'github',
      repository: 'serli/ui-kit',
      url: 'https://github.com/serli/ui-kit',
      branch: 'prod',
    });
  });

  it("tells Clever Cloud's git repository, deployed by a push", () => {
    const cleverGit: Source = {
      deployment: {
        canShutdown: false,
        type: 'GIT',
        repoState: 'CREATED',
        url: 'git+ssh://git@push-n3-par-clevercloud-customers.services.clever-cloud.com/app_1.git',
        httpUrl: 'https://push-n3-par-clevercloud-customers.services.clever-cloud.com/app_1.git',
      },
      branch: 'master',
    };
    expect(deploymentSource(cleverGit)).toEqual({
      kind: 'clever-git',
      remote: 'https://push-n3-par-clevercloud-customers.services.clever-cloud.com/app_1.git',
      branch: 'master',
    });
  });

  it('tells FTP', () => {
    expect(deploymentSource({ ...github, deployment: { ...github.deployment, type: 'FTP' } })).toEqual({
      kind: 'ftp',
      method: 'FTP',
    });
  });
});

describe('branchCurl', () => {
  it('changes the branch through the API, clever-tools having no command for it', () => {
    expect(branchCurl('orga_1', 'app_2', 'feature/new')).toBe(
      `clever curl -X PUT -H 'Content-Type: application/json' -d '{"branch":"feature/new"}' https://api.clever-cloud.com/v2/organisations/orga_1/applications/app_2/branch`,
    );
  });
});
