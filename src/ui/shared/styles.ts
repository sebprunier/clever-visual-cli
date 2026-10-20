import { css } from 'lit';

/**
 * The colours of the status icons (`src/ui/shared/status.ts`), given by class since the
 * production CSP refuses `style` attributes. Part of `sharedStyles`, and on its own for the
 * components that do without the rest.
 */
export const statusIconStyles = css`
  .status-icon {
    flex: none;
    vertical-align: -0.15em;
  }
  .status-icon .s-ok {
    color: var(--cvc-ok);
  }
  .status-icon .s-info {
    color: var(--cvc-info);
  }
  .status-icon .s-danger {
    color: var(--cvc-danger);
  }
  .status-icon .s-stopped {
    color: color-mix(in srgb, var(--cvc-muted) 55%, transparent);
  }
`;

/** Base styles shared by every component: typography, controls, cards, badges, tables. */
export const sharedStyles = css`
  ${statusIconStyles}
  :host {
    box-sizing: border-box;
  }
  *,
  *::before,
  *::after {
    box-sizing: inherit;
  }
  h1,
  h2,
  h3 {
    margin: 0;
    font-weight: 600;
    line-height: 1.25;
  }
  h1 {
    font-size: 1.4rem;
  }
  h2 {
    font-size: 1.05rem;
  }
  h3 {
    font-size: 0.95rem;
  }
  p {
    margin: 0;
  }
  a {
    color: inherit;
  }
  code,
  .mono {
    font-family: var(--cvc-mono);
    font-size: 0.88em;
  }
  .muted {
    color: var(--cvc-muted);
  }
  .small {
    font-size: 0.85rem;
  }
  .row {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    flex-wrap: wrap;
  }
  .stack {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }
  .error {
    padding: 0.6rem 0.9rem;
    border: 1px solid var(--cvc-danger);
    border-radius: var(--cvc-radius);
    color: var(--cvc-danger);
    background: color-mix(in srgb, var(--cvc-danger) 8%, transparent);
  }

  button,
  input,
  select,
  textarea {
    font: inherit;
    color: var(--cvc-text);
    background: var(--cvc-surface);
    border: 1px solid var(--cvc-border);
    border-radius: var(--cvc-radius);
    padding: 0.45rem 0.7rem;
  }
  input:focus-visible,
  select:focus-visible,
  button:focus-visible,
  textarea:focus-visible {
    outline: 2px solid var(--cvc-accent);
    outline-offset: 1px;
  }
  button {
    cursor: pointer;
    white-space: nowrap;
  }
  button.primary {
    background: var(--cvc-accent);
    color: var(--cvc-accent-text);
    border-color: transparent;
  }
  button.ghost {
    background: transparent;
  }
  /* A button with a leading icon. */
  button.with-icon {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
  }
  button.link {
    background: none;
    border: none;
    padding: 0;
    color: var(--cvc-accent);
    text-decoration: underline;
  }
  /* The first line of a menu panel: what it is about, and on the right the action that leaves
     that state (leave a view, hide the costs), the same in every menu. */
  .menu-head {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 0.6rem;
  }
  .menu-head > :first-child {
    margin: 0;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .menu-head button.link {
    flex: none;
    font-size: 0.85rem;
  }
  button:disabled {
    opacity: 0.5;
    cursor: default;
  }

  .card {
    background: var(--cvc-surface);
    border: 1px solid var(--cvc-border);
    border-radius: var(--cvc-radius);
    padding: 1rem 1.25rem;
    box-shadow: var(--cvc-shadow);
    transition: box-shadow 0.15s;
  }
  .card:hover {
    box-shadow: var(--cvc-shadow-hover);
  }

  .badge {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    padding: 0.1rem 0.55rem;
    border-radius: 999px;
    font-size: 0.78rem;
    font-weight: 500;
    line-height: 1.5;
    border: 1px solid transparent;
    white-space: nowrap;
  }
  .badge::before {
    content: '';
    width: 0.5rem;
    height: 0.5rem;
    border-radius: 50%;
    background: currentColor;
  }
  .badge.ok {
    color: var(--cvc-ok);
    background: color-mix(in srgb, var(--cvc-ok) 12%, transparent);
  }
  .badge.warn {
    color: var(--cvc-warn);
    background: color-mix(in srgb, var(--cvc-warn) 14%, transparent);
  }
  .badge.danger {
    color: var(--cvc-danger);
    background: color-mix(in srgb, var(--cvc-danger) 10%, transparent);
  }
  .badge.neutral {
    color: var(--cvc-muted);
    background: color-mix(in srgb, var(--cvc-muted) 12%, transparent);
  }
  .badge.info {
    color: var(--cvc-info);
    background: color-mix(in srgb, var(--cvc-info) 12%, transparent);
  }

  .cli {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    font-family: var(--cvc-mono);
    font-size: 0.8rem;
    color: var(--cvc-muted);
    background: color-mix(in srgb, var(--cvc-muted) 10%, transparent);
    border-radius: 6px;
    padding: 0.15rem 0.5rem;
  }
  .cli::before {
    content: '$';
    opacity: 0.6;
  }

  table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.9rem;
  }
  th,
  td {
    text-align: left;
    padding: 0.5rem 0.6rem;
    border-bottom: 1px solid var(--cvc-border);
    vertical-align: top;
  }
  th {
    font-weight: 600;
    font-family: var(--cvc-label-font);
    color: var(--cvc-muted);
    font-size: 0.8rem;
    text-transform: uppercase;
    letter-spacing: 0.03em;
  }
  tr:last-child td {
    border-bottom: none;
  }

  .empty {
    padding: 2rem 1rem;
    text-align: center;
    color: var(--cvc-muted);
  }
`;
