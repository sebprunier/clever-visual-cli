/**
 * Browsing a Cellar add-on: the way down to a prefix, and the `clever curl`
 * call of the current view, since clever-tools has no Cellar command. Also
 * what creating a bucket needs (#29).
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

/**
 * The S3 rules for a bucket name: 3 to 63 characters, lowercase letters, digits, dots and hyphens,
 * a letter or a digit at both ends, no two dots in a row, not shaped like an IP address.
 */
export const BUCKET_NAME_PATTERN = /^(?!\d+\.\d+\.\d+\.\d+$)(?!.*\.\.)[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/;

/** `POST …/buckets`: what "New bucket" sends. */
export function createBucketCurl(ownerId: string, realId: string, name: string, versioning: boolean): string {
  const url = `${API_HOST}/v4/cellar/organisations/${ownerId}/cellar/${realId}/buckets`;
  const body = JSON.stringify({ name, versioning });
  return `clever curl -X POST -H 'Content-Type: application/json' -d ${shellQuote(body)} ${shellQuote(url)}`;
}
