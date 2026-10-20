/**
 * The actions of the "visual CLI": each one mirrors a clever-tools command,
 * declares the fields of its form, renders the equivalent command line from
 * the current values, and runs against the API.
 */
import type { CcApiClient } from '@clevercloud/client/cc-api-client.js';
import * as api from '../data/api.js';
import type { Application, OrganisationSummary } from '../data/api.js';
import { t, type MessageKey } from './i18n.js';
import type { AppTab } from './router.js';
import { shellQuote } from './shell.js';

export type FieldType = 'text' | 'number' | 'select' | 'textarea' | 'checkbox';

export interface FieldOption {
  value: string;
  label: string;
}

export interface ActionField {
  name: string;
  label: string;
  type: FieldType;
  required?: boolean;
  placeholder?: string;
  help?: string;
  options?: FieldOption[];
  default?: ActionValue;
  min?: number;
  max?: number;
  rows?: number;
  mono?: boolean;
  pattern?: RegExp;
  patternHelp?: string;
}

export type ActionValue = string | number | boolean;
export type ActionValues = Record<string, ActionValue>;

export interface ActionContext {
  client: CcApiClient;
  ownerId: string;
  appId: string;
  /** The full application when the page has loaded it; prefills and option lists come from it. */
  app: Application | null;
  /** Its organisation, for the add-ons and applications one can link it to. */
  orga?: OrganisationSummary | null;
}

export interface ActionResult {
  message: string;
  navigateTo?: AppTab;
  /** Reload the application data (page, tabs, summary) after the action. */
  refresh?: boolean;
}

export interface ActionDefinition {
  id: string;
  /** Message key of the title. */
  title: MessageKey;
  /** Message key of the description. */
  description?: MessageKey;
  /** Destructive or disruptive: the submit button turns red and asks for confirmation wording. */
  danger?: boolean;
  /** Message key of the submit button. */
  submitLabel?: MessageKey;
  /** The bare command, shown in the palette. */
  cliHint: string;
  keywords?: string[];
  fields: (ctx: ActionContext, prefill: ActionValues) => ActionField[];
  cli: (ctx: ActionContext, values: ActionValues) => string;
  run: (ctx: ActionContext, values: ActionValues) => Promise<ActionResult>;
}

const ENV_NAME_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;

export const ACTIONS: ActionDefinition[] = [
  {
    id: 'restart',
    cliHint: 'clever restart',
    title: 'action.restart.title',
    description: 'action.restart.description',
    submitLabel: 'action.restart.title',
    keywords: ['restart', 'redeploy', 'redéployer', 'redémarrer'],
    fields: (ctx) => [
      {
        name: 'commit',
        label: t('action.restart.commit'),
        type: 'text',
        placeholder: ctx.app?.commitId
          ? t('action.restart.lastDeployed', { commit: ctx.app.commitId.slice(0, 8) })
          : t('action.restart.lastCommit'),
        mono: true,
        pattern: /^[0-9a-f]{7,40}$/i,
        patternHelp: t('action.restart.commitHelp'),
      },
      { name: 'withoutCache', label: t('action.restart.withoutCache'), type: 'checkbox', default: false },
    ],
    cli: (ctx, v) =>
      `clever restart ${appFlag(ctx)}${str(v.commit) ? ` --commit ${str(v.commit)}` : ''}${v.withoutCache ? ' --without-cache' : ''}`,
    run: async (ctx, v) => {
      const { deploymentId } = await api.redeployApplication(ctx.client, ctx.ownerId, ctx.appId, {
        commit: str(v.commit) || undefined,
        useCache: !v.withoutCache,
      });
      return {
        message: t('action.restart.done', { id: deploymentId.slice(0, 19) }),
        navigateTo: 'logs',
        refresh: true,
      };
    },
  },
  {
    id: 'stop',
    cliHint: 'clever stop',
    title: 'action.stop.title',
    description: 'action.stop.description',
    danger: true,
    submitLabel: 'action.stop.submit',
    keywords: ['stop', 'undeploy', 'arrêter'],
    fields: () => [],
    cli: (ctx) => `clever stop ${appFlag(ctx)}`,
    run: async (ctx) => {
      await api.undeployApplication(ctx.client, ctx.ownerId, ctx.appId);
      return { message: t('action.stop.done'), navigateTo: 'deployments', refresh: true };
    },
  },
  {
    id: 'cancel-deploy',
    cliHint: 'clever cancel-deploy',
    title: 'action.cancel.title',
    danger: true,
    submitLabel: 'action.cancel.submit',
    keywords: ['cancel', 'annuler'],
    fields: () => [
      {
        name: 'deploymentId',
        label: t('action.cancel.deployment'),
        type: 'text',
        placeholder: t('action.cancel.placeholder'),
        mono: true,
      },
    ],
    cli: (ctx) => `clever cancel-deploy ${appFlag(ctx)}`,
    run: async (ctx, v) => {
      let deploymentId = str(v.deploymentId);
      if (deploymentId === '') {
        const deployments = await api.fetchDeployments(ctx.client, ctx.ownerId, ctx.appId, 10);
        const running = deployments.find((d) => d.state === 'WORK_IN_PROGRESS' || d.state === 'TASK_IN_PROGRESS');
        if (running == null) {
          throw new Error(t('action.cancel.none'));
        }
        deploymentId = running.id;
      }
      await api.cancelDeployment(ctx.client, ctx.ownerId, ctx.appId, deploymentId);
      return { message: t('action.cancel.done'), navigateTo: 'deployments', refresh: true };
    },
  },
  {
    id: 'scale',
    cliHint: 'clever scale',
    title: 'action.scale.title',
    description: 'action.scale.description',
    submitLabel: 'common.apply',
    keywords: ['scale', 'instances', 'flavor', 'taille', 'size'],
    fields: (ctx) => {
      const instance = ctx.app?.instance;
      const flavors = (instance?.flavors ?? [])
        .filter((flavor) => flavor.isAvailable)
        .map((flavor) => ({
          value: flavor.name,
          label: `${flavor.name} · ${flavor.cpus} CPU, ${flavor.memory.formatted}`,
        }));
      return [
        {
          name: 'minInstances',
          label: t('action.scale.minInstances'),
          type: 'number',
          required: true,
          min: 1,
          max: instance?.maxAllowedInstances ?? 40,
          default: instance?.minInstances ?? 1,
        },
        {
          name: 'maxInstances',
          label: t('action.scale.maxInstances'),
          type: 'number',
          required: true,
          min: 1,
          max: instance?.maxAllowedInstances ?? 40,
          default: instance?.maxInstances ?? 1,
        },
        {
          name: 'minFlavor',
          label: t('action.scale.minFlavor'),
          type: 'select',
          required: true,
          options: flavors,
          default: instance?.minFlavor.name,
        },
        {
          name: 'maxFlavor',
          label: t('action.scale.maxFlavor'),
          type: 'select',
          required: true,
          options: flavors,
          default: instance?.maxFlavor.name,
        },
        {
          name: 'buildFlavor',
          label: t('action.scale.buildFlavor'),
          type: 'select',
          required: true,
          options: [{ value: BUILD_DISABLED, label: t('action.scale.buildDisabled') }, ...flavors],
          default: currentBuildFlavor(ctx),
          help: t('action.scale.buildHelp'),
        },
      ];
    },
    cli: (ctx, v) =>
      `clever scale ${appFlag(ctx)} --min-instances ${num(v.minInstances)} --max-instances ${num(v.maxInstances)} --min-flavor ${str(v.minFlavor)} --max-flavor ${str(v.maxFlavor)}${
        str(v.buildFlavor) !== '' && str(v.buildFlavor) !== currentBuildFlavor(ctx)
          ? ` --build-flavor ${str(v.buildFlavor)}`
          : ''
      }`,
    run: async (ctx, v) => {
      const minInstances = num(v.minInstances);
      const maxInstances = num(v.maxInstances);
      if (minInstances > maxInstances) {
        throw new Error(t('action.scale.instancesOrder'));
      }
      const flavors = ctx.app?.instance.flavors ?? [];
      const rank = (name: string) => flavors.findIndex((flavor) => flavor.name === name);
      if (rank(str(v.minFlavor)) > rank(str(v.maxFlavor))) {
        throw new Error(t('action.scale.flavorOrder'));
      }
      const buildFlavor = str(v.buildFlavor);
      const buildPatch =
        buildFlavor === '' || buildFlavor === currentBuildFlavor(ctx)
          ? {}
          : buildFlavor === BUILD_DISABLED
            ? { hasSeparatedBuild: false }
            : { hasSeparatedBuild: true, buildFlavor };
      await api.updateApplication(ctx.client, ctx.ownerId, ctx.appId, {
        minInstances,
        maxInstances,
        minFlavor: str(v.minFlavor),
        maxFlavor: str(v.maxFlavor),
        ...buildPatch,
      });
      return { message: t('action.scale.done'), refresh: true };
    },
  },
  {
    id: 'config-update',
    cliHint: 'clever config update',
    title: 'action.config.title',
    description: 'action.config.description',
    submitLabel: 'common.apply',
    keywords: ['config', 'options', 'sticky', 'https', 'zero downtime', 'cancel on push', 'sessions'],
    fields: (ctx) =>
      CONFIG_OPTIONS.map((option): ActionField => ({
        name: option.field,
        label: t(option.label),
        type: 'checkbox',
        default: ctx.app?.[option.field] ?? false,
      })),
    cli: (ctx, v) => {
      const flags = changedOptions(ctx, v).map(
        ({ option, enabled }) => ` --${enabled ? 'enable' : 'disable'}-${option.cli}`,
      );
      return `clever config update ${appFlag(ctx)}${flags.join('')}`;
    },
    run: async (ctx, v) => {
      const changes = changedOptions(ctx, v);
      if (changes.length === 0) {
        throw new Error(t('action.config.nothing'));
      }
      await api.updateApplication(
        ctx.client,
        ctx.ownerId,
        ctx.appId,
        Object.fromEntries(changes.map(({ option, enabled }) => [option.field, enabled])),
      );
      return { message: t('action.config.done', { count: changes.length }), refresh: true };
    },
  },
  {
    id: 'link-addon',
    cliHint: 'clever service link-addon',
    title: 'action.linkAddon.title',
    description: 'action.link.description',
    submitLabel: 'action.link.submit',
    keywords: ['link', 'lier', 'addon', 'add-on', 'service', 'dependency', 'dépendance'],
    fields: (ctx, prefill) => {
      const linked = new Set(str(prefill.exclude).split(',').filter(Boolean));
      const addons = (ctx.orga?.addons ?? [])
        .filter((addon) => !linked.has(addon.id))
        .sort((a, b) => a.name.localeCompare(b.name, 'fr'));
      return [
        {
          name: 'addonId',
          label: t('action.linkAddon.addon'),
          type: 'select',
          required: true,
          options: addons.map((addon) => ({ value: addon.id, label: `${addon.name} · ${addon.providerId}` })),
        },
      ];
    },
    cli: (ctx, v) => `clever service link-addon ${str(v.addonId)} ${appFlag(ctx)}`,
    run: async (ctx, v) => {
      await api.linkAddon(ctx.client, ctx.ownerId, ctx.appId, str(v.addonId));
      return { message: t('action.link.done'), navigateTo: 'dependencies', refresh: true };
    },
  },
  {
    id: 'unlink-addon',
    cliHint: 'clever service unlink-addon',
    title: 'action.unlinkAddon.title',
    description: 'action.unlink.description',
    submitLabel: 'action.unlink.submit',
    danger: true,
    keywords: ['unlink', 'délier', 'addon', 'add-on', 'service'],
    fields: (ctx, prefill) => [
      {
        name: 'addonId',
        label: t('action.linkAddon.addon'),
        type: 'select',
        required: true,
        options: (ctx.orga?.addons ?? [])
          .filter((addon) => addon.id === str(prefill.addonId))
          .map((addon) => ({ value: addon.id, label: `${addon.name} · ${addon.providerId}` })),
      },
    ],
    cli: (ctx, v) => `clever service unlink-addon ${str(v.addonId)} ${appFlag(ctx)}`,
    run: async (ctx, v) => {
      await api.unlinkAddon(ctx.client, ctx.ownerId, ctx.appId, str(v.addonId));
      return { message: t('action.unlink.done'), navigateTo: 'dependencies', refresh: true };
    },
  },
  {
    id: 'link-app',
    cliHint: 'clever service link-app',
    title: 'action.linkApp.title',
    description: 'action.link.description',
    submitLabel: 'action.link.submit',
    keywords: ['link', 'lier', 'application', 'service', 'dependency', 'dépendance'],
    fields: (ctx, prefill) => {
      const linked = new Set(str(prefill.exclude).split(',').filter(Boolean));
      const apps = (ctx.orga?.applications ?? [])
        .filter((app) => !app.isArchived && app.id !== ctx.appId && !linked.has(app.id))
        .sort((a, b) => a.name.localeCompare(b.name, 'fr'));
      return [
        {
          name: 'targetAppId',
          label: t('action.linkApp.app'),
          type: 'select',
          required: true,
          options: apps.map((app) => ({ value: app.id, label: app.name })),
        },
      ];
    },
    cli: (ctx, v) => `clever service link-app ${str(v.targetAppId)} ${appFlag(ctx)}`,
    run: async (ctx, v) => {
      await api.linkApplication(ctx.client, ctx.ownerId, ctx.appId, str(v.targetAppId));
      return { message: t('action.link.done'), navigateTo: 'dependencies', refresh: true };
    },
  },
  {
    id: 'unlink-app',
    cliHint: 'clever service unlink-app',
    title: 'action.unlinkApp.title',
    description: 'action.unlink.description',
    submitLabel: 'action.unlink.submit',
    danger: true,
    keywords: ['unlink', 'délier', 'application', 'service'],
    fields: (ctx, prefill) => [
      {
        name: 'targetAppId',
        label: t('action.linkApp.app'),
        type: 'select',
        required: true,
        options: (ctx.orga?.applications ?? [])
          .filter((app) => app.id === str(prefill.targetAppId))
          .map((app) => ({ value: app.id, label: app.name })),
      },
    ],
    cli: (ctx, v) => `clever service unlink-app ${str(v.targetAppId)} ${appFlag(ctx)}`,
    run: async (ctx, v) => {
      await api.unlinkApplication(ctx.client, ctx.ownerId, ctx.appId, str(v.targetAppId));
      return { message: t('action.unlink.done'), navigateTo: 'dependencies', refresh: true };
    },
  },
  {
    id: 'env-set',
    cliHint: 'clever env set',
    title: 'action.envSet.title',
    description: 'action.envSet.description',
    submitLabel: 'common.save',
    keywords: ['env', 'set', 'variable', 'environnement', 'environment'],
    fields: () => [
      {
        name: 'name',
        label: t('action.envSet.name'),
        type: 'text',
        required: true,
        mono: true,
        pattern: ENV_NAME_PATTERN,
        patternHelp: t('action.envSet.nameHelp'),
      },
      { name: 'value', label: t('action.envSet.value'), type: 'textarea', mono: true, rows: 3 },
    ],
    cli: (ctx, v) => `clever env set ${str(v.name)} ${shellQuote(str(v.value))} ${appFlag(ctx)}`,
    run: async (ctx, v) => {
      await api.setEnvironmentVariable(ctx.client, ctx.ownerId, ctx.appId, str(v.name), str(v.value));
      return { message: t('action.envSet.done', { name: str(v.name) }), navigateTo: 'env', refresh: true };
    },
  },
  {
    id: 'env-rm',
    cliHint: 'clever env rm',
    title: 'action.envRm.title',
    danger: true,
    submitLabel: 'common.remove',
    keywords: ['env', 'rm', 'remove', 'variable', 'supprimer', 'delete'],
    fields: (ctx, prefill) => {
      const names = (ctx.app?.environment ?? []).map((variable) => variable.name);
      const options = names.map((name) => ({ value: name, label: name }));
      const prefilled = str(prefill.name);
      if (prefilled !== '' && !names.includes(prefilled)) {
        options.unshift({ value: prefilled, label: prefilled });
      }
      return options.length > 0
        ? [{ name: 'name', label: t('action.envRm.variable'), type: 'select', required: true, options, mono: true }]
        : [
            {
              name: 'name',
              label: t('action.envRm.variable'),
              type: 'text',
              required: true,
              mono: true,
              pattern: ENV_NAME_PATTERN,
            },
          ];
    },
    cli: (ctx, v) => `clever env rm ${str(v.name)} ${appFlag(ctx)}`,
    run: async (ctx, v) => {
      await api.deleteEnvironmentVariable(ctx.client, ctx.ownerId, ctx.appId, str(v.name));
      return { message: t('action.envRm.done', { name: str(v.name) }), navigateTo: 'env', refresh: true };
    },
  },
  {
    id: 'env-import',
    cliHint: 'clever env import',
    title: 'action.envImport.title',
    description: 'action.envImport.description',
    submitLabel: 'env.import',
    keywords: ['env', 'import', 'dotenv', 'importer'],
    fields: () => [
      {
        name: 'raw',
        label: t('action.envImport.content'),
        type: 'textarea',
        required: true,
        mono: true,
        rows: 10,
        placeholder: 'DATABASE_URL=postgres://…\nFEATURE_FLAG=true',
      },
      { name: 'replace', label: t('action.envImport.replace'), type: 'checkbox', default: false },
    ],
    cli: (ctx) => `clever env import ${appFlag(ctx)} < .env`,
    run: async (ctx, v) => {
      const { variables, errors } = api.parseEnvFile(str(v.raw));
      if (errors.length > 0) {
        throw new Error(errors.join('\n'));
      }
      if (variables.length === 0) {
        throw new Error(t('action.envImport.none'));
      }
      let environment = variables;
      if (!v.replace) {
        const current = await api.fetchEnvironment(ctx.client, ctx.ownerId, ctx.appId);
        const merged = new Map(current.environment.map((variable) => [variable.name, variable.value]));
        for (const variable of variables) {
          merged.set(variable.name, variable.value);
        }
        environment = [...merged.entries()].map(([name, value]) => ({ name, value }));
      }
      await api.replaceEnvironment(ctx.client, ctx.ownerId, ctx.appId, environment);
      return { message: t('action.envImport.done', { count: variables.length }), navigateTo: 'env', refresh: true };
    },
  },
  {
    id: 'domain-add',
    cliHint: 'clever domain add',
    title: 'action.domainAdd.title',
    submitLabel: 'common.add',
    keywords: ['domain', 'domaine', 'dns', 'ajouter'],
    fields: () => [
      {
        name: 'domain',
        label: t('action.domain.domain'),
        type: 'text',
        required: true,
        mono: true,
        placeholder: t('action.domainAdd.placeholder'),
        pattern: /^[a-z0-9.-]+(\/[^\s]*)?$/i,
        patternHelp: t('action.domainAdd.help'),
      },
    ],
    cli: (ctx, v) => `clever domain add ${str(v.domain)} ${appFlag(ctx)}`,
    run: async (ctx, v) => {
      await api.addDomain(ctx.client, ctx.ownerId, ctx.appId, str(v.domain).toLowerCase());
      return { message: t('action.domainAdd.done', { domain: str(v.domain) }), refresh: true };
    },
  },
  {
    id: 'domain-rm',
    cliHint: 'clever domain rm',
    title: 'action.domainRm.title',
    danger: true,
    submitLabel: 'common.remove',
    keywords: ['domain', 'domaine', 'rm', 'supprimer', 'remove'],
    fields: (ctx) => [
      {
        name: 'domain',
        label: t('action.domain.domain'),
        type: 'select',
        required: true,
        mono: true,
        options: (ctx.app?.domains ?? []).map((domain) => ({ value: domain.domain, label: domain.domain })),
      },
    ],
    cli: (ctx, v) => `clever domain rm ${str(v.domain)} ${appFlag(ctx)}`,
    run: async (ctx, v) => {
      await api.removeDomain(ctx.client, ctx.ownerId, ctx.appId, str(v.domain));
      return { message: t('action.domainRm.done', { domain: str(v.domain) }), refresh: true };
    },
  },
  {
    id: 'domain-primary',
    cliHint: 'clever domain favourite set',
    title: 'action.domainPrimary.title',
    submitLabel: 'action.domainPrimary.submit',
    keywords: ['domain', 'domaine', 'favourite', 'principal', 'primary'],
    fields: (ctx) => [
      {
        name: 'domain',
        label: t('action.domain.domain'),
        type: 'select',
        required: true,
        mono: true,
        options: (ctx.app?.domains ?? []).map((domain) => ({ value: domain.domain, label: domain.domain })),
      },
    ],
    cli: (ctx, v) => `clever domain favourite set ${str(v.domain)} ${appFlag(ctx)}`,
    run: async (ctx, v) => {
      await api.setPrimaryDomain(ctx.client, ctx.ownerId, ctx.appId, str(v.domain));
      return {
        message: t('action.domainPrimary.done', { domain: str(v.domain) }),
        refresh: true,
      };
    },
  },
];

export function findAction(id: string): ActionDefinition | null {
  return ACTIONS.find((action) => action.id === id) ?? null;
}

/** The value of the scale form's build field for the application as it is. */
const BUILD_DISABLED = 'disabled';

function currentBuildFlavor(ctx: ActionContext): string {
  const app = ctx.app;
  if (app == null) {
    return '';
  }
  return app.hasSeparatedBuild && app.buildFlavor != null ? app.buildFlavor.name : BUILD_DISABLED;
}

/** The switches of `clever config update` the overview shows, with the application field each one sets. */
export const CONFIG_OPTIONS = [
  { cli: 'sticky-sessions', field: 'hasStickySessions', label: 'overview.stickySessions' },
  { cli: 'zero-downtime', field: 'isZeroDowntimeDeploymentEnabled', label: 'overview.zeroDowntime' },
  { cli: 'force-https', field: 'shouldForceHttps', label: 'overview.forceHttps' },
  { cli: 'cancel-on-push', field: 'cancelOnPush', label: 'overview.cancelOnPush' },
] as const satisfies ReadonlyArray<{ cli: string; field: keyof Application; label: MessageKey }>;

type ConfigOption = (typeof CONFIG_OPTIONS)[number];

function changedOptions(ctx: ActionContext, values: ActionValues): Array<{ option: ConfigOption; enabled: boolean }> {
  return CONFIG_OPTIONS.filter((option) => values[option.field] !== undefined)
    .map((option) => ({ option, enabled: values[option.field] === true }))
    .filter(({ option, enabled }) => ctx.app == null || ctx.app[option.field] !== enabled);
}

function appFlag(ctx: ActionContext): string {
  return `--app ${ctx.appId}`;
}

function str(value: ActionValue | undefined): string {
  return value == null ? '' : String(value).trim();
}

function num(value: ActionValue | undefined): number {
  const parsed = typeof value === 'number' ? value : Number.parseInt(String(value ?? ''), 10);
  return Number.isNaN(parsed) ? 0 : parsed;
}

export { shellQuote };
