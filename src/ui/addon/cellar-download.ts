import type { CcApiClient } from '@clevercloud/client/cc-api-client.js';
import { fetchCellarDownloadUrl } from '../../data/api.js';

/**
 * Signs a download URL for one Cellar object and opens it. The tab is opened
 * before the call, while the click still counts as one, or the browser would
 * block it: call this straight from the click handler. Rejects, the blank tab
 * closed, when the signing fails.
 */
export async function openCellarDownload(
  client: CcApiClient,
  ownerId: string,
  realId: string,
  bucket: string,
  key: string,
): Promise<void> {
  const opened = window.open('', '_blank');
  if (opened != null) {
    opened.opener = null;
  }
  try {
    const url = await fetchCellarDownloadUrl(client, ownerId, realId, bucket, key);
    if (opened != null) {
      opened.location.href = url;
    } else {
      window.location.assign(url);
    }
  } catch (error) {
    opened?.close();
    throw error;
  }
}
