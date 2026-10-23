/**
 * Where an application's code comes from (#32): a GitHub repository, which
 * deploys on every push to its branch; Clever Cloud's own git repository,
 * which deploys on `git push clever`; or FTP / SFTP. The API calls all of
 * them `GIT` or `FTP`, the repository URL tells GitHub apart, as the client
 * does (`oauthApp`).
 */
import type { Application } from '../data/api.js';
import { API_HOST } from './constants.js';
import { shellQuote } from './shell.js';

export type DeploymentSource =
  | { kind: 'github'; repository: string; url: string; branch: string }
  | { kind: 'clever-git'; remote: string; branch: string }
  | { kind: 'ftp'; method: string };

const GITHUB_REPOSITORY = /^https:\/\/github\.com\/([^/]+\/[^/]+?)(?:\.git)?\/?$/;

export function deploymentSource(app: Pick<Application, 'deployment' | 'branch' | 'oauthApp'>): DeploymentSource {
  const { deployment } = app;
  if (deployment.type !== 'GIT') {
    return { kind: 'ftp', method: deployment.type };
  }
  const match = GITHUB_REPOSITORY.exec(deployment.httpUrl ?? '');
  if (app.oauthApp?.type === 'github' && match != null) {
    const repository = match[1];
    return { kind: 'github', repository, url: `https://github.com/${repository}`, branch: app.branch };
  }
  return { kind: 'clever-git', remote: deployment.httpUrl ?? deployment.url, branch: app.branch || 'master' };
}

/** `PUT …/branch`: clever-tools has no command for the branch a GitHub application deploys. */
export function branchCurl(ownerId: string, appId: string, branch: string): string {
  const url = `${API_HOST}/v2/organisations/${ownerId}/applications/${appId}/branch`;
  return `clever curl -X PUT -H 'Content-Type: application/json' -d ${shellQuote(JSON.stringify({ branch }))} ${shellQuote(url)}`;
}
