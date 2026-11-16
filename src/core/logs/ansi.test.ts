import { describe, expect, it } from 'vitest';
import { hasAnsi, parseAnsi, stripAnsi } from './ansi.js';

const e = '\x1b';

describe('parseAnsi', () => {
  it('leaves a line without escape codes as it is', () => {
    expect(hasAnsi('Response from GET / is 404')).toBe(false);
    expect(parseAnsi('Response from GET / is 404')).toEqual([{ text: 'Response from GET / is 404' }]);
    expect(parseAnsi('')).toEqual([]);
  });

  it('reads the deployer lines, colour and default alike', () => {
    expect(parseAnsi(`${e}[0;34;49mBuild succeeded in 0 minutes and 10 seconds${e}[0m`)).toEqual([
      { text: 'Build succeeded in 0 minutes and 10 seconds', fg: 'blue' },
    ]);
    expect(parseAnsi(`${e}[0;32;49mSuccessfully deployed in 0 minutes and 48 seconds${e}[0m`)).toEqual([
      { text: 'Successfully deployed in 0 minutes and 48 seconds', fg: 'green' },
    ]);
    expect(parseAnsi(`${e}[0;39;49mNo build cache archive was created, not uploading anything${e}[0m`)).toEqual([
      { text: 'No build cache archive was created, not uploading anything' },
    ]);
  });

  it('reads the levels of a logback line', () => {
    expect(parseAnsi(`2026-11-16 14:50:46,766 [${e}[31merror${e}[0m] exporter - Name or service not known`)).toEqual([
      { text: '2026-11-16 14:50:46,766 [' },
      { text: 'error', fg: 'red' },
      { text: '] exporter - Name or service not known' },
    ]);
    expect(parseAnsi(`[${e}[33mwarn${e}[0m] vaults`)[1]).toEqual({ text: 'warn', fg: 'yellow' });
    expect(parseAnsi(`[${e}[37minfo${e}[0m] env`)[1]).toEqual({ text: 'info', fg: 'white' });
  });

  it('reads dim and italic, as Rust tracing writes them, and joins runs of one style', () => {
    const line = `${e}[2m2026-11-16T14:47:49Z${e}[0m ${e}[32m INFO${e}[0m ${e}[2muploader${e}[0m${e}[2m:${e}[0m Uploaded ${e}[3mpart${e}[0m${e}[2m=${e}[0m1`;
    expect(parseAnsi(line)).toEqual([
      { text: '2026-11-16T14:47:49Z', dim: true },
      { text: ' ' },
      { text: ' INFO', fg: 'green' },
      { text: ' ' },
      { text: 'uploader:', dim: true },
      { text: ' Uploaded ' },
      { text: 'part', italic: true },
      { text: '=', dim: true },
      { text: '1' },
    ]);
  });

  it('combines and undoes styles one by one', () => {
    expect(parseAnsi(`${e}[1;4;31;42mA${e}[22mB${e}[24mC${e}[39mD${e}[49mE`)).toEqual([
      { text: 'A', fg: 'red', bg: 'green', bold: true, underline: true },
      { text: 'B', fg: 'red', bg: 'green', underline: true },
      { text: 'C', fg: 'red', bg: 'green' },
      { text: 'D', bg: 'green' },
      { text: 'E' },
    ]);
    expect(parseAnsi(`${e}[1;2mA${e}[22mB`)).toEqual([{ text: 'A', bold: true, dim: true }, { text: 'B' }]);
    expect(parseAnsi(`${e}[3mA${e}[23mB`)).toEqual([{ text: 'A', italic: true }, { text: 'B' }]);
    expect(parseAnsi(`${e}[4:3mA${e}[4:0mB`)).toEqual([{ text: 'A', underline: true }, { text: 'B' }]);
    expect(parseAnsi(`${e}[31mA${e}[mB`)).toEqual([{ text: 'A', fg: 'red' }, { text: 'B' }]);
  });

  it('reads bright colours, foreground and background', () => {
    expect(parseAnsi(`${e}[91mA${e}[97;104mB`)).toEqual([
      { text: 'A', fg: 'bright-red' },
      { text: 'B', fg: 'bright-white', bg: 'bright-blue' },
    ]);
  });

  it('names the first 16 of the 256 colours and reads the others as the default colour', () => {
    expect(parseAnsi(`${e}[38;5;9mA${e}[38;5;1;48;5;12mB${e}[38:5:2mC`)).toEqual([
      { text: 'A', fg: 'bright-red' },
      { text: 'B', fg: 'red', bg: 'bright-blue' },
      { text: 'C', fg: 'green', bg: 'bright-blue' },
    ]);
    // The parameters of the colour are not read as codes of their own (1 would be bold, 4 underline).
    expect(parseAnsi(`${e}[31mA${e}[38;5;214mB${e}[38;2;255;1;4mC${e}[1mD`)).toEqual([
      { text: 'A', fg: 'red' },
      { text: 'BC' },
      { text: 'D', bold: true },
    ]);
    expect(parseAnsi(`${e}[38:2::255:0:0;1mA`)).toEqual([{ text: 'A', bold: true }]);
  });

  it('removes the other escape sequences and keeps their text', () => {
    expect(parseAnsi(`Downloading 40%${e}[K`)).toEqual([{ text: 'Downloading 40%' }]);
    expect(parseAnsi(`${e}[2J${e}[1;1HDone`)).toEqual([{ text: 'Done' }]);
    expect(parseAnsi(`${e}[?25lhidden cursor${e}[?25h`)).toEqual([{ text: 'hidden cursor' }]);
    expect(parseAnsi(`see ${e}]8;;https://example.com${e}\\the docs${e}]8;;${e}\\ here`)).toEqual([
      { text: 'see the docs here' },
    ]);
    expect(parseAnsi(`${e}]0;title${'\x07'}text`)).toEqual([{ text: 'text' }]);
    expect(parseAnsi(`${e}(Btext`)).toEqual([{ text: 'text' }]);
  });

  it('drops a lone or unfinished escape', () => {
    expect(parseAnsi(`cut ${e}[31`)).toEqual([{ text: 'cut ' }]);
    expect(parseAnsi(`cut ${e}`)).toEqual([{ text: 'cut ' }]);
    expect(parseAnsi(`${e}[31mred, never reset`)).toEqual([{ text: 'red, never reset', fg: 'red' }]);
  });

  it('starts every line from a clean state', () => {
    parseAnsi(`${e}[1;31mnot reset`);
    expect(parseAnsi('next line')).toEqual([{ text: 'next line' }]);
    expect(parseAnsi(`${e}[0mnext line`)).toEqual([{ text: 'next line' }]);
  });
});

describe('stripAnsi', () => {
  it('keeps the text alone', () => {
    expect(stripAnsi(`2026-11-16 [${e}[31merror${e}[0m] exporter${e}[K`)).toBe('2026-11-16 [error] exporter');
    expect(stripAnsi('plain')).toBe('plain');
    expect(stripAnsi(`a${e}]8;;https://example.com${e}\\b${e}]8;;${e}\\c${e}[38;5`)).toBe('abc');
  });
});
