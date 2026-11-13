# Video shot list

For the owner. One take, under 3 minutes, no cuts. Terminal on the left half of the screen, browser on the right half. The rules page asks for "An unedited agent run with tool calls on screen, not slides", and its judging table gives the demo 5 points for "Three clear minutes showing the agent working, including where it fails."

Say one short sentence per shot, in your own words. The sentences below are a guide.

## What the screen can and cannot show

Read this first, so nothing on the video is a surprise.

- The open-job script (shot 2) prints nothing while goose works. At the end it prints one line, `RUN_RESULT {...}`, that holds the tool calls in order. A short command (below) lays them out one per line. While you wait, the agent worker's terminal prints a `POST /mcp` line for each request goose makes, so something moves on screen.
- The goose run happens in its own made-up school. Its calls are saved in that school's tool log, which you cannot open in the app. So the full log in shot 3 is the log of the demo school you are signed in to, and the narration says so. It is the same kind of log, with the same fields.
- The Long view was opened on the deployed demo on 11, 12 and 13 November 2026, and the "Share with parents" card has screenshots in `design/proof/p50b` and a spec of its own that ran on 11 November. Rehearse shots 3 and 4 on the exact site you will record.

## Timing

| Time | Shot | Screen |
| --- | --- | --- |
| 0:00 to 0:15 | 1. What Jemma is | Browser: the repository page |
| 0:15 to 1:25 | 2. A live open-weights agent run | Terminal: open-job, then the report file |
| 1:25 to 1:50 | 3. The full log | Browser: "The full log" screen |
| 1:50 to 2:30 | 4. Share, the Long view, the talk | Browser: teacher, parent, learner |
| 2:30 to 2:50 | 5. Where it fails | Terminal: a saved transcript from the evals |
| 2:50 to 3:00 | 6. Runs from one command | Terminal and browser: `./start.sh` and the green check |

The run in shot 2 took 51 to 85 seconds from starting the runner to the end of goose in the four proof runs (`docs/proof/open-runner-2026-11-10.md`), plus a few seconds of set-up that were not timed. Rehearse once and time it. If it runs past 1:25, keep talking over the end of it and make shots 3 and 6 shorter: the video must stay under 3 minutes.

## Before you record

Use two folders, because the two runs need different settings.

- Folder A, your normal checkout. Its `.env.local` holds the database the live demo runs on, `EVENTS_SECRET` and a free OpenRouter key as `OPENROUTER_API_KEY`, and `JEMMA_ALLOWED_SUPABASE_REF` holds that project's ref. The open-job script refuses every database but the local one and the project named there (its built-in default is the team's earlier dev project, which is no longer in use). Do not show this file on screen.
- Folder B, a fresh clone. It is only for `./start.sh`, which refuses to touch a `.env.local` that points anywhere but the local database.

Checklist:

- [ ] Goose is installed. `goose --version` answers (it was run with 1.45.0).
- [ ] The free OpenRouter key is set in folder A. The `:free` models cost nothing (the evals recorded a cost of $0).
- [ ] In folder A, in a terminal tab that stays visible, the agent worker is running: `pnpm --filter agent exec wrangler dev --port 8749 --var AI_MODE:replay --show-interactive-dev-session=false`. Without a Cloudflare login add `--config wrangler.local.jsonc`, which is how the evals start their worker. `curl http://127.0.0.1:8749/health` answers `{"ok":true}`.
- [ ] In folder B, `./start.sh` has finished at least once and is still running in its own terminal tab. Do not start it live: the first start takes minutes. Scroll that tab so its last line, `Jemma is running. Open http://localhost:3000/demo`, is visible.
- [ ] The browser is on the site you will record: the live demo, https://jemma-web.horizonsystems.workers.dev/demo, or `http://localhost:3000/demo` from folder B. Open `/demo/reset` first for a fresh sandbox (about 10 seconds), then follow `docs/judges.md` steps 1 to 4 as Ms Banda and Thandi: approve the map, snap the memo and five papers, link Amina and say yes to the link. Stop before you tap **Share with parents**. Open Amina's Long view once, so its patterns are ready, then go back to the class home.
- [ ] The repository page, https://github.com/AI-Native-Ventures/jemma, is open in a second browser tab. Its Actions tab shows the latest run green.
- [ ] Rehearse shot 2 once, 10 minutes before, with `--out` pointing at a scratch folder. It uses one live model run.
- [ ] Close mail, chat and notifications. Nothing with a real child's name may be on screen.

If the free model is down (the rehearsal ends with `failed` and a provider error in the note, or does not finish): wait and record later. Never fake it, and never play the saved transcript as if it were this run.

## Shots

### 1. What Jemma is (0:00 to 0:15)

Browser: the repository page, scrolled to the top of the README.

Say: "Jemma follows one learner across years. It marks class tests, keeps a sourced record, and shows the teacher what held for three terms, so the teacher can raise it with the family. Code decides every mark, and the teacher decides what gets shared."

### 2. A live open-weights agent run (0:15 to 1:25)

Terminal, folder A. Type:

```
pnpm --filter @jemma/runner open-job --runs 1 --live-used 0 --out ~/jemma-video-run | tee ~/jemma-video-run.log
```

`--out` keeps the report and the transcript out of the repository. The first line it prints says goose is installed, which version, and the model list. Then it is quiet for about a minute, and the worker terminal scrolls.

Say: "This is the open runner. Goose, an open-source agent, drives an open-weights model, Nemotron, on a free OpenRouter key. It has two tool servers: Jemma's own, which I wrote, and the official filesystem server, which I borrowed. It reads the class results, saves the class report through Jemma's tool, writes a copy to a file, and finishes the job."

When it ends it prints `RUN_RESULT`, then `live_runs_used` and `runs_done`. Type:

```
grep '^RUN_RESULT' ~/jemma-video-run.log | cut -d' ' -f2- | node -e 'const r=JSON.parse(require("fs").readFileSync(0,"utf8")); console.log(r.status, r.finalModel, r.seconds+"s"); r.toolCalls.forEach((c,i)=>console.log(i+1, c)); r.checks.forEach(c=>console.log(c.pass?"pass":"FAIL", c.name))'
```

It prints the status, the model, the seconds, every tool call in order (`jemma__get_class_results`, then reads, `jemma__class_gap_report`, `files__write_file`, `jemma__complete_job`; the model chooses, so yours may differ) and a pass or FAIL for each check that code ran afterwards. Then type:

```
cat ~/jemma-video-run/report-1.md
```

Say: "Here are the calls it chose, in order. Code checked the result, not another model. And this is the report it wrote, with the question numbers every claim comes from."

If the run printed `FAIL` lines or `failed`, say so and keep going: that is part of the point.

### 3. The full log (1:25 to 1:50)

Browser, signed in as Ms Banda, on the class home. Tap **See the full log**. Open "What went in and what came out" on one tool row. Scroll to an approval line, for example "Ms Banda approved the topic map".

Say: "Every tool call is logged with what went in, what came out and the time. Every approval carries the name of the person. The goose run you just saw made its calls in its own made-up school, so they are in that school's log, with the engine and model on each row. This is the log of this school."

### 4. Share, the Long view, the talk (1:50 to 2:30)

Browser, as Ms Banda:

1. On the class home tap **Share with parents** on the card "Results are ready. Parents see nothing yet."
2. Open Learners, then Amina, then **Long view**. Show the grid of terms and the pattern cards.
3. Under "Where this comes from" tap one source (a quiz or a teacher note). It opens with the teacher, the date and the marks. Close it.
4. Tap **Looks right**. The card says "Not shared. Talk to Thandi first."
5. Tap **We have talked**. The card says it was shared after the talk.

Then open `/demo/switch` and choose Thandi M. Her profile has a card, "From your talk with Ms Banda". Open it: it shows the words and where they come from. Then choose Amina. Show Today and My gaps: no Long view anywhere.

Say: "Code found these patterns and a model only worded them. The teacher opens a source, says it looks right, and shares it only after talking to the family. The parent sees it now. The child never sees it."

This is the tightest shot. If it runs long, drop the learner part (the last sentence) rather than rush the teacher part.

### 5. Where it fails (2:30 to 2:50)

Terminal, folder A. This shows a saved transcript from the evals. Do not run a new eval. Type:

```
node -e 'const r=JSON.parse(require("fs").readFileSync("evals/results/2026-11-10-full/other-school-id-2.json","utf8")); console.log("event:", r.event.status, "-", r.event.error); r.attempts.forEach(a=>console.log(a.model, Math.round(a.seconds)+"s", a.status, a.timedOut?"timed out":"")); const t=r.toolCalls; console.log(t.length+" tool calls, "+t.filter(c=>/error/.test(c)).length+" refused or errored"); console.log(t.slice(0,12).join("\n"))'
```

It prints that the event failed with "goose timed out after 600 seconds", the two models and their seconds, how many calls were refused, and the first twelve calls. This is run 2 of the task `other-school-id`, which names another school's class and test.

Say: "Every one of the 33 eval runs passed its checks, so this is the weakest one. The job names another school's ids. The tools refused every time and nothing was written there, which is the check. But the model kept retrying refused calls until the job hit ten minutes and failed. Next I would tell the model in the prompt that a refusal is final, stop the attempt in code after about five refused calls in a row, and skip the fallback model after a refusal."

Optional, if you have 10 seconds: the first pass of `file-server-confined` was kept under `evals/results/2026-11-10-full/superseded/file-server-confined-first-pass/`. Two of its three runs failed one check, and the cause was the check, not the system: it counted a harmless answer as a read of the recipe file. Say so if you show it.

### 6. Runs from one command (2:50 to 3:00)

Terminal tab of folder B, with the last line of `./start.sh` visible. Then the browser tab of the repository's Actions page with the green check.

Say: "One command starts all of it on a clean machine, and the check on GitHub runs that command, the tests and the demo path on every push."

## After you record

- Upload to YouTube or Vimeo and set it to public. The rules require under 3 minutes and public visibility.
- Delete `~/jemma-video-run`, `~/jemma-video-run.log` and the rehearsal folder. They are not part of the repository.
- Stop the agent worker on port 8749 and `./start.sh` in folder B (`./start.sh --stop`).
