/**
 * The `clever ssh` commands of an application (#36). The page cannot open a
 * session, which needs the reader's machine and key: it builds the command,
 * with the instance selection clever-tools applies.
 */
import type { Application, Instance } from '../../data/api.js';
import { shellQuote } from '../shell.js';

/** The states clever-tools connects to: the VM is running. */
const SSH_STATES: ReadonlySet<Instance['state']> = new Set([
  'BOOTING',
  'STARTING',
  'READY',
  'BUILDING',
  'DEPLOYING',
  'UP',
  'TASK_IN_PROGRESS',
  'MIGRATION_IN_PROGRESS',
  'STOPPING',
]);

/** What adds a key to the account; the name is free, and the path the usual one. */
export const SSH_KEY_ADD = 'clever ssh-keys add my-key ~/.ssh/id_ed25519.pub';

/** The instances `clever ssh` can reach, in its order: build instances last, by number, the newest first. */
export function sshInstances(instances: readonly Instance[]): Instance[] {
  return instances
    .filter((instance) => SSH_STATES.has(instance.state))
    .sort(
      (a, b) =>
        Number(a.isBuildVm) - Number(b.isBuildVm) ||
        (a.index ?? Infinity) - (b.index ?? Infinity) ||
        b.createdAt.localeCompare(a.createdAt),
    );
}

/**
 * What `--instance` takes to reach exactly this one: its number when that is enough, else its id.
 * A number never picks a build instance (also numbered 0), and while a deployment rolls, two
 * instances share one and clever-tools picks the serving one.
 */
export function sshTarget(instance: Instance, running: readonly Instance[]): string {
  const unique =
    !instance.isBuildVm &&
    instance.index != null &&
    running.filter((other) => !other.isBuildVm && other.index === instance.index).length === 1;
  return unique ? String(instance.index) : instance.id;
}

/** The interactive session, on one chosen instance when there is a choice. */
export function sshSession(appId: string, target?: string): string {
  return `clever ssh --app ${appId}${target == null ? '' : ` --instance ${target}`}`;
}

/** clever-tools refuses `--app-home` for Docker: the session already opens in the container's WORKDIR. */
export function isDockerApp(app: Application): boolean {
  return app.instance.variant.slug === 'docker';
}

/** One command, on any instance, from the application folder when there is one. */
export function sshRun(appId: string, command: string, docker: boolean): string {
  return `clever ssh --app ${appId} --instance any${docker ? '' : ' --app-home'} -c ${shellQuote(command)}`;
}
