/**
 * The actions of the "visual CLI": each one mirrors a clever-tools command,
 * declares the fields of its form, renders the equivalent command line from
 * the current values, and runs against the API.
 */
import type { CcApiClient } from '@clevercloud/client/cc-api-client.js';
import * as api from '../data/api.js';
import type { Application } from '../data/api.js';
import type { AppTab } from './router.js';

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
}

export interface ActionResult {
  message: string;
  navigateTo?: AppTab;
  /** Reload the application data (page, tabs, summary) after the action. */
  refresh?: boolean;
}

export interface ActionDefinition {
  id: string;
  title: string;
  description?: string;
  /** Destructive or disruptive: the submit button turns red and asks for confirmation wording. */
  danger?: boolean;
  submitLabel?: string;
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
    title: 'Redémarrer',
    description: 'Relance un déploiement avec le dernier commit, ou un commit précis.',
    submitLabel: 'Redémarrer',
    keywords: ['restart', 'redeploy', 'redéployer'],
    fields: (ctx) => [
      {
        name: 'commit',
        label: 'Commit',
        type: 'text',
        placeholder: ctx.app?.commitId ? `dernier déployé : ${ctx.app.commitId.slice(0, 8)}` : 'dernier commit déployé',
        mono: true,
        pattern: /^[0-9a-f]{7,40}$/i,
        patternHelp: 'un identifiant de commit git (7 à 40 caractères hexadécimaux)',
      },
      { name: 'withoutCache', label: 'Sans cache de build', type: 'checkbox', default: false },
    ],
    cli: (ctx, v) =>
      `clever restart ${appFlag(ctx)}${str(v.commit) ? ` --commit ${str(v.commit)}` : ''}${v.withoutCache ? ' --without-cache' : ''}`,
    run: async (ctx, v) => {
      const { deploymentId } = await api.redeployApplication(ctx.client, ctx.ownerId, ctx.appId, {
        commit: str(v.commit) || undefined,
        useCache: !v.withoutCache,
      });
      return { message: `Redémarrage lancé (${deploymentId.slice(0, 19)}…).`, navigateTo: 'logs', refresh: true };
    },
  },
  {
    id: 'stop',
    cliHint: 'clever stop',
    title: 'Arrêter',
    description: "Arrête toutes les instances de l'application.",
    danger: true,
    submitLabel: "Arrêter l'application",
    keywords: ['stop', 'undeploy'],
    fields: () => [],
    cli: (ctx) => `clever stop ${appFlag(ctx)}`,
    run: async (ctx) => {
      await api.undeployApplication(ctx.client, ctx.ownerId, ctx.appId);
      return { message: 'Arrêt demandé.', navigateTo: 'deployments', refresh: true };
    },
  },
  {
    id: 'cancel-deploy',
    cliHint: 'clever cancel-deploy',
    title: 'Annuler le déploiement en cours',
    danger: true,
    submitLabel: 'Annuler le déploiement',
    keywords: ['cancel'],
    fields: () => [
      {
        name: 'deploymentId',
        label: 'Déploiement',
        type: 'text',
        placeholder: 'vide : le déploiement en cours',
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
          throw new Error('Aucun déploiement en cours.');
        }
        deploymentId = running.id;
      }
      await api.cancelDeployment(ctx.client, ctx.ownerId, ctx.appId, deploymentId);
      return { message: 'Déploiement annulé.', navigateTo: 'deployments', refresh: true };
    },
  },
  {
    id: 'scale',
    cliHint: 'clever scale',
    title: 'Scaler',
    description: "Bornes horizontales (instances) et verticales (taille) de l'application.",
    submitLabel: 'Appliquer',
    keywords: ['scale', 'instances', 'flavor', 'taille'],
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
          label: 'Instances minimum',
          type: 'number',
          required: true,
          min: 1,
          max: instance?.maxAllowedInstances ?? 40,
          default: instance?.minInstances ?? 1,
        },
        {
          name: 'maxInstances',
          label: 'Instances maximum',
          type: 'number',
          required: true,
          min: 1,
          max: instance?.maxAllowedInstances ?? 40,
          default: instance?.maxInstances ?? 1,
        },
        {
          name: 'minFlavor',
          label: 'Taille minimum',
          type: 'select',
          required: true,
          options: flavors,
          default: instance?.minFlavor.name,
        },
        {
          name: 'maxFlavor',
          label: 'Taille maximum',
          type: 'select',
          required: true,
          options: flavors,
          default: instance?.maxFlavor.name,
        },
      ];
    },
    cli: (ctx, v) =>
      `clever scale ${appFlag(ctx)} --min-instances ${num(v.minInstances)} --max-instances ${num(v.maxInstances)} --min-flavor ${str(v.minFlavor)} --max-flavor ${str(v.maxFlavor)}`,
    run: async (ctx, v) => {
      const minInstances = num(v.minInstances);
      const maxInstances = num(v.maxInstances);
      if (minInstances > maxInstances) {
        throw new Error('Le minimum d’instances dépasse le maximum.');
      }
      const flavors = ctx.app?.instance.flavors ?? [];
      const rank = (name: string) => flavors.findIndex((flavor) => flavor.name === name);
      if (rank(str(v.minFlavor)) > rank(str(v.maxFlavor))) {
        throw new Error('La taille minimum dépasse la taille maximum.');
      }
      await api.updateApplication(ctx.client, ctx.ownerId, ctx.appId, {
        minInstances,
        maxInstances,
        minFlavor: str(v.minFlavor),
        maxFlavor: str(v.maxFlavor),
      });
      return { message: 'Scaling mis à jour.', refresh: true };
    },
  },
  {
    id: 'env-set',
    cliHint: 'clever env set',
    title: 'Définir une variable',
    description: "Crée ou remplace une variable d'environnement. Prise en compte au prochain déploiement.",
    submitLabel: 'Enregistrer',
    keywords: ['env', 'set', 'variable', 'environnement'],
    fields: () => [
      {
        name: 'name',
        label: 'Nom',
        type: 'text',
        required: true,
        mono: true,
        pattern: ENV_NAME_PATTERN,
        patternHelp: 'lettres, chiffres et _ uniquement, sans commencer par un chiffre',
      },
      { name: 'value', label: 'Valeur', type: 'textarea', mono: true, rows: 3 },
    ],
    cli: (ctx, v) => `clever env set ${str(v.name)} ${shellQuote(str(v.value))} ${appFlag(ctx)}`,
    run: async (ctx, v) => {
      await api.setEnvironmentVariable(ctx.client, ctx.ownerId, ctx.appId, str(v.name), str(v.value));
      return { message: `Variable ${str(v.name)} enregistrée.`, navigateTo: 'env', refresh: true };
    },
  },
  {
    id: 'env-rm',
    cliHint: 'clever env rm',
    title: 'Supprimer une variable',
    danger: true,
    submitLabel: 'Supprimer',
    keywords: ['env', 'rm', 'remove', 'variable'],
    fields: (ctx, prefill) => {
      const names = (ctx.app?.environment ?? []).map((variable) => variable.name);
      const options = names.map((name) => ({ value: name, label: name }));
      const prefilled = str(prefill.name);
      if (prefilled !== '' && !names.includes(prefilled)) {
        options.unshift({ value: prefilled, label: prefilled });
      }
      return options.length > 0
        ? [{ name: 'name', label: 'Variable', type: 'select', required: true, options, mono: true }]
        : [{ name: 'name', label: 'Variable', type: 'text', required: true, mono: true, pattern: ENV_NAME_PATTERN }];
    },
    cli: (ctx, v) => `clever env rm ${str(v.name)} ${appFlag(ctx)}`,
    run: async (ctx, v) => {
      await api.deleteEnvironmentVariable(ctx.client, ctx.ownerId, ctx.appId, str(v.name));
      return { message: `Variable ${str(v.name)} supprimée.`, navigateTo: 'env', refresh: true };
    },
  },
  {
    id: 'env-import',
    cliHint: 'clever env import',
    title: 'Importer des variables',
    description:
      'Un fichier .env (NOM=valeur par ligne). Les variables existantes sont conservées, sauf si vous remplacez tout.',
    submitLabel: 'Importer',
    keywords: ['env', 'import', 'dotenv'],
    fields: () => [
      {
        name: 'raw',
        label: 'Contenu .env',
        type: 'textarea',
        required: true,
        mono: true,
        rows: 10,
        placeholder: 'DATABASE_URL=postgres://…\nFEATURE_FLAG=true',
      },
      { name: 'replace', label: 'Remplacer toutes les variables existantes', type: 'checkbox', default: false },
    ],
    cli: (ctx) => `clever env import ${appFlag(ctx)} < .env`,
    run: async (ctx, v) => {
      const { variables, errors } = api.parseEnvFile(str(v.raw));
      if (errors.length > 0) {
        throw new Error(errors.join('\n'));
      }
      if (variables.length === 0) {
        throw new Error('Aucune variable à importer.');
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
      return { message: `${variables.length} variable(s) importée(s).`, navigateTo: 'env', refresh: true };
    },
  },
  {
    id: 'domain-add',
    cliHint: 'clever domain add',
    title: 'Ajouter un domaine',
    submitLabel: 'Ajouter',
    keywords: ['domain', 'domaine', 'dns'],
    fields: () => [
      {
        name: 'domain',
        label: 'Domaine',
        type: 'text',
        required: true,
        mono: true,
        placeholder: 'app.example.com ou app.example.com/chemin',
        pattern: /^[a-z0-9.-]+(\/[^\s]*)?$/i,
        patternHelp: 'un nom de domaine, éventuellement suivi d’un chemin',
      },
    ],
    cli: (ctx, v) => `clever domain add ${str(v.domain)} ${appFlag(ctx)}`,
    run: async (ctx, v) => {
      await api.addDomain(ctx.client, ctx.ownerId, ctx.appId, str(v.domain).toLowerCase());
      return { message: `Domaine ${str(v.domain)} ajouté.`, navigateTo: 'overview', refresh: true };
    },
  },
  {
    id: 'domain-rm',
    cliHint: 'clever domain rm',
    title: 'Supprimer un domaine',
    danger: true,
    submitLabel: 'Supprimer',
    keywords: ['domain', 'domaine', 'rm'],
    fields: (ctx) => [
      {
        name: 'domain',
        label: 'Domaine',
        type: 'select',
        required: true,
        mono: true,
        options: (ctx.app?.domains ?? []).map((domain) => ({ value: domain.domain, label: domain.domain })),
      },
    ],
    cli: (ctx, v) => `clever domain rm ${str(v.domain)} ${appFlag(ctx)}`,
    run: async (ctx, v) => {
      await api.removeDomain(ctx.client, ctx.ownerId, ctx.appId, str(v.domain));
      return { message: `Domaine ${str(v.domain)} supprimé.`, navigateTo: 'overview', refresh: true };
    },
  },
  {
    id: 'domain-primary',
    cliHint: 'clever domain favourite set',
    title: 'Définir le domaine principal',
    submitLabel: 'Définir',
    keywords: ['domain', 'domaine', 'favourite', 'principal'],
    fields: (ctx) => [
      {
        name: 'domain',
        label: 'Domaine',
        type: 'select',
        required: true,
        mono: true,
        options: (ctx.app?.domains ?? []).map((domain) => ({ value: domain.domain, label: domain.domain })),
      },
    ],
    cli: (ctx, v) => `clever domain favourite set ${str(v.domain)} ${appFlag(ctx)}`,
    run: async (ctx, v) => {
      await api.setPrimaryDomain(ctx.client, ctx.ownerId, ctx.appId, str(v.domain));
      return { message: `${str(v.domain)} est le domaine principal.`, navigateTo: 'overview', refresh: true };
    },
  },
];

export function findAction(id: string): ActionDefinition | null {
  return ACTIONS.find((action) => action.id === id) ?? null;
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

export function shellQuote(value: string): string {
  if (value === '') {
    return "''";
  }
  if (/^[A-Za-z0-9_./:@=+,-]+$/.test(value)) {
    return value;
  }
  return `'${value.replace(/'/g, `'\\''`)}'`;
}
