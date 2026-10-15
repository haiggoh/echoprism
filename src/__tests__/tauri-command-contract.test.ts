/**
 * Tauri command contract test — frontend ↔ backend invoke contract.
 *
 * BOTH surfaces are derived from source at test time (never from a snapshot):
 *
 *   Backend surface 1: every command registered in `tauri::generate_handler![...]`
 *     in src-tauri/src/lib.rs. The registered invoke name is the LAST path segment
 *     (Tauri v2 default: the Rust function name).
 *   Backend surface 2: every `#[command]` fn in src-tauri/src/commands/*.rs with its
 *     parameter names (signatures may span multiple lines).
 *   Frontend surface: every `invoke<T>('NAME', { keys })` literal in
 *     src/hooks/useTauriCommands.ts, with the exporting property path (e.g.
 *     `instanceCommands.add`) so failures point at the exact wrapper entry.
 *
 * Invoke-key semantics (why leading underscores are stripped when matching):
 *   Tauri v2 derives the expected invoke key from the Rust parameter name via
 *   `to_lower_camel_case` (tauri-macros src/command/wrapper.rs, `key.to_lower_camel_case()`),
 *   which splits the name on `_`, DROPS empty segments and camelCases the rest
 *   (convert_case segmentation filters empty words). Therefore `instance_type` ->
 *   `instanceType` AND `_channel_id` -> `channelId`. A `_`-prefixed parameter is
 *   payload-excluded in the sense that the payload is never REQUIRED to carry it
 *   (the check below is one-directional: every key the wrapper sends must be a key
 *   the backend can deserialize); its key is matched in stripped form, exactly as
 *   Tauri deserializes it at runtime. `State<'_, T>` parameters are injected by
 *   Tauri and are never part of the payload.
 */
// @ts-expect-error the repo does not ship @types/node, so tsc cannot resolve node:fs (see file header)
import { readdirSync, readFileSync } from 'node:fs';
// @ts-expect-error the repo does not ship @types/node
import path from 'node:path';
// @ts-expect-error the repo does not ship @types/node
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const LIB_RS = path.join(repoRoot, 'src-tauri', 'src', 'lib.rs');
const COMMANDS_DIR = path.join(repoRoot, 'src-tauri', 'src', 'commands');
const WRAPPER_TS = path.join(repoRoot, 'src', 'hooks', 'useTauriCommands.ts');

/** Minimum parsed commands per surface for the parse itself to be trusted. */
const MIN_COMMAND_COUNT = 40;

interface RustParam {
  readonly name: string;
  /** `State<'_, T>` parameter — injected by Tauri, never part of the invoke payload. */
  readonly injected: boolean;
  /** `_`-prefixed parameter — backend declares it but ignores the value (payload-excluded). */
  readonly underscore: boolean;
}

interface RustCommand {
  readonly name: string;
  readonly file: string;
  readonly params: readonly RustParam[];
  /** False when the parameter list could not be confidently parsed (name-only check). */
  readonly confident: boolean;
}

interface WrapperCall {
  readonly name: string;
  readonly keys: readonly string[];
  readonly exportedAs: string;
}

/** Removes `//` line comments while leaving `://` (URLs) intact. */
function stripLineComment(line: string): string {
  return line.replace(/(^|[^:])\/\/.*$/, '$1');
}

/**
 * Registered invoke names from `tauri::generate_handler![...]` in lib.rs.
 * The invoke name is the last `::` path segment of each entry.
 */
function parseRegisteredCommands(content: string): string[] {
  const block = content.match(/generate_handler!\s*\[([\s\S]*?)\]/);
  if (block === null) {
    throw new Error('could not locate tauri::generate_handler![...] in src-tauri/src/lib.rs');
  }
  const withoutComments = block[1]
    .split('\n')
    .map(stripLineComment)
    .join('\n');
  return withoutComments
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => /^[\w:]+$/.test(entry))
    .map((entry) => entry.split(':').filter(Boolean).pop() ?? entry);
}

/**
 * Extracts the text between the balanced parentheses that open at
 * `lines[fnLineIdx][openParenOffset]` (parameter lists may span multiple lines).
 * Returns null when the parens never balance (unconfident parse).
 */
function extractFnParams(lines: string[], fnLineIdx: number, openParenOffset: number): string | null {
  let depth = 0;
  let collected = '';
  for (let i = fnLineIdx; i < lines.length; i += 1) {
    const line = lines[i];
    for (let c = i === fnLineIdx ? openParenOffset : 0; c < line.length; c += 1) {
      const ch = line[c];
      if (ch === '(') {
        depth += 1;
        if (depth === 1) continue;
      } else if (ch === ')') {
        depth -= 1;
        if (depth === 0) return collected;
      }
      collected += ch;
    }
    collected += ' ';
  }
  return null;
}

/** Splits a Rust parameter list on commas that sit outside `<...>` and `(...)` nesting. */
function splitTopLevel(text: string): string[] {
  const cleaned = text.replace(/->/g, ' ');
  const parts: string[] = [];
  let angle = 0;
  let paren = 0;
  let current = '';
  for (const ch of cleaned) {
    if (ch === '<') angle += 1;
    else if (ch === '>') angle = Math.max(0, angle - 1);
    else if (ch === '(') paren += 1;
    else if (ch === ')') paren = Math.max(0, paren - 1);
    if (ch === ',' && angle === 0 && paren === 0) {
      parts.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  parts.push(current);
  return parts;
}

function parseParams(paramsText: string): { params: RustParam[]; confident: boolean } {
  const params: RustParam[] = [];
  let confident = true;
  for (const part of splitTopLevel(paramsText)) {
    const token = part.trim();
    if (token === '') continue;
    if (/^(?:&\s*)?(?:mut\s+)?self$/.test(token)) continue; // receiver, not a payload param
    const match = token.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*:\s*([\s\S]+)$/);
    if (match === null) {
      confident = false;
      continue;
    }
    const name = match[1];
    const type = match[2].trim();
    params.push({
      name,
      injected: /\bState\b/.test(type),
      underscore: name.startsWith('_'),
    });
  }
  return { params, confident };
}

/**
 * Collects every `#[command]`-attributed fn of one commands file. An attribute
 * line counts when it starts with `#[` and contains `command` (covers
 * `#[command]`, `#[tauri::command]`, `#[command(...)]`).
 */
function parseRustCommandsInFile(filePath: string): RustCommand[] {
  const content = readFileSync(filePath, 'utf8') as string;
  const lines = content.split('\n');
  const commands: RustCommand[] = [];
  for (let i = 0; i < lines.length; i += 1) {
    const attr = lines[i].trim();
    if (!(attr.startsWith('#[') && attr.includes('command'))) continue;
    for (let j = i + 1; j < lines.length; j += 1) {
      const raw = lines[j];
      const trimmed = raw.trim();
      if (trimmed.startsWith('//') || trimmed.startsWith('#[')) continue; // docs or extra attributes
      const fnMatch = raw.match(/\bfn\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(/);
      if (fnMatch === null) continue;
      const openParen = raw.indexOf('(', (fnMatch.index ?? 0) + fnMatch[0].length - 1);
      const paramsText = extractFnParams(lines, j, openParen);
      if (paramsText === null) {
        commands.push({ name: fnMatch[1], file: filePath, params: [], confident: false });
      } else {
        const { params, confident } = parseParams(paramsText);
        commands.push({ name: fnMatch[1], file: filePath, params, confident });
      }
      i = j; // resume scanning after this fn signature
      break;
    }
  }
  return commands;
}

/**
 * The invoke key Tauri v2 expects for a Rust parameter name: split on `_`,
 * drop empty segments, lowerCamelCase the rest (mirrors tauri-macros'
 * `to_lower_camel_case`, so `_channel_id` -> `channelId`).
 */
function rustArgKey(paramName: string): string {
  const parts = paramName.split('_').filter((p) => p.length > 0);
  if (parts.length === 0) return '';
  return parts[0] + parts.slice(1).map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join('');
}

/** Invoke keys the backend can deserialize, from its non-injected parameters. */
function acceptedKeys(command: RustCommand): string[] {
  return command.params
    .filter((p) => !p.injected)
    .map((p) => rustArgKey(p.name))
    .filter((key) => key.length > 0);
}

const INVOKE_RE = /invoke\s*<[\s\S]*?>\s*\(\s*(['"])([\w-]+)\1\s*,?\s*(?:\{([^}]*)\})?/g;

/**
 * Every `invoke<T>('NAME', { keys })` literal in the wrapper hook, with the
 * exporting property path (e.g. `instanceCommands.add`) for failure messages.
 */
function parseWrapperCalls(content: string): WrapperCall[] {
  const calls: WrapperCall[] = [];
  let currentObject = '';
  let currentProp = '';
  for (const rawLine of content.split('\n')) {
    const line = stripLineComment(rawLine);
    const exportMatch = line.match(/^\s*export const (\w+)\s*=\s*\{/);
    if (exportMatch !== null) {
      currentObject = exportMatch[1];
      currentProp = '';
    }
    const propMatch = line.match(/^\s+(\w+)\s*:\s*/);
    if (propMatch !== null && currentObject !== '') {
      currentProp = propMatch[1];
    }
    for (const m of line.matchAll(INVOKE_RE)) {
      const keys = (m[3] ?? '')
        .split(',')
        .map((chunk) => chunk.trim())
        .map((chunk) => chunk.match(/^(?:\.\.\.)?([A-Za-z_$][\w$]*)\s*(?::|$)/)?.[1] ?? '')
        .filter((key) => key !== '');
      calls.push({
        name: m[2],
        keys,
        exportedAs: currentObject !== '' && currentProp !== '' ? `${currentObject}.${currentProp}` : currentObject || '(unknown)',
      });
    }
  }
  return calls;
}

// ---------------------------------------------------------------------------
// Derive both surfaces at test time.
// ---------------------------------------------------------------------------

const registeredCommands = parseRegisteredCommands(readFileSync(LIB_RS, 'utf8') as string);
const registeredSet = new Set(registeredCommands);

const rustCommands = new Map<string, RustCommand>();
for (const entry of readdirSync(COMMANDS_DIR, { withFileTypes: true })) {
  if (!entry.isFile() || !entry.name.endsWith('.rs')) continue;
  for (const command of parseRustCommandsInFile(path.join(COMMANDS_DIR, entry.name))) {
    rustCommands.set(command.name, command);
  }
}

const wrapperCalls = parseWrapperCalls(readFileSync(WRAPPER_TS, 'utf8') as string);
const invokedNames = new Set(wrapperCalls.map((call) => call.name));

// ---------------------------------------------------------------------------

describe('Tauri command contract (useTauriCommands ↔ generate_handler)', () => {
  it('parses both surfaces above the sanity floor', () => {
    const tooLittle: string[] = [];
    if (registeredCommands.length < MIN_COMMAND_COUNT) {
      tooLittle.push(
        `registered commands in generate_handler![]: found ${registeredCommands.length}, need >= ${MIN_COMMAND_COUNT}`,
      );
    }
    if (rustCommands.size < MIN_COMMAND_COUNT) {
      tooLittle.push(
        `#[command] fns in src-tauri/src/commands/*.rs: found ${rustCommands.size}, need >= ${MIN_COMMAND_COUNT}`,
      );
    }
    if (wrapperCalls.length < MIN_COMMAND_COUNT) {
      tooLittle.push(
        `invoke() literals in src/hooks/useTauriCommands.ts: found ${wrapperCalls.length}, need >= ${MIN_COMMAND_COUNT}`,
      );
    }
    if (tooLittle.length > 0) {
      throw new Error(`parser extracted too little — ${tooLittle.join('; ')}`);
    }
  });

  it('every invoke name used by the wrapper is registered and backed by a #[command] fn', () => {
    const problems: string[] = [];
    for (const call of wrapperCalls) {
      if (!registeredSet.has(call.name)) {
        problems.push(
          `invoke name '${call.name}' (wrapper entry ${call.exportedAs}) is NOT registered in ` +
            `tauri::generate_handler![] (src-tauri/src/lib.rs)`,
        );
      }
      if (!rustCommands.has(call.name)) {
        problems.push(
          `invoke name '${call.name}' (wrapper entry ${call.exportedAs}) has no #[command] fn in ` +
            `src-tauri/src/commands/*.rs`,
        );
      }
    }
    expect(problems, problems.join('\n')).toEqual([]);
  });

  it('every wrapper payload key matches a Rust parameter of its command', () => {
    const problems: string[] = [];
    const underscoreOnlyKeys = new Set<string>();
    let fullyVerified = 0;
    let nameOnly = 0;
    let keysChecked = 0;

    for (const call of wrapperCalls) {
      const command = rustCommands.get(call.name);
      if (command === undefined || !command.confident) {
        nameOnly += 1; // params not confidently parsed -> NAME-only check (never silent: counted below)
        continue;
      }
      const accepted = acceptedKeys(command);
      for (const key of call.keys) {
        keysChecked += 1;
        const param = command.params.find((p) => !p.injected && rustArgKey(p.name) === key);
        if (param === undefined) {
          const rawParams = command.params.length > 0 ? command.params.map((p) => p.name).join(', ') : '(none parsed)';
          problems.push(
            `payload key mismatch for command '${call.name}' (wrapper entry ${call.exportedAs}): wrapper sends ` +
              `'${key}' but Rust fn ${command.name}(${rawParams}) in ${command.file} exposes invoke keys ` +
              `[${accepted.join(', ')}] (State parameters are injected and need no key)`,
          );
        } else if (param.underscore) {
          underscoreOnlyKeys.add(`${call.name}: ${key}`);
        }
      }
      fullyVerified += 1;
    }

    console.log(
      `[tauri-command-contract] Param verification: ${fullyVerified}/${wrapperCalls.length} wrapper calls fully ` +
        `verified against parsed Rust signatures (${keysChecked} payload keys checked); ` +
        `${nameOnly} name-only (Rust params not confidently parsed)`,
    );
    if (underscoreOnlyKeys.size > 0) {
      console.log(
        `[tauri-command-contract] ${underscoreOnlyKeys.size} payload keys map to underscore-prefixed Rust params ` +
          `(backend declares them but ignores the value; matched in Tauri's stripped camelCase form): ` +
          `${[...underscoreOnlyKeys].join(', ')}`,
      );
    }

    expect(problems, problems.join('\n')).toEqual([]);
  });

  it('lists registered commands the wrapper never references (informational, not failing)', () => {
    const unreferenced = registeredCommands.filter((name) => !invokedNames.has(name));
    if (unreferenced.length > 0) {
      console.warn(
        `[tauri-command-contract] Registered commands never invoked by src/hooks/useTauriCommands.ts ` +
          `(${unreferenced.length}): ${unreferenced.join(', ')}`,
      );
    } else {
      console.log('[tauri-command-contract] No unreferenced registered commands (wrapper covers all of generate_handler!)');
    }
  });
});
