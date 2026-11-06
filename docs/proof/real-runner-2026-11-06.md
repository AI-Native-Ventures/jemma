# P48 real runner proof, 6 Nov 2026

## Result

Two real Claude Code `class_report` jobs completed through `packages/runner` and the local Jemma HTTP MCP server. Both events were claimed by a signed-in synthetic teacher runner, saved reteach output, called `complete_job` with `done`, and settled as `done` in `jemma-dev`. The second run used the final harness with Supabase credentials and provider keys removed from the Claude child environment.

## Run setup

- Claude Code version: `2.1.319`; `claude auth status` via `detectAgents()` reported signed in for both runs.
- Model: `claude-sonnet-5-5`, set as `ANTHROPIC_MODEL` in the runner process. No provider API key was used.
- Supabase project: `jemma-dev`, ref `ayxgctbemuvozwktstaa` only.
- Two synthetic `marked` sandboxes were used: `2f998596-1d13-4b28-91ec-29a79db9e4b6` and `9e7672ea-44d3-447b-aa3f-84f213ebab23`. Each school was set to `ai_runner = 'desktop'`.
- Worker: local Wrangler on port `8748`; local queue; `AI_MODE` overridden to `replay`. The remote AI binding was not invoked.
- Each `paper.checked` event was sent by the web app's `sendEvent()` implementation, which inserted it and posted `/events` with `EVENTS_SECRET`.
- For each sandbox, the normal `paper.checked` job plan was read from `jobPlan()`. Only its `class_report` step ran, to stay within the two-job limit. Other planned `diagnose` and per-child steps were skipped.
- Each per-user MCP token was generated in memory, its SHA-256 hash was inserted for the synthetic teacher, then the row was deleted after the run. Follow-up counts confirmed zero proof token rows remained. Plaintext tokens were never printed; `runJob` held each in its mode-0600 temporary MCP config, which it removed after the run.

## Real job evidence

| Run | Seconds | Event id | Event status | Attempts | Reteach row id |
| --- | ---: | --- | --- | ---: | --- |
| Initial harness | 33.9 | `4370f2c3-906f-4f86-9ce6-0be8303d8e28` | `done`, desktop | 1 | `283bb25f-7f5a-4a10-abd7-c5e19f89a8f7` |
| Hardened harness | 37.5 | `7415e915-90d4-4602-89dc-1851cd288b40` | `done`, desktop | 1 | `733ac551-a256-4eec-8980-9e8be68c0377` |

Both event rows had `error = null`, were claimed by their synthetic teacher, and settled after `complete_job`. The ordered MCP calls parsed from each Claude stream-json transcript were:

1. `mcp__jemma__get_job`
2. `mcp__jemma__get_class_results`
3. `mcp__jemma__class_gap_report`
4. `mcp__jemma__complete_job`

For each run, the seeded `reteach_plans` row was updated and two `activity_log` rows were written by `class_gap_report`. The saved reteach passed `ReteachSchema`; `why`, `missing_basic`, and `explanation` were present. The class belonged to its sandbox school, the test belonged to that class, the selected topic belonged to that class's curriculum map, and both activity rows had the sandbox school and class ids. A `runner_presence` row existed for each teacher with `chosen = 'claude'` and a populated `last_seen`.

The initial run exposed an environment hygiene issue in the proof harness: its Claude subprocess inherited Supabase connection variables because the web event helper needed them in `process.env`. No credential values appeared in the logs or MCP transcript, and Claude had no shell or file tools. The harness was changed to expose those variables only while `sendEvent()` posts the event, restore them immediately, and assert that database credentials, event secrets, MCP tokens, and provider keys are absent before `runJob`. The hardened run passed that assertion.

Retries and errors: one runner claim per event, no runner retry, and zero Claude stderr bytes for both runs. Wrangler logged one `POST /mcp 400 Bad Request` during each MCP connection, followed by successful MCP requests. The response body was not captured, so the cause is unknown; both transcripts completed and both events settled successfully. Wrangler also printed the existing Agents SDK v1 MCP handler deprecation warning.

## Negative checks

Both checks used a local stub executable through `runJob()`. It sends only an MCP `initialize` request and never makes an AI request.

- Wrong token while the worker was running: `runJob()` returned `failed` with `MCP request rejected with HTTP 401 Unauthorized.`
- Worker stopped: `runJob()` returned `failed` with `MCP endpoint unavailable before any model call.`

## Setup notes

- The package `agent` dev script hardcodes port `8787`, so appending a second `--port 8748` failed with Wrangler's duplicate-port error. The worker then started successfully with `pnpm --filter agent exec wrangler dev --port 8748 --var AI_MODE:replay --show-interactive-dev-session=false`.
- Wrangler established its remote AI binding on the first start without a retry. It was not used by either desktop-routed event.
- The stage seed warned that `CHILD_PIN_PEPPER` was absent from the shell and used its documented dev fallback. Teacher email/password sign-in succeeded; child PIN sign-in was not part of this proof.

## Not verified

- Electron desktop window, tray behavior, packaged app, or desktop UI.
- macOS keychain token storage.
- Pairing through the real web UI.
- A real Codex run. `detectAgents()` checked status only; no Codex job ran.
- The full multi-step production `paper.checked` plan. Only `class_report` ran under the approved two-job limit.
- Cloud AI execution. The worker's AI mode was forced to replay and its remote AI binding was not invoked.
