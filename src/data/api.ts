/**
 * The only module that imports `@clevercloud/client` commands. Views and
 * actions go through these functions so the command classes, their
 * id-resolution quirks and the "beta, may change" surface of the client stay
 * in one place.
 */
import type { CcApiClient } from '@clevercloud/client/cc-api-client.js';
import { isCcHttpErrorWithCode } from '@clevercloud/client/utils/error-utils.js';
import type { Addon } from '@clevercloud/client/cc-api-commands/addon/addon.types.js';
import { GetAddonCommand } from '@clevercloud/client/cc-api-commands/addon/get-addon-command.js';
import { ListAddonCommand } from '@clevercloud/client/cc-api-commands/addon/list-addon-command.js';
import { UpdateAddonCommand } from '@clevercloud/client/cc-api-commands/addon/update-addon-command.js';
import type {
  CellarBucket,
  CellarBucketList,
  CellarBucketSummary,
  CellarDirectory,
  CellarInfo,
  CellarObjectItem,
  CellarObjectList,
} from '@clevercloud/client/cc-api-commands/cellar/cellar.types.js';
import {
  CREATE_CELLAR_BUCKET_ERROR_CODES,
  CreateCellarBucketCommand,
} from '@clevercloud/client/cc-api-commands/cellar/create-cellar-bucket-command.js';
import { GetCellarBucketCommand } from '@clevercloud/client/cc-api-commands/cellar/get-cellar-bucket-command.js';
import { GetCellarInfoCommand } from '@clevercloud/client/cc-api-commands/cellar/get-cellar-info-command.js';
import { GetCellarObjectDownloadUrlCommand } from '@clevercloud/client/cc-api-commands/cellar/get-cellar-object-download-url-command.js';
import { ListCellarBucketCommand } from '@clevercloud/client/cc-api-commands/cellar/list-cellar-bucket-command.js';
import { ListCellarObjectCommand } from '@clevercloud/client/cc-api-commands/cellar/list-cellar-object-command.js';
import { GetConfigProviderCommand } from '@clevercloud/client/cc-api-commands/config-provider/get-config-provider-command.js';
import { CheckKeycloakVersionCommand } from '@clevercloud/client/cc-api-commands/keycloak/check-keycloak-version-command.js';
import { GetKeycloakInfoCommand } from '@clevercloud/client/cc-api-commands/keycloak/get-keycloak-info-command.js';
import { RebootKeycloakCommand } from '@clevercloud/client/cc-api-commands/keycloak/reboot-keycloak-command.js';
import { RebuildKeycloakCommand } from '@clevercloud/client/cc-api-commands/keycloak/rebuild-keycloak-command.js';
import { UpdateKeycloakVersionCommand } from '@clevercloud/client/cc-api-commands/keycloak/update-keycloak-version-command.js';
import { CheckOtoroshiVersionCommand } from '@clevercloud/client/cc-api-commands/otoroshi/check-otoroshi-version-command.js';
import { GetOtoroshiInfoCommand } from '@clevercloud/client/cc-api-commands/otoroshi/get-otoroshi-info-command.js';
import { RebootOtoroshiCommand } from '@clevercloud/client/cc-api-commands/otoroshi/reboot-otoroshi-command.js';
import { RebuildOtoroshiCommand } from '@clevercloud/client/cc-api-commands/otoroshi/rebuild-otoroshi-command.js';
import { UpdateOtoroshiVersionCommand } from '@clevercloud/client/cc-api-commands/otoroshi/update-otoroshi-version-command.js';
import { UpdateConfigProviderCommand } from '@clevercloud/client/cc-api-commands/config-provider/update-config-provider-command.js';
import { ListAddonInstanceCommand } from '@clevercloud/client/cc-api-commands/addon/list-addon-instance-command.js';
import type { AddonInstance } from '@clevercloud/client/cc-api-commands/addon/list-addon-instance-command.types.js';
import type { Backup } from '@clevercloud/client/cc-api-commands/backup/backup.types.js';
import { ListBackupCommand } from '@clevercloud/client/cc-api-commands/backup/list-backup-command.js';
import type { Application } from '@clevercloud/client/cc-api-commands/application/application.types.js';
import { ListApplicationCommand } from '@clevercloud/client/cc-api-commands/application/list-application-command.js';
import { DeployApplicationCommand } from '@clevercloud/client/cc-api-commands/application/deploy-application-command.js';
import { GetApplicationCommand } from '@clevercloud/client/cc-api-commands/application/get-application-command.js';
import { UndeployApplicationCommand } from '@clevercloud/client/cc-api-commands/application/undeploy-application-command.js';
import { UpdateApplicationCommand } from '@clevercloud/client/cc-api-commands/application/update-application-command.js';
import type { UpdateApplicationCommandInput } from '@clevercloud/client/cc-api-commands/application/update-application-command.types.js';
import { CancelDeploymentCommand } from '@clevercloud/client/cc-api-commands/deployment/cancel-deployment-command.js';
import type {
  Deployment as DeploymentProgress,
  DeploymentLegacy,
} from '@clevercloud/client/cc-api-commands/deployment/deployment.types.js';
import { ListDeploymentCommand } from '@clevercloud/client/cc-api-commands/deployment/list-deployment-command.js';
import {
  GetDeploymentCommand,
  GetDeploymentCommandLegacy,
} from '@clevercloud/client/cc-api-commands/deployment/get-deployment-command.js';
import type { Link } from '@clevercloud/client/cc-api-commands/link/link.types.js';
import { AddLinkCommand } from '@clevercloud/client/cc-api-commands/link/add-link-command.js';
import { ListLinkCommand } from '@clevercloud/client/cc-api-commands/link/list-link-command.js';
import { CreateAddonCommand } from '@clevercloud/client/cc-api-commands/addon/create-addon-command.js';
import { GetProductAddonCommand } from '@clevercloud/client/cc-api-commands/product/get-product-addon-command.js';
import { RemoveLinkCommand } from '@clevercloud/client/cc-api-commands/link/remove-link-command.js';
import { CreateDomainCommand } from '@clevercloud/client/cc-api-commands/domain/create-domain-command.js';
import { DeleteDomainCommand } from '@clevercloud/client/cc-api-commands/domain/delete-domain-command.js';
import { SetPrimaryDomainCommand } from '@clevercloud/client/cc-api-commands/domain/set-primary-domain-command.js';
import { CreateOrUpdateEnvironmentVariableCommand } from '@clevercloud/client/cc-api-commands/environment/create-or-update-environment-variable-command.js';
import { DeleteEnvironmentVariableCommand } from '@clevercloud/client/cc-api-commands/environment/delete-environment-variable-command.js';
import type { GetEnvironmentCommandOutput } from '@clevercloud/client/cc-api-commands/environment/environment.types.js';
import { GetEnvironmentCommand } from '@clevercloud/client/cc-api-commands/environment/get-environment-command.js';
import { UpdateEnvironmentCommand } from '@clevercloud/client/cc-api-commands/environment/update-environment-command.js';
import type { Instance } from '@clevercloud/client/cc-api-commands/instance/instance.types.js';
import { GetInvoiceCommand } from '@clevercloud/client/cc-api-commands/invoice/get-invoice-command.js';
import { ListInvoiceCommand } from '@clevercloud/client/cc-api-commands/invoice/list-invoice-command.js';
import { ListApplicationInstanceCommand } from '@clevercloud/client/cc-api-commands/instance/list-application-instance-command.js';
import type { LogsStream } from '@clevercloud/client/cc-api-commands/log/abstract-logs-stream-command.js';
import type {
  AddonRuntimeLog,
  ApplicationAccessLog,
  ApplicationRuntimeLog,
} from '@clevercloud/client/cc-api-commands/log/log.types.js';
import { StreamAddonRuntimeLogCommand } from '@clevercloud/client/cc-api-commands/log/stream-addon-runtime-log-command.js';
import { StreamApplicationAccessLogCommand } from '@clevercloud/client/cc-api-commands/log/stream-application-access-log-command.js';
import { StreamApplicationRuntimeLogCommand } from '@clevercloud/client/cc-api-commands/log/stream-application-runtime-log-command.js';
import { GetOrganisationSummaryCommand } from '@clevercloud/client/cc-api-commands/organisation/get-organisation-summary-command.js';
import type { GetOrganisationSummaryCommandOutput } from '@clevercloud/client/cc-api-commands/organisation/get-organisation-summary-command.types.js';
import type {
  AddonSummary,
  ApplicationSummary,
  OrganisationSummary,
} from '@clevercloud/client/cc-api-commands/organisation/organisation.types.js';
import { GetPriceSystemCommand } from '@clevercloud/client/cc-api-commands/price-system/get-price-system-command.js';
import type { GetPriceSystemCommandOutput } from '@clevercloud/client/cc-api-commands/price-system/get-price-system-command.types.js';
import { GetProfileCommand } from '@clevercloud/client/cc-api-commands/profile/get-profile-command.js';
import { CreateTagCommand } from '@clevercloud/client/cc-api-commands/tag/create-tag-command.js';
import { DeleteTagCommand } from '@clevercloud/client/cc-api-commands/tag/delete-tag-command.js';
import type { Profile } from '@clevercloud/client/cc-api-commands/profile/profile.types.js';
import { ERROR_TYPES, parseRaw } from '@clevercloud/client/utils/environment-utils.js';
import {
  HOURS_PER_MONTH,
  type AddonPricing,
  type AppPricing,
  type CostRow,
  type DailyConsumption,
  type InvoiceLines,
} from '../core/home/costs.js';
import { readVersionCheck } from '../core/addons/operator.js';
import { t } from '../core/i18n.js';
import type { EnvironmentVariable, EnvVarParsingError } from '@clevercloud/client/utils/environment.types.js';

export type {
  Addon,
  AddonInstance,
  Backup,
  CellarBucket,
  CellarBucketList,
  CellarBucketSummary,
  CellarDirectory,
  CellarInfo,
  CellarObjectItem,
  CellarObjectList,
  AddonRuntimeLog,
  AddonSummary,
  Application,
  ApplicationAccessLog,
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

export type { DeploymentProgress };

/**
 * Where a deployment stands (v4): its state from the moment it is queued (the v2 API only knows it once
 * started), when it was asked for, the steps it went through, its action and cause.
 */
export function fetchDeploymentProgress(
  client: CcApiClient,
  ownerId: string,
  applicationId: string,
  deploymentId: string,
): Promise<DeploymentProgress> {
  return client.send(new GetDeploymentCommand({ ownerId, applicationId, deploymentId }));
}

/** One deployment of an application, in the shape `fetchDeployments` lists them (number, author, cause). */
export function fetchDeployment(
  client: CcApiClient,
  ownerId: string,
  applicationId: string,
  deploymentId: string,
): Promise<DeploymentLegacy> {
  return client.send(new GetDeploymentCommandLegacy({ ownerId, applicationId, deploymentId }));
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
  /** Only the lines of the instances of this deployment (`clever logs --deployment-id`). */
  deploymentId?: string;
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
      deploymentId: options.deploymentId,
    }),
  );
}

/** An add-on in full: provider, plan, zone, creation date. */
export function fetchAddon(client: CcApiClient, ownerId: string, addonId: string): Promise<Addon> {
  return client.send(new GetAddonCommand({ ownerId, addonId }));
}

/** `clever addon rename`: only the display name changes. */
export function renameAddon(client: CcApiClient, ownerId: string, addonId: string, name: string): Promise<Addon> {
  return client.send(new UpdateAddonCommand({ ownerId, addonId, name }));
}

/** `clever database backups`: the backups of a database add-on, most recent first. */
export function fetchBackups(
  client: CcApiClient,
  ownerId: string,
  addonId: string,
  /** Only for the providers whose backups carry their own restore command (Elasticsearch): no other call is made. */
  withCommands = false,
): Promise<Backup[]> {
  return client.send(new ListBackupCommand({ ownerId, addonId, withCommands }));
}

/** What the provider of a database add-on says about it, without its password. */
export interface DatabaseDetails {
  status: string;
  version: string;
  host: string;
  port: number;
  database: string;
  user: string;
  features: Array<{ name: string; enabled: boolean }>;
  locale: string | null;
  /** Elasticsearch: Kibana and APM when enabled, each with its host and the application running it. */
  companions: Companion[];
}

export interface Companion {
  name: 'kibana' | 'apm';
  host: string;
  appId: string | null;
}

/**
 * `GET /v4/addon-providers/:provider/addons/:addonId`, which the client only uses inside its backup
 * command. The payload also carries the passwords, the read-only users and, for Elasticsearch, the
 * APM token: they are dropped here, so they never reach a component.
 */
export async function fetchDatabaseDetails(
  client: CcApiClient,
  providerId: string,
  addonId: string,
): Promise<DatabaseDetails> {
  const raw = (await rawGet(
    client,
    `/v4/addon-providers/${encodeURIComponent(providerId)}/addons/${encodeURIComponent(addonId)}`,
  )) as Record<string, unknown>;
  const features = Array.isArray(raw.features) ? (raw.features as Array<Record<string, unknown>>) : [];
  const services = Array.isArray(raw.services) ? (raw.services as Array<Record<string, unknown>>) : [];
  const companions = (['kibana', 'apm'] as const)
    .filter((name) => services.some((service) => service.name === name && service.enabled === true))
    .map((name) => ({
      name,
      host: typeof raw[`${name}_host`] === 'string' ? (raw[`${name}_host`] as string) : '',
      appId: typeof raw[`${name}_application`] === 'string' ? (raw[`${name}_application`] as string) : null,
    }));
  return {
    status: String(raw.status ?? ''),
    version: String(raw.version ?? ''),
    host: String(raw.host ?? ''),
    port: Number(raw.port ?? 0),
    database: String(raw.database ?? ''),
    user: String(raw.user ?? ''),
    features: features
      .filter((feature) => typeof feature.name === 'string')
      .map((feature) => ({ name: String(feature.name), enabled: feature.enabled === true })),
    locale: typeof raw.locale === 'string' ? raw.locale : null,
    companions,
  };
}

/** The versions a provider offers for a new dedicated database, and its default. */
export interface OfferedVersions {
  versions: string[];
  defaultVersion: string | null;
}

/** `GET /v4/addon-providers/:provider`: public, the same for every organisation. */
export async function fetchOfferedVersions(client: CcApiClient, providerId: string): Promise<OfferedVersions> {
  const raw = (await rawGet(client, `/v4/addon-providers/${encodeURIComponent(providerId)}`)) as {
    dedicated?: Record<string, unknown>;
    defaultDedicatedVersion?: unknown;
  };
  return {
    versions: Object.keys(raw.dedicated ?? {}),
    defaultVersion: typeof raw.defaultDedicatedVersion === 'string' ? raw.defaultDedicatedVersion : null,
  };
}

/** The instances of an add-on: only dedicated plans have some; a shared plan answers an empty list. */
export function fetchAddonInstances(client: CcApiClient, ownerId: string, addonId: string): Promise<AddonInstance[]> {
  return client.send(new ListAddonInstanceCommand({ ownerId, addonId }));
}

/**
 * `clever config-provider get`: the variables a configuration provider hands to the applications linked
 * to it. Its real id (`config_…`) spares the client a lookup.
 */
export function fetchConfigProviderEnvironment(client: CcApiClient, realId: string): Promise<EnvironmentVariable[]> {
  return client.send(new GetConfigProviderCommand({ addonId: realId }));
}

/**
 * Replaces the whole list: a variable left out is removed. Clever Cloud then redeploys the linked
 * applications by itself (deployments caused by `Environment/<addon id>`).
 */
export function replaceConfigProviderEnvironment(
  client: CcApiClient,
  realId: string,
  environment: EnvironmentVariable[],
): Promise<EnvironmentVariable[]> {
  return client.send(new UpdateConfigProviderCommand({ addonId: realId, environment }));
}

/*
 * Cellar, read through the platform's own API rather than S3: no credentials needed. The real id
 * (`cellar_…`) spares the client a lookup. clever-tools has no Cellar command.
 */

/** Buckets, objects, total size and the traffic of the billing period. */
export function fetchCellarInfo(client: CcApiClient, ownerId: string, realId: string): Promise<CellarInfo> {
  return client.send(new GetCellarInfoCommand({ ownerId, addonId: realId }));
}

export function fetchCellarBuckets(client: CcApiClient, ownerId: string, realId: string): Promise<CellarBucketList> {
  return client.send(new ListCellarBucketCommand({ ownerId, addonId: realId }));
}

/** A new, empty bucket (#29). */
export function createCellarBucket(
  client: CcApiClient,
  ownerId: string,
  realId: string,
  name: string,
  versioning: boolean,
): Promise<CellarBucket> {
  return client.send(new CreateCellarBucketCommand({ ownerId, addonId: realId, name, versioning }));
}

/** Why Cellar refused a new bucket, when it said so with one of its codes. */
export function bucketCreationRefusal(error: unknown): 'invalid' | 'exists' | 'tooMany' | null {
  const codes = CREATE_CELLAR_BUCKET_ERROR_CODES;
  if (isCcHttpErrorWithCode(error, codes.INVALID_BUCKET_NAME)) {
    return 'invalid';
  }
  if (isCcHttpErrorWithCode(error, codes.BUCKET_ALREADY_EXISTS)) {
    return 'exists';
  }
  if (isCcHttpErrorWithCode(error, codes.TOO_MANY_BUCKETS)) {
    return 'tooMany';
  }
  return null;
}

/** One bucket, with its versioning status. */
export function fetchCellarBucket(
  client: CcApiClient,
  ownerId: string,
  realId: string,
  bucketName: string,
): Promise<CellarBucket> {
  return client.send(new GetCellarBucketCommand({ ownerId, addonId: realId, bucketName }));
}

/** One page of a bucket under a prefix: its directories (common prefixes) and objects, and the next cursor. */
export function fetchCellarObjects(
  client: CcApiClient,
  ownerId: string,
  realId: string,
  bucketName: string,
  prefix: string,
  cursor?: string,
  count = 100,
): Promise<CellarObjectList> {
  return client.send(
    new ListCellarObjectCommand({ ownerId, addonId: realId, bucketName, prefix: prefix || undefined, cursor, count }),
  );
}

/** A URL that downloads one object without credentials; signing it stores nothing. */
export async function fetchCellarDownloadUrl(
  client: CcApiClient,
  ownerId: string,
  realId: string,
  bucketName: string,
  objectKey: string,
): Promise<string> {
  const signed = await client.send(
    new GetCellarObjectDownloadUrlCommand({ ownerId, addonId: realId, bucketName, objectKey }),
  );
  return signed.url;
}

/*
 * Operators: add-ons Clever Cloud runs on top of an application and other add-ons (`clever keycloak`,
 * `clever otoroshi`). Their real id (`keycloak_…`, `otoroshi_…`) spares the client a lookup.
 */

export type OperatorKind = 'keycloak' | 'otoroshi';

/** What an operator is and is built on; its initial credentials, environment and API secret are dropped. */
export interface OperatorDetails {
  version: string;
  javaVersion: string;
  accessUrl: string;
  /** The application that serves it. */
  entrypoint: string | null;
  /** Real ids of the add-ons underneath: an FS bucket and a PostgreSQL, a Redis… */
  resources: string[];
  networkGroup: string | null;
  /** Otoroshi's admin API, without its credentials. */
  api: { url: string; swaggerUrl: string } | null;
}

export async function fetchOperatorDetails(
  client: CcApiClient,
  kind: OperatorKind,
  realId: string,
): Promise<OperatorDetails> {
  const info =
    kind === 'keycloak'
      ? await client.send(new GetKeycloakInfoCommand({ addonId: realId }))
      : await client.send(new GetOtoroshiInfoCommand({ addonId: realId }));
  const { entrypoint, ...others } = info.resources as Record<string, string | null | undefined>;
  return {
    version: info.version,
    javaVersion: info.javaVersion,
    accessUrl: info.accessUrl,
    entrypoint: entrypoint ?? null,
    resources: Object.values(others).filter((id): id is string => typeof id === 'string' && id !== ''),
    networkGroup: info.features.networkGroup?.id ?? null,
    api: 'api' in info ? { url: info.api.url, swaggerUrl: info.api.swaggerUrl } : null,
  };
}

/** `clever keycloak|otoroshi version check`. */
export interface OperatorVersions {
  installed: string;
  latest: string;
  available: string[];
  needUpdate: boolean;
  /** Installed as `latest`: the latest release at each build, never behind by name. */
  followsLatest: boolean;
}

export async function fetchOperatorVersions(
  client: CcApiClient,
  kind: OperatorKind,
  realId: string,
): Promise<OperatorVersions> {
  const check =
    kind === 'keycloak'
      ? await client.send(new CheckKeycloakVersionCommand({ addonId: realId }))
      : await client.send(new CheckOtoroshiVersionCommand({ addonId: realId }));
  return readVersionCheck(check.installed, check.latest, check.availableVersions, check.needUpdate);
}

/** `clever keycloak|otoroshi restart`: restarts the instance, the data stays. */
export async function rebootOperator(client: CcApiClient, kind: OperatorKind, realId: string): Promise<void> {
  await (kind === 'keycloak'
    ? client.send(new RebootKeycloakCommand({ addonId: realId }))
    : client.send(new RebootOtoroshiCommand({ addonId: realId })));
}

/** `clever keycloak|otoroshi rebuild`: rebuilds the instance, the data stays. */
export async function rebuildOperator(client: CcApiClient, kind: OperatorKind, realId: string): Promise<void> {
  await (kind === 'keycloak'
    ? client.send(new RebuildKeycloakCommand({ addonId: realId }))
    : client.send(new RebuildOtoroshiCommand({ addonId: realId })));
}

/** `clever keycloak|otoroshi version update --target`: rebuilt on that version. */
export async function updateOperatorVersion(
  client: CcApiClient,
  kind: OperatorKind,
  realId: string,
  targetVersion: string,
): Promise<void> {
  await (kind === 'keycloak'
    ? client.send(new UpdateKeycloakVersionCommand({ addonId: realId, targetVersion }))
    : client.send(new UpdateOtoroshiVersionCommand({ addonId: realId, targetVersion })));
}

/**
 * `clever addon create config-provider <name>`: a configuration provider on its single, free plan,
 * in Paris. The plan id is read from the catalogue rather than written here.
 */
export async function createConfigProvider(
  client: CcApiClient,
  ownerId: string,
  name: string,
): Promise<{ id: string; realId: string }> {
  const product = await client.send(
    new GetProductAddonCommand({ id: 'config-provider', withVersions: false, ownerId }),
  );
  const plan = product.plans.find((candidate) => candidate.slug === 'std') ?? product.plans[0];
  if (plan == null) {
    throw new Error('The configuration provider has no plan.');
  }
  const addon = await client.send(
    new CreateAddonCommand({ ownerId, name, zone: 'par', providerId: 'config-provider', planId: plan.id }),
  );
  return { id: addon.id, realId: addon.realId };
}

/** How many applications an add-on is linked to: a configuration provider redeploys them on each change. */
export async function countLinkedApplications(client: CcApiClient, ownerId: string, addonId: string): Promise<number> {
  const links: Link[] = await client.send(new ListLinkCommand({ ownerId, addonId }));
  return links.length;
}

/** Whether an add-on is still in its owner's list: the sync's add-on can be deleted from elsewhere (#19). */
export async function addonExists(client: CcApiClient, ownerId: string, addonId: string): Promise<boolean> {
  const addons = await client.send(new ListAddonCommand({ ownerId }));
  return addons.some((addon) => addon.id === addonId);
}

/** `clever addon env <addon-id>`: the variables an add-on exposes to the applications linked to it. */
export async function fetchAddonEnvironment(
  client: CcApiClient,
  ownerId: string,
  addonId: string,
): Promise<EnvironmentVariable[]> {
  const output = await client.send(new GetEnvironmentCommand({ ownerId, addonId }));
  return output.environment;
}

/** `clever logs --addon`: what a dedicated add-on writes. */
export function openAddonLogs(
  client: CcApiClient,
  ownerId: string,
  addonId: string,
  options: { since?: Date } = {},
): Promise<LogsStream<AddonRuntimeLog>> {
  return client.stream(new StreamAddonRuntimeLogCommand({ ownerId, addonId, since: options.since }));
}

/** `clever accesslogs`: one entry per HTTP request the application answered. */
export function openAccessLogs(
  client: CcApiClient,
  ownerId: string,
  applicationId: string,
  options: { since?: Date } = {},
): Promise<LogsStream<ApplicationAccessLog>> {
  return client.stream(new StreamApplicationAccessLogCommand({ ownerId, applicationId, since: options.since }));
}

/** Every deployment of every application of the organisation. The backend ignores `limit` here. */
export function fetchOrganisationDeployments(client: CcApiClient, ownerId: string): Promise<DeploymentLegacy[]> {
  return client.send(new ListDeploymentCommand({ ownerId }));
}

export interface ApplicationLinks {
  addonIds: string[];
  applicationIds: string[];
}

export interface Dependencies {
  addons: Addon[];
  applications: Application[];
}

/** `clever service`: the add-ons and applications an application is linked to, in full. Two requests. */
export async function fetchDependencies(
  client: CcApiClient,
  ownerId: string,
  applicationId: string,
): Promise<Dependencies> {
  const links: Link[] = await client.send(new ListLinkCommand({ ownerId, applicationId }));
  const result: Dependencies = { addons: [], applications: [] };
  for (const link of links) {
    if (link.type === 'link-to-addon') {
      result.addons.push(link.addon);
    } else {
      result.applications.push(link.application);
    }
  }
  return result;
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

/** `clever service link-addon` */
export async function linkAddon(
  client: CcApiClient,
  ownerId: string,
  applicationId: string,
  addonId: string,
): Promise<void> {
  await client.send(new AddLinkCommand({ ownerId, applicationId, targetAddonId: addonId }));
}

/** `clever service unlink-addon` */
export async function unlinkAddon(
  client: CcApiClient,
  ownerId: string,
  applicationId: string,
  addonId: string,
): Promise<void> {
  await client.send(new RemoveLinkCommand({ ownerId, applicationId, targetAddonId: addonId }));
}

/** `clever service link-app`: the application gets the exposed configuration of the target. */
export async function linkApplication(
  client: CcApiClient,
  ownerId: string,
  applicationId: string,
  targetApplicationId: string,
): Promise<void> {
  await client.send(new AddLinkCommand({ ownerId, applicationId, targetApplicationId }));
}

/** `clever service unlink-app` */
export async function unlinkApplication(
  client: CcApiClient,
  ownerId: string,
  applicationId: string,
  targetApplicationId: string,
): Promise<void> {
  await client.send(new RemoveLinkCommand({ ownerId, applicationId, targetApplicationId }));
}

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
// --- costs -------------------------------------------------------------------

/** The prices the organisation is billed with: hourly price per `source.flavor` key. */
export interface PriceSystem {
  currency: string;
  hourly: ReadonlyMap<string, number>;
}

/**
 * The API wants a zone even though the runtime price keys (`apps.xs`,
 * `postgresql.s_hug`) do not depend on it; Paris serves as the reference.
 */
const PRICE_SYSTEM_ZONE = 'par';

export async function fetchPriceSystem(client: CcApiClient, ownerId: string): Promise<PriceSystem> {
  const system = await client.send(new GetPriceSystemCommand({ ownerId, zone: PRICE_SYSTEM_ZONE }));
  const hourly = new Map<string, number>();
  for (const runtime of system.runtimes) {
    if (!hourly.has(runtime.priceId)) {
      hourly.set(runtime.priceId, runtime.price);
    }
  }
  return { currency: system.currency, hourly };
}

export interface Pricing {
  apps: AppPricing[];
  addons: AddonPricing[];
}

/**
 * What every application and add-on of the organisation costs as configured.
 * The organisation's price system wins over the public price carried by the
 * scaler size or the plan, so negotiated prices apply.
 */
export async function fetchPricing(client: CcApiClient, ownerId: string, prices: PriceSystem): Promise<Pricing> {
  const [apps, addons] = await Promise.all([
    client.send(new ListApplicationCommand({ ownerId, withBranches: false })),
    client.send(new ListAddonCommand({ ownerId })),
  ]);
  return {
    apps: apps
      .filter((app) => !app.isArchived)
      .map((app) => {
        const flavor = app.instance.minFlavor;
        const priceId = flavor.priceId ?? `apps.${flavor.name.toLowerCase()}`;
        return {
          id: app.id,
          hourlyPrice: prices.hourly.get(priceId) ?? flavor.price,
          minInstances: app.instance.minInstances,
          running: app.state === 'SHOULD_BE_UP',
        };
      }),
    addons: addons.map((addon) => {
      const hourly = addon.plan.priceId == null ? undefined : prices.hourly.get(addon.plan.priceId);
      return {
        id: addon.id,
        realId: addon.realId,
        monthlyPrice:
          hourly != null ? hourly * HOURS_PER_MONTH : typeof addon.plan.price === 'number' ? addon.plan.price : null,
      };
    }),
  };
}

interface RawConsumptionDay {
  date: string;
  consumption: Array<{ app_id: string; app_name: string; price: number }>;
}

/**
 * A GET the client has no command for yet: it borrows the plumbing of a
 * simple command (authentication, the API bridge, retries) and hands back the
 * JSON as it came.
 */
class RawGetCommand extends GetPriceSystemCommand {
  readonly #url: string;

  constructor(url: string) {
    super({});
    this.#url = url;
  }

  override toRequestParams(): ReturnType<GetPriceSystemCommand['toRequestParams']> {
    return { method: 'GET', url: this.#url, headers: new Headers({ Accept: 'application/json' }) };
  }

  override transformCommandOutput(response: unknown): GetPriceSystemCommandOutput {
    return response as GetPriceSystemCommandOutput;
  }
}

async function rawGet(client: CcApiClient, url: string): Promise<unknown> {
  return (await client.send(new RawGetCommand(url))) as unknown;
}

/**
 * The consumption of one day per resource, or null when the billing system has not computed that day yet.
 * `GET /v4/billing/organisations/:id/consumption` is the call behind the Console's consumption page; it
 * ignores `from` and `to`, `date` selects one day (yesterday by default) and `currency` is required.
 */
export async function fetchDailyConsumption(
  client: CcApiClient,
  ownerId: string,
  date: string,
  currency: string,
): Promise<DailyConsumption | null> {
  const query = new URLSearchParams({ currency, date });
  const response = await rawGet(
    client,
    `/v4/billing/organisations/${encodeURIComponent(ownerId)}/consumption?${query}`,
  );
  const days = Array.isArray(response) ? (response as RawConsumptionDay[]) : [];
  const day = days.find((candidate) => candidate.date === date);
  if (day == null || !Array.isArray(day.consumption)) {
    return null;
  }
  return { date, rows: day.consumption.map((row) => ({ id: row.app_id, amount: row.price })) };
}

export interface InvoiceRef {
  number: string;
  emittedAt: string;
}

/** The most recent invoice (credit notes excluded), or null for an organisation never billed. */
export async function fetchLatestInvoice(client: CcApiClient, ownerId: string): Promise<InvoiceRef | null> {
  const invoices = await client.send(new ListInvoiceCommand({ ownerId, limit: 6 }));
  const latest = invoices
    .filter((invoice) => invoice.kind === 'INVOICE')
    .sort((a, b) => b.emittedAt.localeCompare(a.emittedAt))[0];
  return latest == null ? null : { number: latest.invoiceNumber, emittedAt: latest.emittedAt };
}

/** The lines of one invoice reduced to one amount per resource: uptimes, metered resources and vendors. */
export async function fetchInvoiceLines(
  client: CcApiClient,
  ownerId: string,
  invoiceNumber: string,
): Promise<InvoiceLines> {
  const invoice = await client.send(new GetInvoiceCommand({ ownerId, invoiceNumber }));
  const rows: CostRow[] = [
    ...invoice.uptimes.map((line) => ({ id: line.applicationId, amount: line.price.amount })),
    ...invoice.countables.map((line) => ({ id: line.applicationId, amount: line.price.amount })),
    ...invoice.vendorConsumptions.map((line) => ({ id: line.applicationId, amount: line.price.amount })),
  ];
  return {
    number: invoice.invoiceNumber,
    from: invoice.consumptionStartedAt,
    to: invoice.consumptionEndedAt,
    currency: invoice.currency,
    rows,
  };
}

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
