# omp-dsh-minimal

Minimal DeepSeek Harness (`dsh`) anchored-standard adapter for **Oh My Pi** (`omp`).

On a DeepSeek V4 session, request #1 exposes only the official two-tool catalog
(`bash` + `str_replace_editor`) and the official one-line persona. The first
assistant reply or tool call promotes the session back to Pi's full tool set and
reanchors the prompt.

## Target runtime

- **Oh My Pi fork only** — imports `@oh-my-pi/pi-coding-agent`, manifest
  `"omp"`, config dir `~/.omp/agent`.
- **Not** the pi.dev `pi` CLI (that uses `@earendil-works/*` imports, a
  typebox tool schema, and a `"pi"` manifest). For the pi.dev variant see the
  reference repo `pi-dsh-minimal`.

## Behavior

| Phase | Tools exposed | System prompt |
| --- | --- | --- |
| Bootstrap (request #1) | `bash`, `str_replace_editor` | `You are a helpful software engineer assistant.` |
| Promoted (after first reply/tool call) | Pi's full active tool set | official one-liner + remaining Pi prompt (omp identity line dropped) |

Promotion fires on either the first assistant message or the first tool result.
Compaction starts a new bootstrap epoch.

## Install

From this directory:

```sh
omp --extension ./src/index.ts
```

Or link it as a plugin:

```sh
omp plugin link .
```

## Usage

```text
/dsh status   show status
/dsh          same as status
/dsh on       enable the adapter
/dsh off      disable the adapter
```

Status reports only `dsh: on` or `dsh: off`.

## Configuration

`~/.omp/agent/omp-dsh-minimal.json` (override the base dir with
`PI_CODING_AGENT_DIR`):

```json
{
  "enabled": true,
  "modelPatterns": ["deepseek-v4-pro", "deepseek-v4-flash"]
}
```

- `enabled` — master switch (default `true`).
- `modelPatterns` — substring match against `provider` / `id` / `name` after
  normalization (lowercased, separators collapsed). Only matching models run
  the adapter.

A missing file is created with the defaults above; a missing or corrupt file
falls back to the defaults. `/dsh on|off` rewrites this file.

## Development

```sh
npm install
npm run check   # tsc -p tsconfig.json && bun test tests/
```

Tests run under **bun** (not node/tsx): the `@oh-my-pi/*` packages are
bun-only (they import `bun` built-ins). TypeScript is pinned to `^5.9.3`.

## Layout

```text
src/
  index.ts                    wiring: session/event hooks + promotion
  dsh/official.ts             verbatim dsh literals + two-tool schemas
  adapter/                    config, model matching, state, promotion,
                              tool-set, prompt reanchoring, activation,
                              wire payload rewrite
  settings/command.ts         /dsh command
  tools/str-replace-editor.ts the editor tool
tests/                        node:test suites (run with bun)
```
