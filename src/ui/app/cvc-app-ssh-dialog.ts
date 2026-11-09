import type { CcApiClient } from '@clevercloud/client/cc-api-client.js';
import { css, html, nothing, type PropertyValues } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { isDockerApp, SSH_KEY_ADD, sshInstances, sshRun, sshSession, sshTarget } from '../../core/app/ssh.js';
import { t } from '../../core/i18n.js';
import { fetchSshKeys, type Application, type Instance, type SshKey } from '../../data/api.js';
import '../shared/cvc-cli.js';
import { CvcElement } from '../shared/cvc-element.js';
import { INSTANCE_STATE_LABELS, stateLabel } from '../shared/format.js';
import { sharedStyles } from '../shared/styles.js';

/** The account's keys, read once per client (so per session); null when they could not be read. */
const keysRead = new WeakMap<CcApiClient, Promise<readonly SshKey[] | null>>();

function readKeys(client: CcApiClient): Promise<readonly SshKey[] | null> {
  let read = keysRead.get(client);
  if (read == null) {
    read = fetchSshKeys(client).catch(() => null);
    keysRead.set(client, read);
  }
  return read;
}

/**
 * The `clever ssh` commands of an application (#36), opened from the overview:
 * a static page cannot open a session, so it shows the command, with the
 * instances to choose from when there are several and a command to run built
 * as one types. Emits `cvc-app-ssh-close`.
 */
@customElement('cvc-app-ssh-dialog')
export class CvcAppSshDialog extends CvcElement {
  @property({ attribute: false }) client!: CcApiClient;
  @property({ attribute: false }) app!: Application;
  /** Null until read. */
  @property({ attribute: false }) instances: readonly Instance[] | null = null;

  @state() private command = '';
  /** Null when not read, or when they could not be: the line is then left out. */
  @state() private keys: readonly SshKey[] | null = null;

  override willUpdate(changed: PropertyValues<this>): void {
    if (changed.has('client') && this.client != null) {
      const client = this.client;
      this.keys = null;
      void readKeys(client).then((keys) => {
        if (this.client === client) {
          this.keys = keys;
        }
      });
    }
  }

  override firstUpdated(): void {
    this.renderRoot.querySelector<HTMLElement>('input')?.focus();
  }

  private close(): void {
    this.dispatchEvent(new CustomEvent('cvc-app-ssh-close', { bubbles: true, composed: true }));
  }

  private onKeyDown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      this.close();
    }
  }

  private renderInstances(running: readonly Instance[]) {
    return html`<ul class="instances">
      ${running.map(
        (instance) =>
          html`<li>
            <span class="small">
              ${instance.isBuildVm ? t('ssh.buildInstance') : t('ssh.instance', { number: instance.index ?? '?' })}
              ${instance.flavor == null ? nothing : html`· ${instance.flavor}`} ·
              <span class="muted">${stateLabel(INSTANCE_STATE_LABELS, instance.state).label}</span>
            </span>
            <cvc-cli block command=${sshSession(this.app.id, sshTarget(instance, running))}></cvc-cli>
          </li>`,
      )}
    </ul>`;
  }

  private renderKeys() {
    const keys = this.keys;
    if (keys == null) {
      return nothing;
    }
    if (keys.length === 0) {
      return html`<p class="small">${t('ssh.noKey')}</p>
        <cvc-cli block command=${SSH_KEY_ADD}></cvc-cli>`;
    }
    return html`<p class="muted small" title=${keys.map((key) => key.name).join('\n')}>
      ${t('ssh.keys', { count: keys.length })}
    </p>`;
  }

  override render() {
    const running = this.instances == null ? null : sshInstances(this.instances);
    const docker = isDockerApp(this.app);
    const command = this.command.trim();
    return html`
      <div class="backdrop" @click=${this.close}></div>
      <section class="dialog" role="dialog" aria-modal="true" aria-labelledby="title" @keydown=${this.onKeyDown}>
        <header>
          <h2 id="title">${t('ssh.title')}</h2>
          <p class="muted small">${this.app.name}</p>
        </header>
        ${running?.length === 0 ? html`<p class="muted small">${t('ssh.noInstance')}</p>` : nothing}
        ${
          running != null && running.length > 1
            ? this.renderInstances(running)
            : html`<cvc-cli block command=${sshSession(this.app.id)}></cvc-cli>`
        }
        <label class="field">
          <span class="small">${t('ssh.prepare')}</span>
          <input
            class="mono"
            placeholder="hostname"
            autocomplete="off"
            spellcheck="false"
            aria-describedby="prepare-hint"
            .value=${this.command}
            @input=${(event: Event) => (this.command = (event.currentTarget as HTMLInputElement).value)}
          />
          <span id="prepare-hint" class="muted small">${t('ssh.prepareHint')}</span>
        </label>
        ${command === '' ? nothing : html`<cvc-cli block command=${sshRun(this.app.id, command, docker)}></cvc-cli>`}
        ${docker ? html`<p class="muted small">${t('ssh.dockerNote')}</p>` : nothing} ${this.renderKeys()}
        <footer class="row">
          <button type="button" class="ghost" @click=${this.close}>${t('common.close')}</button>
        </footer>
      </section>
    `;
  }

  static override styles = [
    sharedStyles,
    css`
      .backdrop {
        position: fixed;
        inset: 0;
        background: var(--cvc-backdrop);
        z-index: 40;
      }
      .dialog {
        position: fixed;
        top: 10vh;
        left: 50%;
        transform: translateX(-50%);
        width: min(560px, calc(100vw - 2rem));
        max-height: 80vh;
        overflow: auto;
        display: flex;
        flex-direction: column;
        gap: 0.75rem;
        padding: 1.25rem 1.5rem;
        background: var(--cvc-surface);
        border: 1px solid var(--cvc-border);
        border-radius: 12px;
        box-shadow: var(--cvc-shadow-pop);
        z-index: 41;
      }
      h2,
      p {
        margin: 0;
      }
      header p {
        margin-top: 0.3rem;
      }
      .instances {
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
        margin: 0;
        padding: 0;
        list-style: none;
      }
      .instances li {
        display: flex;
        flex-direction: column;
        gap: 0.2rem;
      }
      .field {
        display: flex;
        flex-direction: column;
        gap: 0.3rem;
      }
      footer {
        justify-content: flex-end;
      }
    `,
  ];
}

declare global {
  interface HTMLElementTagNameMap {
    'cvc-app-ssh-dialog': CvcAppSshDialog;
  }
  interface HTMLElementEventMap {
    'cvc-app-ssh-close': CustomEvent<undefined>;
  }
}
