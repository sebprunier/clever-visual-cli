/**
 * What follows a tag change, on the home page as on the page of a resource:
 * a toast that says what was applied and offers to undo it, and a reload of
 * the summary the tags come from.
 */
import type { CcApiClient } from '@clevercloud/client/cc-api-client.js';
import { describeError } from '../../core/clever-client.js';
import { apiExecutor, invertSteps, runSteps, type TagRunResult, type TagStep } from '../../core/home/tagging.js';
import { t } from '../../core/i18n.js';
import { pushToast, requestSummaryRefresh } from './events.js';

export function announceTagResult(host: HTMLElement, client: CcApiClient, ownerId: string, result: TagRunResult): void {
  const done = result.done.length;
  const failed = result.failed.length;
  pushToast(host, {
    kind: failed === 0 ? 'success' : 'error',
    message:
      failed === 0
        ? t('tags.applied', { count: done })
        : t('tags.partial', { done, failed, error: result.failed[0].error }),
    action: done > 0 ? { label: t('tags.undo'), run: () => void undo(host, client, ownerId, result.done) } : undefined,
  });
  requestSummaryRefresh(host);
}

async function undo(host: HTMLElement, client: CcApiClient, ownerId: string, steps: TagStep[]): Promise<void> {
  const result = await runSteps(invertSteps(steps), apiExecutor(client, ownerId), { describe: describeError });
  pushToast(
    host,
    result.failed.length === 0
      ? { kind: 'info', message: t('tags.undone', { count: result.done.length }) }
      : { kind: 'error', message: t('tags.undoFailed', { error: result.failed[0].error }) },
  );
  requestSummaryRefresh(host);
}
