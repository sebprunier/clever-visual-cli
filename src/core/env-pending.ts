/**
 * Changing an application's own variables redeploys nothing: they apply at its
 * next deployment. The time of the last change made here is kept for the tab
 * (`cvc.env-changed` in sessionStorage, so it survives a reload), and the
 * Variables tab says so until a deployment newer than the change shows up.
 */
const KEY = 'cvc.env-changed';

function readAll(): Record<string, number> {
  try {
    const parsed = JSON.parse(sessionStorage.getItem(KEY) ?? '{}') as unknown;
    return typeof parsed === 'object' && parsed != null ? (parsed as Record<string, number>) : {};
  } catch {
    return {};
  }
}

export function markEnvChanged(appId: string, at = Date.now()): void {
  try {
    sessionStorage.setItem(KEY, JSON.stringify({ ...readAll(), [appId]: at }));
  } catch {
    // Not essential: the reminder is just not shown.
  }
}

export function envChangedAt(appId: string): number | null {
  const at = readAll()[appId];
  return typeof at === 'number' ? at : null;
}

/**
 * A change made after the last deployment started. `lastDeployment` is the
 * date of that deployment, null when the application has none, undefined
 * while the deployments are not known yet (nothing is said then).
 */
export function awaitsDeployment(changedAt: number | null, lastDeployment: string | null | undefined): boolean {
  if (changedAt == null || lastDeployment === undefined) {
    return false;
  }
  return lastDeployment == null || Date.parse(lastDeployment) < changedAt;
}
