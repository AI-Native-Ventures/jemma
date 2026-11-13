# Jemma: text description

Sub-theme: Longitudinal strength tracking. Repository: https://github.com/AI-Native-Ventures/jemma. Live demo: https://jemma-web.horizonsystems.workers.dev/demo. Licence: MIT.

Jemma follows one learner across years, not one term, so a pattern that is invisible one term at a time can reach the family early.

**School and workflow.** The school is made up: Hillview Primary, modelled on a South African public primary school, with four mathematics classes. The demo follows the Grade 6 class. The teacher photographs a class test. Jemma marks it and updates each learner's record. The teacher checks and shares the results. Over the years the Long view shows what held for three terms or more, so the teacher can raise it with the family. The past years are synthetic and messy on purpose.

**Rules it keeps.** A profile, not a label. Every claim cites the quiz, test or note it came from. The teacher goes first: a pattern reaches a parent only after the teacher checks it, talks to the guardian and taps "We have talked". A learner is never ranked, and never sees the Long view. Code finds the patterns and decides every mark. The model only words them.

**How it is built.** Jemma has its own MCP server with 25 tools, most of them saving results: a profile update, a lesson, a Long view draft. It borrows the official MCP filesystem server: sandboxed, allow-listed file access with path-escape protection is security code we should not write and audit ourselves. One full task runs on an open-weights model: goose, an open-source agent, drives Nemotron 3.5 Super VL, and all 11 eval tasks passed 3 of 3 live runs, judged by code. Claude Code runs alongside. Every tool call is logged with input and output, and every approval carries a name.

**Limits.** Synthetic data only, Mathematics only, English only. No teacher and no real learner has used it. Curriculum PDFs are read by the cloud model only.
