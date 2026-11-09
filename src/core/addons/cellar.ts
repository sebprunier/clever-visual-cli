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
 * What the listing asks for once filtered (#30): the open folder, then the start of the names, as
 * the Console does. The API filters the whole folder, case-sensitive, directories included.
 */
export function filteredPrefix(folder: string, filter: string): string {
  return folder + filter;
}

/** `s3://bucket/folder/`: the form `aws s3`, `s3cmd` and most S3 clients read. */
export function s3Uri(bucket: string, prefix = ''): string {
  return `s3://${bucket}/${prefix}`;
}

/**
 * One s3cmd command on a Cellar add-on, keys included yet none in the clipboard: clever-tools reads
 * the add-on's variables (`CELLAR_ADDON_HOST`, `CELLAR_ADDON_KEY_ID`, `CELLAR_ADDON_KEY_SECRET`) when
 * it runs, then s3cmd gets them as options, path-style, which win over a `~/.s3cfg`. Everything is
 * chained with `&&`: when `clever addon env` fails, `eval` never sees what it printed (its help, on
 * stdout) and s3cmd does not run with empty options, which would fall back on other credentials.
 * One part per line, continued with `\`: it reads in a narrow block and pastes as is.
 */
function s3cmdScript(addonId: string, args: string): string {
  return [
    `cellar_vars=$(clever addon env ${addonId} -F shell)`,
    '  && eval "$cellar_vars"',
    '  && s3cmd --access_key=$CELLAR_ADDON_KEY_ID',
    '    --secret_key=$CELLAR_ADDON_KEY_SECRET',
    '    --host=$CELLAR_ADDON_HOST',
    '    --host-bucket=$CELLAR_ADDON_HOST',
    `    ${args}`,
  ].join(' \\\n');
}

/** Lists a folder (or the keys starting with a prefix) with s3cmd. */
export function s3cmdList(addonId: string, bucket: string, prefix = ''): string {
  return s3cmdScript(addonId, `ls ${shellQuote(s3Uri(bucket, prefix))}`);
}

/** Downloads one object with s3cmd, into the current folder under its name. */
export function s3cmdGet(addonId: string, bucket: string, key: string): string {
  return s3cmdScript(addonId, `get ${shellQuote(s3Uri(bucket, key))}`);
}

/** Uploads files into a folder with s3cmd, given by name: the browser does not know where they are. */
export function s3cmdPut(addonId: string, bucket: string, folder: string, fileNames: readonly string[]): string {
  const files = fileNames.map((name) => shellQuote(name)).join(' ');
  return s3cmdScript(addonId, `put ${files} ${shellQuote(s3Uri(bucket, folder))}`);
}

/**
 * The Console's rule for a folder name, after the S3 guidance on safe keys: no slash (one level at a
 * time), none of `\ { } ^ % ` [ ] " < > ~ # |`, nothing from 128 to 255.
 */
const FOLDER_NAME_FORBIDDEN = /[/\\{}^%`\]">[~<#|\u0080-\u00FF]/;

/** Why a new folder name is refused, or null when it is fine. */
export function folderNameError(name: string): 'empty' | 'invalid' | null {
  const trimmed = name.trim();
  if (trimmed === '' || trimmed === '.' || trimmed === '..') {
    return 'empty';
  }
  return FOLDER_NAME_FORBIDDEN.test(trimmed) ? 'invalid' : null;
}

/**
 * The largest file the upload route takes, once measured on a real bucket; null while unknown, and
 * then nothing is held back. Files over it are left to s3cmd.
 */
export const UPLOAD_MAX_BYTES: number | null = null;

/** One file of an upload, as the dialog lists it before anything is sent. */
export interface UploadEntry {
  name: string;
  size: number;
  /** The open folder, then the file name. */
  key: string;
  /** The key holds an object already: it is replaced, or kept as a previous version. */
  exists: boolean;
  /** Over the largest body the upload route takes: left to s3cmd. */
  tooBig: boolean;
  /** A second file with the same name in the selection: only the first one is sent. */
  duplicate: boolean;
}

/**
 * What an upload of these files into `folder` does: each file's key, which keys exist already, which
 * files are over the cap (none when the cap is unknown), and the names chosen twice.
 */
export function planUpload(
  folder: string,
  files: ReadonlyArray<{ name: string; size: number }>,
  existingKeys: ReadonlySet<string>,
  maxBytes: number | null,
): UploadEntry[] {
  const seen = new Set<string>();
  return files.map((file) => {
    const key = folder + file.name;
    const duplicate = seen.has(key);
    seen.add(key);
    return {
      name: file.name,
      size: file.size,
      key,
      exists: existingKeys.has(key),
      tooBig: maxBytes != null && file.size > maxBytes,
      duplicate,
    };
  });
}

/** The files an upload actually sends: not over the cap, each name once. */
export function sendable(entries: readonly UploadEntry[]): UploadEntry[] {
  return entries.filter((entry) => !entry.tooBig && !entry.duplicate);
}

function bucketUrl(ownerId: string, realId: string, bucket: string): string {
  return `${API_HOST}/v4/cellar/organisations/${ownerId}/cellar/${realId}/buckets/${encodeURIComponent(bucket)}`;
}

/** An object's route, the key percent-encoded slashes included. */
function objectUrl(ownerId: string, realId: string, bucket: string, key: string): string {
  return `${bucketUrl(ownerId, realId, bucket)}/objects/${encodeURIComponent(key)}`;
}

/** `GET …/objects/<key>`: one object read on its own. */
export function objectCurl(ownerId: string, realId: string, bucket: string, key: string): string {
  return `clever curl ${shellQuote(objectUrl(ownerId, realId, bucket, key))}`;
}

/** `DELETE …/objects/<key>`: what "Delete" sends for a file. */
export function deleteObjectCurl(ownerId: string, realId: string, bucket: string, key: string): string {
  return `clever curl -X DELETE ${shellQuote(objectUrl(ownerId, realId, bucket, key))}`;
}

/** `DELETE …/buckets/<bucket>`, with the purge when the bucket holds something. */
export function deleteBucketCurl(ownerId: string, realId: string, bucket: string, purge: boolean): string {
  const url = `${bucketUrl(ownerId, realId, bucket)}${purge ? '?purgeObjects=true' : ''}`;
  return `clever curl -X DELETE ${shellQuote(url)}`;
}

/** What the dialog of a bucket's deletion knows it holds. */
export interface BucketContents {
  objects: number;
  sizeInBytes: number;
  /** The listing has something, whatever the count says: the count can lag. */
  listed: boolean;
  /** The API answered that the bucket is not empty, though nothing is listed (previous versions are not). */
  refused: boolean;
  /** Versioning is or was on: the count includes previous versions, which the listing does not show. */
  versioned: boolean;
}

/**
 * Only what the dialog showed gets purged: a bucket seen empty is deleted without `purgeObjects`,
 * and the API refuses it if something came in meanwhile.
 */
export function needsPurge(contents: BucketContents): boolean {
  return contents.objects > 0 || contents.listed || contents.refused;
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
