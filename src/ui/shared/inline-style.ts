/**
 * Styles computed at render time, such as the colour of each application in
 * the logs, set through the CSSOM (`style.setProperty`). The production CSP
 * (`style-src 'self'`) refuses a `style` attribute, and Lit's `styleMap`
 * writes one on its first render. An element binding:
 * `<div ${inlineStyle({ background: tint })}>`; a null value removes it.
 */
import { noChange } from 'lit';
import { Directive, directive, PartType, type ElementPart, type PartInfo } from 'lit/directive.js';

export type InlineStyles = Readonly<Record<string, string | null | undefined>>;

class InlineStyleDirective extends Directive {
  #previous = new Set<string>();

  constructor(partInfo: PartInfo) {
    super(partInfo);
    if (partInfo.type !== PartType.ELEMENT) {
      throw new Error('inlineStyle() binds to an element, not to an attribute.');
    }
  }

  render(_styles: InlineStyles) {
    return noChange;
  }

  override update(part: ElementPart, [styles]: [InlineStyles]) {
    const { style } = part.element as HTMLElement;
    for (const name of this.#previous) {
      if (styles[name] == null) {
        style.removeProperty(name);
        this.#previous.delete(name);
      }
    }
    for (const [name, value] of Object.entries(styles)) {
      if (value != null) {
        style.setProperty(name, value);
        this.#previous.add(name);
      }
    }
    return noChange;
  }
}

export const inlineStyle = directive(InlineStyleDirective);
