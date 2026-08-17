# omp-dsh-minimal

This is the Minimal **DeepSeek Harness** anchored-standard adapter for **Oh My Pi**. On a DeepSeek V4 session, Request #1 exposes only the official two-tool catalog (`bash` and `str_replace_editor`) along with the official one-line persona. The first subsequent assistant reply or tool call then restores the session to Pi's full tool set and re-anchors the prompt.

## Request lifecycle

```mermaid
sequenceDiagram
    participant U as User
    participant PI as Oh My Pi
    participant A as Adapter
    participant DS as DeepSeek

    U->>PI: session_start
    PI->>A: refresh()
    A->>A: load config, reset state
    U->>PI: first message
    PI->>A: before_provider_request
    A->>DS: MINIMAL_PROMPT + bash, str_replace_editor
    DS-->>PI: first assistant reply / tool call
    PI->>A: message_end / tool_call
    A->>A: promoted = true
    PI->>A: before_provider_request
    A->>DS: reanchored persona + full Pi tool set
    Note over A: session_compact starts a new bootstrap epoch
```

| Phase | Tools exposed | System prompt |
| --- | --- | --- |
| Bootstrap (request #1) | bash, str_replace_editor | You are a helpful software engineer assistant. |
| Promoted (after first reply/tool call) | Pi's full active tool set | official one-liner + remaining Pi prompt |

## Install

```sh
omp plugin install git:https://github.com/kanren3/omp-dsh-minimal.git
```

## Usage

```text
/dsh status   show status
/dsh          same as status
/dsh on       enable the adapter
/dsh off      disable the adapter
```

Status reports the master switch plus whether this session has been anchored:

```text
dsh: on · session not anchored
dsh: on · anchored, awaiting first reply
dsh: on · anchored → promoted
```

The anchored state persists as a `dsh-anchored` custom entry in the session
file, so `/dsh status` still reports it after `/resume`.

## Configuration

`~/.omp/agent/omp-dsh-minimal.json` (override the base dir with `PI_CODING_AGENT_DIR`):

```json
{
  "enabled": true,
  "modelPatterns": ["deepseek-v4-pro", "deepseek-v4-flash"]
}
```

- `enabled` — master switch (default `true`).
- `modelPatterns` — substring match against `provider` / `id` / `name` after normalization (lowercased, separators collapsed). Only matching models run the adapter.

## References

- [pi-dsh-minimal](https://github.com/Averyyy/pi-dsh-minimal) — Pi adapter for official DeepSeek Harness minimal mode.