import { css } from 'lit';

/** What the two deletion dialogs of a Cellar add-on share (#30). */
export const cellarDeleteStyles = css`
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
    width: min(540px, calc(100vw - 2rem));
    max-height: 80vh;
    overflow: auto;
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
  header p,
  .what {
    margin: 0.3rem 0 0;
    overflow-wrap: anywhere;
  }
  p {
    margin: 0;
  }
  .notice {
    padding: 0.5rem 0.7rem;
    border-left: 3px solid var(--cvc-danger);
    background: color-mix(in srgb, var(--cvc-danger) 8%, transparent);
    border-radius: 4px;
  }
  .cli-block {
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
  }
  footer {
    justify-content: flex-end;
    gap: 0.5rem;
  }
  button.danger {
    background: var(--cvc-danger);
    color: var(--cvc-accent-text);
    border-color: transparent;
  }
`;
