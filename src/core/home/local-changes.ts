/**
 * What the user changes here of what the sync carries (display preferences,
 * favourite views), by space, so the sync can write it after a pause. Writes
 * that come from the sync itself go through the `save…` functions and say
 * nothing, or a change would bounce back and forth.
 */
export const localChanges = new EventTarget();

export interface LocalChangeDetail {
  ownerId: string;
}

export function notifyLocalChange(ownerId: string): void {
  localChanges.dispatchEvent(new CustomEvent<LocalChangeDetail>('change', { detail: { ownerId } }));
}

/** The spaces this browser remembers something about. */
export function knownOwners(): string[] {
  try {
    const owners = Object.keys(localStorage)
      .map((key) => /^cvc\.(?:home|favorites)\.(.+)$/.exec(key)?.[1])
      .filter((owner): owner is string => owner != null);
    return [...new Set(owners)];
  } catch {
    return [];
  }
}
