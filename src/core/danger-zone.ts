/**
 * The danger zone of an application or an add-on (#31): archiving, which
 * clever-tools has no command for, and the name typed to confirm a deletion.
 */
import { API_HOST } from './constants.js';
import { shellQuote } from './shell.js';

/** `PUT …/applications/<id>` with `archived`: what Archive and Unarchive send. */
export function archiveCurl(ownerId: string, appId: string, archived: boolean): string {
  const url = `${API_HOST}/v2/organisations/${ownerId}/applications/${appId}`;
  return `clever curl -X PUT -H 'Content-Type: application/json' -d ${shellQuote(JSON.stringify({ archived }))} ${shellQuote(url)}`;
}

/** A deletion goes ahead once the resource's name is typed as it is, spaces around it aside. */
export function confirmsName(typed: string, name: string): boolean {
  return name !== '' && typed.trim() === name;
}
