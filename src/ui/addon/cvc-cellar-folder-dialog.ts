import { css, html } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { folderNameError } from '../../core/addons/cellar.js';
import { t } from '../../core/i18n.js';
import { CvcElement } from '../shared/cvc-element.js';
import { sharedStyles } from '../shared/styles.js';

export interface FolderOpenDetail {
  name: string;
}

/**
 * A new folder in a Cellar bucket (#30). S3 has no folders, only key
 * prefixes, so nothing is written: the dialog names the folder, then the page
 * opens it, empty until a file is uploaded into it, as the Console does.
 * Emits `cvc-cellar-folder-open` with the name, or `cvc-cellar-folder-close`.
 */
@customElement('cvc-cellar-folder-dialog')
export class CvcCellarFolderDialog extends CvcElement {
  /** Where the folder goes, `bucket/folder/`, for the title. */
  @property() parent = '';

  @state() private name = '';
  @state() private touched = false;

  override firstUpdated(): void {
    this.renderRoot.querySelector<HTMLInputElement>('input')?.focus();
  }

  private close(): void {
    this.dispatchEvent(new CustomEvent('cvc-cellar-folder-close', { bubbles: true, composed: true }));
  }

  private onKeyDown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      this.close();
    }
  }

  private submit(event: Event): void {
    event.preventDefault();
    this.touched = true;
    if (folderNameError(this.name) != null) {
      return;
    }
    this.dispatchEvent(
      new CustomEvent<FolderOpenDetail>('cvc-cellar-folder-open', {
        detail: { name: this.name.trim() },
        bubbles: true,
        composed: true,
      }),
    );
  }

  override render() {
    const error = folderNameError(this.name);
    const shown = this.touched || this.name !== '' ? error : null;
    return html`
      <div class="backdrop" @click=${this.close}></div>
      <form class="dialog" role="dialog" aria-labelledby="title" @submit=${this.submit} @keydown=${this.onKeyDown}>
        <header>
          <h2 id="title">${t('cellarFolder.title')}</h2>
          <p class="muted small mono">${this.parent}</p>
        </header>
        <label class="field">
          <span>${t('cellarFolder.name')}</span>
          <input
            class="mono"
            .value=${this.name}
            aria-invalid=${shown != null}
            aria-describedby="help"
            @input=${(event: Event) => (this.name = (event.currentTarget as HTMLInputElement).value)}
          />
          <span id="help" class=${shown === 'invalid' ? 'error small' : 'muted small'}>
            ${shown === 'empty' ? t('cellarFolder.empty') : t('cellarFolder.rules')}
          </span>
        </label>
        <p class="notice small">${t('cellarFolder.notice')}</p>
        <footer class="row">
          <button type="button" class="ghost" @click=${this.close}>${t('common.cancel')}</button>
          <button type="submit" class="primary" ?disabled=${error != null}>${t('cellarFolder.submit')}</button>
        </footer>
      </form>
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
        top: 12vh;
        left: 50%;
        transform: translateX(-50%);
        width: min(480px, calc(100vw - 2rem));
        display: flex;
        flex-direction: column;
        gap: 0.9rem;
        padding: 1.25rem 1.5rem;
        background: var(--cvc-surface);
        border: 1px solid var(--cvc-border);
        border-radius: 12px;
        box-shadow: var(--cvc-shadow-pop);
        z-index: 41;
      }
      header p {
        margin: 0.3rem 0 0;
        overflow-wrap: anywhere;
      }
      .field {
        display: flex;
        flex-direction: column;
        gap: 0.35rem;
      }
      .notice {
        margin: 0;
        padding: 0.5rem 0.7rem;
        border-left: 3px solid var(--cvc-accent);
        background: color-mix(in srgb, var(--cvc-accent) 8%, transparent);
        border-radius: 4px;
      }
      footer {
        justify-content: flex-end;
        gap: 0.5rem;
      }
    `,
  ];
}

declare global {
  interface HTMLElementTagNameMap {
    'cvc-cellar-folder-dialog': CvcCellarFolderDialog;
  }
  interface HTMLElementEventMap {
    'cvc-cellar-folder-open': CustomEvent<FolderOpenDetail>;
    'cvc-cellar-folder-close': CustomEvent<undefined>;
  }
}
