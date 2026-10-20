import { beforeAll, describe, expect, it } from 'vitest';
import {
  describeStep,
  invertSteps,
  planTagOperation,
  runSteps,
  tagsOf,
  validateTag,
  type TagResource,
  type TagStep,
} from './tagging.js';
import { setLocale } from '../i18n.js';

beforeAll(() => setLocale('fr', false));

const web: TagResource = { id: 'app_1', kind: 'app', name: 'web', tags: ['env:prod', 'project:shop:prod'] };
const db: TagResource = { id: 'addon_1', kind: 'addon', name: 'db', tags: ['env:qa'] };
const bare: TagResource = { id: 'app_2', kind: 'app', name: 'bare', tags: [] };
const outline = (steps: TagStep[]) =>
  steps.map((step) => `${step.action === 'add' ? '+' : '-'}${step.tag}@${step.resource.name}`);

describe('bulk tagging', () => {
  it('validates tags', () => {
    expect(validateTag('env:prod')).toBeNull();
    expect(validateTag('  ')).toBe('Le tag est vide.');
    expect(validateTag('env: prod')).toBe('Un tag ne contient pas d’espace.');
    expect(validateTag('a/b')).toBe('Un tag ne contient ni /, ?, # ni %.');
    expect(validateTag('x'.repeat(101))).toBe('Un tag fait 100 caractères au plus.');
  });

  it('plans only what changes', () => {
    expect(outline(planTagOperation({ kind: 'add', tag: 'env:prod' }, [web, db, bare]))).toEqual([
      '+env:prod@db',
      '+env:prod@bare',
    ]);
    expect(outline(planTagOperation({ kind: 'remove', tag: 'env:prod' }, [web, db, bare]))).toEqual(['-env:prod@web']);
    expect(outline(planTagOperation({ kind: 'rename', from: 'env:qa', to: 'env:qua' }, [web, db, bare]))).toEqual([
      '-env:qa@db',
      '+env:qua@db',
    ]);
    expect(outline(planTagOperation({ kind: 'rename', from: 'env:prod', to: 'env:prod' }, [web]))).toEqual([]);
    expect(outline(planTagOperation({ kind: 'rename', from: 'env:prod', to: 'project:shop:prod' }, [web]))).toEqual([
      '-env:prod@web',
    ]);
  });

  it('inverts a plan most recent first, and describes the HTTP calls', () => {
    const steps = planTagOperation({ kind: 'rename', from: 'env:qa', to: 'env:qua' }, [db]);
    expect(outline(invertSteps(steps))).toEqual(['-env:qua@db', '+env:qa@db']);
    expect(describeStep(steps[0], 'orga_1')).toBe(
      'clever curl -X DELETE https://api.clever-cloud.com/v2/organisations/orga_1/addons/addon_1/tags/env%3Aqa',
    );
    expect(describeStep(planTagOperation({ kind: 'add', tag: 'a' }, [bare])[0], 'orga_1')).toBe(
      'clever curl -X PUT https://api.clever-cloud.com/v2/organisations/orga_1/applications/app_2/tags/a',
    );
    // encodeURIComponent leaves ' ( ) alone: the URL is quoted for the shell.
    expect(describeStep(planTagOperation({ kind: 'add', tag: "it's(x)" }, [bare])[0], 'user_1')).toBe(
      `clever curl -X PUT 'https://api.clever-cloud.com/v2/organisations/user_1/applications/app_2/tags/it'\\''s(x)'`,
    );
    expect(tagsOf([web, db, bare])).toEqual(['env:prod', 'env:qa', 'project:shop:prod']);
  });

  it('runs the steps, keeps going after a failure and reports progress', async () => {
    const steps = planTagOperation({ kind: 'add', tag: 'team:x' }, [web, db, bare]);
    const progress: number[] = [];
    const result = await runSteps(
      steps,
      async (step) => {
        if (step.resource.name === 'db') {
          throw new Error('boom');
        }
      },
      { onProgress: (done) => progress.push(done) },
    );
    expect(outline(result.done).sort()).toEqual(['+team:x@bare', '+team:x@web']);
    expect(result.failed.map((failure) => failure.step.resource.name)).toEqual(['db']);
    expect(result.failed[0].error).toContain('boom');
    expect(progress).toEqual([1, 2, 3]);
  });
});
