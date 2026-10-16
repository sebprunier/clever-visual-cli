/**
 * The only module that imports `@clevercloud/client` commands. Views go
 * through these functions so the command classes, their id-resolution quirks
 * and the "beta, may change" surface of the client stay in one place.
 */
import type { CcApiClient } from '@clevercloud/client/cc-api-client.js';
import type { Application } from '@clevercloud/client/cc-api-commands/application/application.types.js';
import { GetApplicationCommand } from '@clevercloud/client/cc-api-commands/application/get-application-command.js';
import type { DeploymentLegacy } from '@clevercloud/client/cc-api-commands/deployment/deployment.types.js';
import { ListDeploymentCommand } from '@clevercloud/client/cc-api-commands/deployment/list-deployment-command.js';
import type { GetEnvironmentCommandOutput } from '@clevercloud/client/cc-api-commands/environment/environment.types.js';
import { GetEnvironmentCommand } from '@clevercloud/client/cc-api-commands/environment/get-environment-command.js';
import type { Instance } from '@clevercloud/client/cc-api-commands/instance/instance.types.js';
import { ListApplicationInstanceCommand } from '@clevercloud/client/cc-api-commands/instance/list-application-instance-command.js';
import type { LogsStream } from '@clevercloud/client/cc-api-commands/log/abstract-logs-stream-command.js';
import type { ApplicationRuntimeLog } from '@clevercloud/client/cc-api-commands/log/log.types.js';
import { StreamApplicationRuntimeLogCommand } from '@clevercloud/client/cc-api-commands/log/stream-application-runtime-log-command.js';
import { GetOrganisationSummaryCommand } from '@clevercloud/client/cc-api-commands/organisation/get-organisation-summary-command.js';
import type { GetOrganisationSummaryCommandOutput } from '@clevercloud/client/cc-api-commands/organisation/get-organisation-summary-command.types.js';
import type {
  ApplicationSummary,
  AddonSummary,
  OrganisationSummary,
} from '@clevercloud/client/cc-api-commands/organisation/organisation.types.js';
import { GetProfileCommand } from '@clevercloud/client/cc-api-commands/profile/get-profile-command.js';
import type { Profile } from '@clevercloud/client/cc-api-commands/profile/profile.types.js';

export type {
  AddonSummary,
  Application,
  ApplicationRuntimeLog,
  ApplicationSummary,
  DeploymentLegacy as Deployment,
  GetEnvironmentCommandOutput as Environment,
  Instance,
  LogsStream,
  OrganisationSummary,
  Profile,
};

export type Summary = GetOrganisationSummaryCommandOutput;

export function fetchProfile(client: CcApiClient): Promise<Profile> {
  return client.send(new GetProfileCommand());
}

/** Everything the user can see, in one request: organisations with their applications and add-ons. */
export function fetchSummary(client: CcApiClient): Promise<Summary> {
  return client.send(new GetOrganisationSummaryCommand());
}

export function fetchApplication(client: CcApiClient, ownerId: string, applicationId: string): Promise<Application> {
  return client.send(new GetApplicationCommand({ ownerId, applicationId }));
}

export function fetchInstances(client: CcApiClient, ownerId: string, applicationId: string): Promise<Instance[]> {
  return client.send(new ListApplicationInstanceCommand({ ownerId, applicationId, excludeState: ['DELETED'] }));
}

export function fetchDeployments(
  client: CcApiClient,
  ownerId: string,
  applicationId: string,
  limit = 20,
): Promise<DeploymentLegacy[]> {
  return client.send(new ListDeploymentCommand({ ownerId, applicationId, limit }));
}

export function fetchEnvironment(
  client: CcApiClient,
  ownerId: string,
  applicationId: string,
): Promise<GetEnvironmentCommandOutput> {
  return client.send(
    new GetEnvironmentCommand({ ownerId, applicationId, includeLinkedAddons: true, includeLinkedApplications: true }),
  );
}

export interface RuntimeLogsOptions {
  since?: Date;
  filter?: string;
  instanceId?: string[];
}

export function openRuntimeLogs(
  client: CcApiClient,
  ownerId: string,
  applicationId: string,
  options: RuntimeLogsOptions = {},
): Promise<LogsStream<ApplicationRuntimeLog>> {
  return client.stream(
    new StreamApplicationRuntimeLogCommand({
      ownerId,
      applicationId,
      since: options.since,
      filter: options.filter,
      instanceId: options.instanceId,
    }),
  );
}
