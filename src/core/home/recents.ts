/** Applications opened in this browser, most recent first. Local only, never sent anywhere. */

const KEY = 'cvc.recents';
const MAX = 40;

export interface RecentVisit {
  ownerId: string;
  appId: string;
  at: number;
}

export function recordVisit(ownerId: string, appId: string, now = Date.now()): void {
  const visits = readAll().filter((visit) => visit.appId !== appId);
  visits.unshift({ ownerId, appId, at: now });
  try {
    localStorage.setItem(KEY, JSON.stringify(visits.slice(0, MAX)));
  } catch {
    // Not essential.
  }
}

/** A deleted application leaves the recent ones (#31). */
export function forgetVisit(appId: string): void {
  const visits = readAll();
  const kept = visits.filter((visit) => visit.appId !== appId);
  if (kept.length === visits.length) {
    return;
  }
  try {
    localStorage.setItem(KEY, JSON.stringify(kept));
  } catch {
    // Not essential.
  }
}

export function listRecents(ownerId: string): RecentVisit[] {
  return readAll().filter((visit) => visit.ownerId === ownerId);
}

function readAll(): RecentVisit[] {
  try {
    const raw = localStorage.getItem(KEY);
    const parsed: unknown = raw == null ? [] : JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.filter(
          (visit): visit is RecentVisit =>
            typeof visit?.ownerId === 'string' && typeof visit?.appId === 'string' && typeof visit?.at === 'number',
        )
      : [];
  } catch {
    return [];
  }
}
