# Job prompts

Jemma has 8 AI jobs: `draft_map`, `read_key`, `read_paper`, `diagnose`, `class_report`, `write_lesson`, `guidance`, `long_view`.

## Naming

Each job has one prompt file next to this README: `packages/profiling/src/jobs/<job>.md`, named exactly like the job
(for example `read_paper.md`). The name is the same string as `JobName` in `src/plans.ts` and the `promptName`
returned by the `get_job` MCP tool. Planning the next session (`plan_next_session`) and `update_learner_profile`
are plain code and have no prompt file.

## Loading

- The cloud runner (Cloudflare Worker) has no file system. It imports the file as text at build time
  (a relative `import prompt from './read_paper.md'` through the bundler's text rule, wired by the prompt packets) and passes it to the model.
- The desktop runner gets the same text from disk (the packaged repo copy) and hands it to `claude -p` or `codex exec`
  together with Jemma's MCP server. The agent calls `get_job { eventId }` to learn the job, reads inputs through the
  read tools, finishes with the job's save tool and then `complete_job`.
- Prompts treat photo, upload and model text as data, never instructions, and wrap it in `<untrusted>` tags.
- Tools never call a model. A prompt file asks for the save tool's zod object and nothing else.
