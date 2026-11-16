/**
 * ANSI escape codes in log lines, as a terminal reads them: the colours and
 * styles of the SGR codes (`\x1b[31m`…) become segments, every other escape
 * sequence goes away. Each line starts from a clean state.
 */

export const ANSI_COLOURS = [
  'black',
  'red',
  'green',
  'yellow',
  'blue',
  'magenta',
  'cyan',
  'white',
  'bright-black',
  'bright-red',
  'bright-green',
  'bright-yellow',
  'bright-blue',
  'bright-magenta',
  'bright-cyan',
  'bright-white',
] as const;

export type AnsiColour = (typeof ANSI_COLOURS)[number];

interface AnsiStyle {
  fg?: AnsiColour;
  bg?: AnsiColour;
  bold?: boolean;
  dim?: boolean;
  italic?: boolean;
  underline?: boolean;
}

/** A run of text with one style; only the attributes that apply are set. */
export interface AnsiSegment extends AnsiStyle {
  text: string;
}

const ESC = '\x1b';

/**
 * One escape sequence: a CSI (`ESC [ params final`, captured), a CSI cut off
 * at the end of the line, an OSC (`ESC ] … BEL` or `ESC ] … ESC \`, or up to
 * the next ESC), a two-character escape, or a lone ESC.
 */
const ESCAPE = /\x1b(?:\[([0-?]*)[ -/]*([@-~])|\[[0-?]*[ -/]*$|\][^\x07\x1b]*(?:\x07|\x1b\\)?|[ -/]*[0-~])?/g;

export function hasAnsi(text: string): boolean {
  return text.includes(ESC);
}

/** The text without any escape sequence. */
export function stripAnsi(text: string): string {
  return hasAnsi(text) ? text.replace(ESCAPE, '') : text;
}

/** The text cut into styled segments; empty runs are left out and runs of the same style joined. */
export function parseAnsi(text: string): AnsiSegment[] {
  if (!hasAnsi(text)) {
    return text === '' ? [] : [{ text }];
  }
  const segments: AnsiSegment[] = [];
  let style: AnsiStyle = {};
  let index = 0;
  const push = (chunk: string) => {
    if (chunk === '') {
      return;
    }
    const last = segments.at(-1);
    if (last != null && sameStyle(last, style)) {
      last.text += chunk;
    } else {
      segments.push({ text: chunk, ...style });
    }
  };
  for (const match of text.matchAll(ESCAPE)) {
    push(text.slice(index, match.index));
    index = match.index + match[0].length;
    if (match[2] === 'm' && match[1] != null) {
      style = applySgr(style, match[1]);
    }
  }
  push(text.slice(index));
  return segments;
}

function sameStyle(a: AnsiStyle, b: AnsiStyle): boolean {
  return (
    a.fg === b.fg &&
    a.bg === b.bg &&
    a.bold === b.bold &&
    a.dim === b.dim &&
    a.italic === b.italic &&
    a.underline === b.underline
  );
}

/** The style after one SGR sequence (its parameters, `0;32;49`). Private sequences (`?…`) change nothing. */
function applySgr(current: AnsiStyle, params: string): AnsiStyle {
  if (/^[<=>?]/.test(params)) {
    return current;
  }
  const style: AnsiStyle = { ...current };
  // `38:5:9` (colons) is one parameter with its own sub-parameters; `38;5;9` spreads over three.
  const codes = params.split(';').map((param) => param.split(':').map((part) => (part === '' ? 0 : Number(part))));
  for (let i = 0; i < codes.length; i++) {
    const [code, ...sub] = codes[i];
    if (code === 38 || code === 48) {
      const extended = sub.length > 0 ? sub : codes.slice(i + 1).map((parts) => parts[0]);
      const { colour, used } = extendedColour(extended);
      if (sub.length === 0) {
        i += used;
      }
      setColour(style, code === 38 ? 'fg' : 'bg', colour);
      continue;
    }
    applyCode(style, code, sub[0]);
  }
  return style;
}

/**
 * An extended colour (`5;n` or `2;r;g;b`) and how many parameters it took.
 * Only the first 16 of the 256 colours have a name; the others read as the default colour.
 */
function extendedColour(params: number[]): { colour: AnsiColour | undefined; used: number } {
  if (params[0] === 5) {
    const index = params[1];
    return { colour: index != null && index >= 0 && index < 16 ? ANSI_COLOURS[index] : undefined, used: 2 };
  }
  if (params[0] === 2) {
    // `2;r;g;b`, or `2:space:r:g:b` in the colon form: a colour we do not render.
    return { colour: undefined, used: 4 };
  }
  return { colour: undefined, used: 0 };
}

function setColour(style: AnsiStyle, key: 'fg' | 'bg', colour: AnsiColour | undefined): void {
  if (colour == null) {
    delete style[key];
  } else {
    style[key] = colour;
  }
}

function setFlag(style: AnsiStyle, key: 'bold' | 'dim' | 'italic' | 'underline', on: boolean): void {
  if (on) {
    style[key] = true;
  } else {
    delete style[key];
  }
}

function applyCode(style: AnsiStyle, code: number, sub: number | undefined): void {
  if (code === 0) {
    for (const key of Object.keys(style) as Array<keyof AnsiStyle>) {
      delete style[key];
    }
  } else if (code === 1) {
    setFlag(style, 'bold', true);
  } else if (code === 2) {
    setFlag(style, 'dim', true);
  } else if (code === 3) {
    setFlag(style, 'italic', true);
  } else if (code === 4) {
    // `4:0` turns the underline off; `4:1` to `4:5` are kinds of underline.
    setFlag(style, 'underline', sub !== 0);
  } else if (code === 22) {
    setFlag(style, 'bold', false);
    setFlag(style, 'dim', false);
  } else if (code === 23) {
    setFlag(style, 'italic', false);
  } else if (code === 24) {
    setFlag(style, 'underline', false);
  } else if (code >= 30 && code <= 37) {
    setColour(style, 'fg', ANSI_COLOURS[code - 30]);
  } else if (code === 39) {
    setColour(style, 'fg', undefined);
  } else if (code >= 40 && code <= 47) {
    setColour(style, 'bg', ANSI_COLOURS[code - 40]);
  } else if (code === 49) {
    setColour(style, 'bg', undefined);
  } else if (code >= 90 && code <= 97) {
    setColour(style, 'fg', ANSI_COLOURS[code - 90 + 8]);
  } else if (code >= 100 && code <= 107) {
    setColour(style, 'bg', ANSI_COLOURS[code - 100 + 8]);
  }
  // Anything else (blink, inverse, strikethrough, fonts…) is read and ignored.
}
