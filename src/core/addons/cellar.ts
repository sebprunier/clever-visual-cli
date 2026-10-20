/**
 * Browsing a Cellar add-on: the way down to a prefix, and the `clever curl`
 * call of the current view, since clever-tools has no Cellar command.
 */
import { API_HOST } from '../constants.js';
import { shellQuote } from '../shell.js';

/** "a/b/" → a, then b, each with the prefix that opens it. */
export function prefixTrail(prefix: string): Array<{ name: string; prefix: string }> {
  const trail: Array<{ name: string; prefix: string }> = [];
  let path = '';
  for (const name of prefix.split('/').filter((part) => part !== '')) {
    path += `${name}/`;
    trail.push({ name, prefix: path });
  }
  return trail;
}

/** The buckets of the add-on, or one bucket's content under a prefix. */
export function cellarCurl(ownerId: string, realId: string, bucket = '', prefix = ''): string {
  let url = `${API_HOST}/v4/cellar/organisations/${ownerId}/cellar/${realId}/buckets`;
  if (bucket !== '') {
    url += `/${encodeURIComponent(bucket)}/objects`;
    if (prefix !== '') {
      url += `?prefix=${encodeURIComponent(prefix)}`;
    }
  }
  return `clever curl ${shellQuote(url)}`;
}
