# Proof note: one task on a model on this machine, 15 November 2026

Status: **not run yet.** The code is written and its unit tests use a fake goose. This note holds the steps and the empty result lines. Every line marked "to be filled by the coordinator" stays empty until the run has been done and read back.

What this run is for: the compliance row "Learner records ... often cannot leave the country" says we never ran an open-weights model on local hardware. This run does that for the model: goose drives a Gemma 4 model served by Ollama on the same Mac, and nothing in the run may point at a cloud model.

What it can show: the model path stays on this Mac. Goose talks to Ollama at `127.0.0.1`, there is no OpenRouter key in the process, no cloud tag is accepted, and there is no fallback to another model.

What it cannot show on its own: the records themselves. The task reads a made-up school from the database the run points at. On the local stack that database is on this Mac too. On the deployed preview project (`--allow-preview`) the made-up school is held by a hosted database, so only the model path is local. Say which one the run used in the result lines below.

## 1. Check the machine and the tools

```bash
ollama --version      # the client version; a warning that no server is running is fine at this point
goose --version
```

The machine in the plan: Apple M1 Max, 32 GB.

## 2. Pull the model

```bash
ollama pull gemma4:26b
```

`gemma4:26b` is the default tag. The Ollama library lists it at 16 to 19 GB, with 256K context and tool calling (goose needs tool calling). The pull downloads public weights and sends no record. If the Mac runs out of memory or is too slow, try `gemma4:12b` (7.7 to 8.0 GB) with `--model gemma4:12b`. Do not use a tag that ends in `cloud`: it runs on Ollama's servers, and the run refuses it.

## 3. Start Ollama

In its own terminal, left running:

```bash
OLLAMA_CONTEXT_LENGTH=32768 ollama serve
```

Goose's documentation says Ollama's default context is 4096 tokens and that a small context can make goose ignore its extensions. Jemma's tool list and job prompt may not fit in that, so the server is started with 32768 (not yet tried on this Mac). Leave `OLLAMA_HOST` unset: the default is `127.0.0.1:11434`, and the evals refuse any address that is not this computer. Check it answers and has the tag:

```bash
curl -s http://127.0.0.1:11434/api/tags
```

## 4. Check the plumbing without a model (optional)

```bash
pnpm evals --rehearse done --task class-report --runs 1 --provider ollama
```

A fake goose runs instead of a model. Nothing is counted and the run folder starts with `rehearsal-`. Most checks fail on purpose. Add `--allow-preview` when the database in `.env.local` is the preview project.

## 5. The run

```bash
pnpm evals --task class-report --runs 3 --provider ollama --run-id local-2026-11-15 --no-report
```

Add `--model <tag>` for another tag, and `--allow-preview` when the database in `.env.local` is the preview project. The cap for local runs is 6 and a job gets 30 minutes. No OpenRouter key is needed; if the shell holds one, the command takes it out of its own process.

To see where goose talks while a run is going, in another terminal:

```bash
lsof -nP -iTCP -sTCP:ESTABLISHED | grep -E 'goose|ollama'
```

Expected: connections to `127.0.0.1:11434` (Ollama) and `127.0.0.1:8756` (the agent worker) only. The run switches goose's anonymous usage data off with `GOOSE_TELEMETRY_OFF=1`, but that variable name was taken from third-party copies of goose's guide and not checked against goose 1.45.0: if the list shows another address, write it down and name it. The first run may also fetch the pinned file server package (`@modelcontextprotocol/server-filesystem`) from npm, which carries no record.

## 6. Where the results land

- `evals/results/local-2026-11-15/class-report-<n>.json`: the checks, the event, the attempts and `provider`, `model`, `host`, `port`, `noCloudModelCalled`, `cloudEvidence`.
- `evals/results/local-2026-11-15/class-report-<n>.jsonl`: goose's own stream, with the token and local paths taken out.
- `evals/results/ledger.jsonl`: one line per run with `provider: "ollama"`. These never count against the 45 free-model runs.
- `pnpm evals:report` adds the section "On this machine" to `EVALS.md` (task, model, pass or fail, minutes). The main table does not change.

## 7. Result lines

| Line | Value |
| --- | --- |
| Date and time of the run | to be filled by the coordinator |
| Machine, memory | to be filled by the coordinator |
| `ollama --version` and `goose --version` | to be filled by the coordinator |
| Model tag, size on disk (`ollama list`) | to be filled by the coordinator |
| Context length the server was started with | to be filled by the coordinator |
| Database used (local stack or preview project) | to be filled by the coordinator |
| Exact command run | to be filled by the coordinator |
| Run folder | to be filled by the coordinator |
| Run 1: pass or fail, minutes, `noCloudModelCalled` | to be filled by the coordinator |
| Run 2: pass or fail, minutes, `noCloudModelCalled` | to be filled by the coordinator |
| Run 3: pass or fail, minutes, `noCloudModelCalled` | to be filled by the coordinator |
| Ledger lines added (`provider: "ollama"`) | to be filled by the coordinator |
| What the connection list showed during a run | to be filled by the coordinator |
| Failures, and what the saved notes said | to be filled by the coordinator |
| What this run did not show | to be filled by the coordinator |

When the lines are filled, the two rows of `docs/compliance.md` that name this note ("One full task on an open-weights model" and "Learner records ...") get their status and limit rewritten from what the lines say, and the line in `ARCHITECTURE.md` about running the same path on a school's own machine stays only if the run passed.
