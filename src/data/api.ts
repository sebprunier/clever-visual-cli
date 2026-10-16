/**
 * The only module that imports `@clevercloud/client` commands. Views and
 * actions go through these functions so the command classes, their
 * id-resolution quirks and the "beta, may change" surface of the client stay
 * in one place.
 */
import type { CcApiClient } from '@clevercloud/client/cc-api-client.js';
import type { Application } from '@clevercloud/client/cc-api-commands/application/application.types.js';
import { DeployApplicationCommand } from '@clevercloud/client/cc-api-commands/application/deploy-application-command.js';
import { GetApplicationCommand } from '@clevercloud/client/cc-api-commands/application/get-application-command.js';
import { UndeployApplicationCommand } from '@clevercloud/client/cc-api-commands/application/undeploy-application-command.js';
import { UpdateApplicationCommand } from '@clevercloud/client/cc-api-commands/application/update-application-command.js';
import type { UpdateApplicationCommandInput } from '@clevercloud/client/cc-api-commands/application/update-application-command.types.js';
import { CancelDeploymentCommand } from '@clevercloud/client/cc-api-commands/deployment/cancel-deployment-command.js';
import type { DeploymentLegacy } from '@clevercloud/client/cc-api-commands/deployment/deployment.types.js';
import { ListDeploymentCommand } from '@clevercloud/client/cc-api-commands/deployment/list-deployment-command.js';
import type { Link } from '@clevercloud/client/cc-api-commands/link/link.types.js';
import { ListLinkCommand } from '@clevercloud/client/cc-api-commands/link/list-link-command.js';
import { CreateDomainCommand } from '@clevercloud/client/cc-api-commands/domain/create-domain-command.js';
import { DeleteDomainCommand } from '@clevercloud/client/cc-api-commands/domain/delete-domain-command.js';
import { SetPrimaryDomainCommand } from '@clevercloud/client/cc-api-commands/domain/set-primary-domain-command.js';
import { CreateOrUpdateEnvironmentVariableCommand } from '@clevercloud/client/cc-api-commands/environment/create-or-update-environment-variable-command.js';
import { DeleteEnvironmentVariableCommand } from '@clevercloud/client/cc-api-commands/environment/delete-environment-variable-command.js';
import type { GetEnvironmentCommandOutput } from '@clevercloud/client/cc-api-commands/environment/environment.types.js';
import { GetEnvironmentCommand } from '@clevercloud/client/cc-api-commands/environment/get-environment-command.js';
import { UpdateEnvironmentCommand } from '@clevercloud/client/cc-api-commands/environment/update-environment-command.js';
import type { Instance } from '@clevercloud/client/cc-api-commands/instance/instance.types.js';
import { ListApplicationInstanceCommand } from '@clevercloud/client/cc-api-commands/instance/list-application-instance-command.js';
import type { LogsStream } from '@clevercloud/client/cc-api-commands/log/abstract-logs-stream-command.js';
import type { ApplicationRuntimeLog } from '@clevercloud/client/cc-api-commands/log/log.types.js';
import { StreamApplicationRuntimeLogCommand } from '@clevercloud/client/cc-api-commands/log/stream-application-runtime-log-command.js';
import { GetOrganisationSummaryCommand } from '@clevercloud/client/cc-api-commands/organisation/get-organisation-summary-command.js';
import type { GetOrganisationSummaryCommandOutput } from '@clevercloud/client/cc-api-commands/organisation/get-organisation-summary-command.types.js';
import type {
  AddonSummary,
  ApplicationSummary,
  OrganisationSummary,
} from '@clevercloud/client/cc-api-commands/organisation/organisation.types.js';
import { GetProfileCommand } from '@clevercloud/client/cc-api-commands/profile/get-profile-command.js';
import { CreateTagCommand } from '@clevercloud/client/cc-api-commands/tag/create-tag-command.js';
import { DeleteTagCommand } from '@clevercloud/client/cc-api-commands/tag/delete-tag-command.js';
import type { Profile } from '@clevercloud/client/cc-api-commands/profile/profile.types.js';
import { ERROR_TYPES, parseRaw } from '@clevercloud/client/utils/environment-utils.js';
import { t } from '../core/i18n.js';
import type { EnvironmentVariable, EnvVarParsingError } from '@clevercloud/client/utils/environment.types.js';

export type {
  AddonSummary,
  Application,
  ApplicationRuntimeLog,
  ApplicationSummary,
  DeploymentLegacy as Deployment,
  GetEnvironmentCommandOutput as Environment,
  EnvironmentVariable,
  Instance,
  LogsStream,
  OrganisationSummary,
  Profile,
};

export type Summary = GetOrganisationSummaryCommandOutput;
export type ApplicationPatch = Omit<UpdateApplicationCommandInput, 'ownerId' | 'applicationId'>;

// --- reads -----------------------------------------------------------------

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

/** Every deployment of every application of the organisation. The backend ignores `limit` here. */
export function fetchOrganisationDeployments(client: CcApiClient, ownerId: string): Promise<DeploymentLegacy[]> {
  return client.send(new ListDeploymentCommand({ ownerId }));
}

export interface ApplicationLinks {
  addonIds: string[];
  applicationIds: string[];
}

/** What an application is linked to: add-ons, and applications it depends on. Two requests. */
export async function fetchApplicationLinks(
  client: CcApiClient,
  ownerId: string,
  applicationId: string,
): Promise<ApplicationLinks> {
  const links: Link[] = await client.send(new ListLinkCommand({ ownerId, applicationId }));
  const result: ApplicationLinks = { addonIds: [], applicationIds: [] };
  for (const link of links) {
    if (link.type === 'link-to-addon') {
      result.addonIds.push(link.addon.id);
    } else {
      result.applicationIds.push(link.application.id);
    }
  }
  return result;
}

// --- writes ----------------------------------------------------------------

export interface RedeployOptions {
  commit?: string;
  useCache?: boolean;
}

/** `clever restart`: redeploys the current commit, or the given one. */
export function redeployApplication(
  client: CcApiClient,
  ownerId: string,
  applicationId: string,
  options: RedeployOptions = {},
): Promise<{ deploymentId: string }> {
  return client.send(
    new DeployApplicationCommand({ ownerId, applicationId, commit: options.commit, useCache: options.useCache }),
  );
}

/** `clever stop` */
export async function undeployApplication(client: CcApiClient, ownerId: string, applicationId: string): Promise<void> {
  await client.send(new UndeployApplicationCommand({ ownerId, applicationId }));
}

/** `clever cancel-deploy` */
export async function cancelDeployment(
  client: CcApiClient,
  ownerId: string,
  applicationId: string,
  deploymentId: string,
): Promise<void> {
  await client.send(new CancelDeploymentCommand({ ownerId, applicationId, deploymentId }));
}

/** `clever scale`, `clever config set`, and every other field of the application. */
export function updateApplication(
  client: CcApiClient,
  ownerId: string,
  applicationId: string,
  patch: ApplicationPatch,
): Promise<Application> {
  return client.send(new UpdateApplicationCommand({ ownerId, applicationId, ...patch }));
}

/** `clever env set` */
export async function setEnvironmentVariable(
  client: CcApiClient,
  ownerId: string,
  applicationId: string,
  name: string,
  value: string,
): Promise<void> {
  await client.send(new CreateOrUpdateEnvironmentVariableCommand({ ownerId, applicationId, name, value }));
}

/** `clever env rm` */
export async function deleteEnvironmentVariable(
  client: CcApiClient,
  ownerId: string,
  applicationId: string,
  name: string,
): Promise<void> {
  await client.send(new DeleteEnvironmentVariableCommand({ ownerId, applicationId, name }));
}

/** `clever env import`: replaces the whole environment. */
export async function replaceEnvironment(
  client: CcApiClient,
  ownerId: string,
  applicationId: string,
  environment: EnvironmentVariable[],
): Promise<void> {
  await client.send(new UpdateEnvironmentCommand({ ownerId, applicationId, environment }));
}

/** `clever domain add` */
export async function addDomain(
  client: CcApiClient,
  ownerId: string,
  applicationId: string,
  domain: string,
): Promise<void> {
  await client.send(new CreateDomainCommand({ ownerId, applicationId, domain }));
}

/** `clever domain rm` */
export async function removeDomain(
  client: CcApiClient,
  ownerId: string,
  applicationId: string,
  domain: string,
): Promise<void> {
  await client.send(new DeleteDomainCommand({ ownerId, applicationId, domain }));
}

/** `clever domain favourite set` */
export async function setPrimaryDomain(
  client: CcApiClient,
  ownerId: string,
  applicationId: string,
  domain: string,
): Promise<void> {
  await client.send(new SetPrimaryDomainCommand({ ownerId, applicationId, domain }));
}

export type TagTarget = { ownerId: string; applicationId: string } | { ownerId: string; addonId: string };

/** Adds a tag to an application or an add-on; returns the tags it now has. No clever-tools equivalent. */
export function addTag(client: CcApiClient, target: TagTarget, tag: string): Promise<string[]> {
  return client.send(new CreateTagCommand({ ...target, tag }));
}

/** Removes a tag from an application or an add-on; returns the tags left. No clever-tools equivalent. */
export function removeTag(client: CcApiClient, target: TagTarget, tag: string): Promise<string[]> {
  return client.send(new DeleteTagCommand({ ...target, tag }));
}

// --- helpers ---------------------------------------------------------------

/** Parses `NAME=value` lines the way clever-tools and the Console do, with translated error messages. */
export function parseEnvFile(raw: string): { variables: EnvironmentVariable[]; errors: string[] } {
  const { variables, errors } = parseRaw(raw, { mode: 'simple' });
  return {
    variables,
    errors: errors.filter((error) => error.type !== ERROR_TYPES.JAVA_INFO).map(describeParsingError),
  };
}

function describeParsingError(error: EnvVarParsingError): string {
  const where = error.pos != null ? t('env.parse.line', { line: error.pos.line }) : t('env.parse.content');
  const name = error.name != null ? ` (${error.name})` : '';
  switch (error.type) {
    case ERROR_TYPES.INVALID_NAME:
    case ERROR_TYPES.INVALID_NAME_STRICT:
      return t('env.parse.invalidName', { where, name });
    case ERROR_TYPES.DUPLICATED_NAME:
      return t('env.parse.duplicate', { where, name });
    case ERROR_TYPES.INVALID_LINE:
      return t('env.parse.invalidLine', { where });
    case ERROR_TYPES.INVALID_VALUE:
      return t('env.parse.invalidValue', { where, name });
    default:
      return t('env.parse.syntax', { where, name });
  }
}
