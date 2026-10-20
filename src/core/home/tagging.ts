/**
 * Bulk tag operations on applications and add-ons: a plan of one-tag-per-call
 * steps computed from the current tags (nothing is sent for a tag already
 * there, or already gone), run with a small concurrency, and invertible so a
 * toast can undo what was just applied. The API has no clever-tools
 * equivalent for tags, so the dialog shows the HTTP calls instead.
 */
import type { CcApiClient } from '@clevercloud/client/cc-api-client.js';
import { addTag, removeTag, type TagTarget } from '../../data/api.js';
import { API_HOST } from '../constants.js';
import { t } from '../i18n.js';
import { shellQuote } from '../shell.js';

export type TagOperation =
  { kind: 'add'; tag: string } | { kind: 'remove'; tag: string } | { kind: 'rename'; from: string; to: string };

export interface TagResource {
  id: string;
  kind: 'app' | 'addon';
  name: string;
  tags: string[];
}

export interface TagStep {
  resource: TagResource;
  action: 'add' | 'remove';
  tag: string;
}

export interface RunResult<T> {
  done: T[];
  failed: Array<{ step: T; error: string }>;
}

export type TagRunResult = RunResult<TagStep>;

export type StepExecutor<T = TagStep> = (step: T) => Promise<void>;

export interface RunOptions {
  onProgress?: (done: number, total: number) => void;
  /** Turns an error into a message; defaults to the error's own message. */
  describe?: (error: unknown) => string;
}

const CONCURRENCY = 6;

/** A problem with the tag, in French, or null when it is usable. */
export function validateTag(tag: string): string | null {
  const trimmed = tag.trim();
  if (trimmed === '') {
    return t('tag.error.empty');
  }
  if (/\s/.test(trimmed)) {
    return t('tag.error.space');
  }
  if (/[/?#%]/.test(trimmed)) {
    return t('tag.error.chars');
  }
  if (trimmed.length > 100) {
    return t('tag.error.length');
  }
  return null;
}

/** The steps that bring every resource to the wanted state; resources already there are skipped. */
export function planTagOperation(operation: TagOperation, resources: readonly TagResource[]): TagStep[] {
  const steps: TagStep[] = [];
  for (const resource of resources) {
    const has = (tag: string) => resource.tags.includes(tag);
    switch (operation.kind) {
      case 'add':
        if (!has(operation.tag)) {
          steps.push({ resource, action: 'add', tag: operation.tag });
        }
        break;
      case 'remove':
        if (has(operation.tag)) {
          steps.push({ resource, action: 'remove', tag: operation.tag });
        }
        break;
      case 'rename':
        if (has(operation.from) && operation.from !== operation.to) {
          steps.push({ resource, action: 'remove', tag: operation.from });
          if (!has(operation.to)) {
            steps.push({ resource, action: 'add', tag: operation.to });
          }
        }
        break;
    }
  }
  return steps;
}

/** The steps that undo `steps`, most recent first. */
/**
 * The steps that turn the tags of one resource into `next`, as the editor of
 * an application or add-on page sets them: removals, then additions, each tag
 * once, nothing for a tag kept.
 */
export function planTagEdit(resource: TagResource, next: readonly string[]): TagStep[] {
  const wanted = [...new Set(next.map((tag) => tag.trim()).filter((tag) => tag !== ''))];
  return [
    ...resource.tags
      .filter((tag) => !wanted.includes(tag))
      .map((tag): TagStep => ({ resource, action: 'remove', tag })),
    ...wanted.filter((tag) => !resource.tags.includes(tag)).map((tag): TagStep => ({ resource, action: 'add', tag })),
  ];
}

export function invertSteps(steps: readonly TagStep[]): TagStep[] {
  return [...steps].reverse().map((step) => ({ ...step, action: step.action === 'add' ? 'remove' : 'add' }));
}

/** The HTTP call a step makes, since clever-tools has no command for tags. */
/**
 * One step as a command to run: clever-tools has no tag command, so the
 * step goes through `clever curl`, which signs the same API call the app
 * sends, the tag encoded the same way.
 */
export function describeStep(step: TagStep, ownerId: string): string {
  const method = step.action === 'add' ? 'PUT' : 'DELETE';
  const resource = step.resource.kind === 'app' ? `applications/${step.resource.id}` : `addons/${step.resource.id}`;
  const url = `${API_HOST}/v2/organisations/${ownerId}/${resource}/tags/${encodeURIComponent(step.tag)}`;
  return `clever curl -X ${method} ${shellQuote(url)}`;
}

/** The tags used anywhere in an organisation, sorted: the suggestions of a tag field. */
export function tagsInUse(items: ReadonlyArray<{ customerTags: string[] }>): string[] {
  return [...new Set(items.flatMap((item) => item.customerTags))].sort((a, b) => a.localeCompare(b, 'fr'));
}

/** The tags present on at least one of the resources, sorted. */
export function tagsOf(resources: readonly TagResource[]): string[] {
  return [...new Set(resources.flatMap((resource) => resource.tags))].sort((a, b) => a.localeCompare(b, 'fr'));
}

export function apiExecutor(client: CcApiClient, ownerId: string): StepExecutor {
  return async (step) => {
    const target: TagTarget =
      step.resource.kind === 'app'
        ? { ownerId, applicationId: step.resource.id }
        : { ownerId, addonId: step.resource.id };
    if (step.action === 'add') {
      await addTag(client, target, step.tag);
    } else {
      await removeTag(client, target, step.tag);
    }
  };
}

/** Runs the steps with a small concurrency; a failure never stops the others. */
/** Runs the steps with a small concurrency; the bulk restart and stop reuse it with their own steps. */
export async function runSteps<T>(
  steps: readonly T[],
  execute: StepExecutor<T>,
  options: RunOptions = {},
): Promise<RunResult<T>> {
  const describe = options.describe ?? ((error: unknown) => (error instanceof Error ? error.message : String(error)));
  const result: RunResult<T> = { done: [], failed: [] };
  let next = 0;
  let completed = 0;
  const worker = async () => {
    while (next < steps.length) {
      const step = steps[next++];
      try {
        await execute(step);
        result.done.push(step);
      } catch (error) {
        result.failed.push({ step, error: describe(error) });
      } finally {
        completed += 1;
        options.onProgress?.(completed, steps.length);
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, steps.length) }, worker));
  return result;
}
