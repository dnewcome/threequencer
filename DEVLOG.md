# Devlog — How This Works

This document explains the devlog tooling for this project and captures the thinking behind it. It's a living document — the philosophy is still being worked out.

---

## Tooling

### Automatic snapshots on commit

Add `[snap]` to any commit message and a devlog entry is created automatically:

```
git commit -m "add scale mode selector [snap]"
```

What happens:
1. `.git/hooks/post-commit` detects `[snap]`
2. `scripts/devsnap.sh` runs
3. If the dev server is running on port 9001, Chrome headless takes a screenshot
4. A markdown entry lands in `devlog/YYYY-MM-DD-HHmmss-slug.md`
5. The screenshot lands in `devlog/assets/`

The entry has placeholder sections — "What happened" and "Tweet draft" — that you fill in manually or via `/devsnap`.

### Deliberate entries

From inside Claude Code:

```
/devsnap
/devsnap "optional note or question you're thinking through"
```

This uses `--window` mode: ImageMagick's `import` grabs the live browser window via `xdotool`, capturing actual WebGL output. Claude then writes the narrative and tweet draft.

Philosophical or decision-oriented notes are handled differently — the entry becomes a design journal post and the tweet invites conversation rather than announcing a ship.

### Preview

```
bash scripts/devlog-preview.sh --open
```

Generates `devlog/preview.html` — a single self-contained file with all entries, newest first, images included by relative path. Opens in the browser as a `file://` URL, no server needed. Regenerate it any time; it's gitignored.

### Publish (placeholder)

`scripts/devpublish.sh <entry.md>` exists as a stub for sending an entry to a publication target. Currently wired to dnuke.com but this is not settled — see philosophy section below.

---

## Project Identity

Each project has a `.project.toml` at its root:

```toml
id = "38d4a391-00f3-41de-814c-4f9813d48b5b"
slug = "threequencer"
name = "Threequencer"
...
```

The UUID is stable and never recycled. It's the linking key across the whole toolchain — devlog entries, Claude session transcripts, published artifacts. The convention was established in the `wip-stream` project; see `~/sandbox/dnewcome/wip-stream/.project.toml` as the canonical example.

---

## The Ecosystem

Three repos currently involved:

| Repo | Role |
|---|---|
| `threequencer` (this repo) | Source of truth for code, devlog, screenshots |
| `wip-stream` | Processes Claude session transcripts from `~/.claude/projects/`, correlates artifacts by timestamp |
| `dnuke.com` | Personal site — one publication target among several |

Claude session transcripts live at `~/.claude/projects/<hashed-path>/`. The wip-stream tooling can process these and correlate them to a project via UUID.

---

## Philosophy (work in progress)

### Local source of truth

The project repo is the source of truth. The devlog lives here, next to the code. Screenshots live here. The `.project.toml` UUID is the identity anchor. Nothing depends on a central server to be the real thing.

This is a deliberate choice against monorepo or hub-and-spoke models. The alternative — making `wip-stream` a publication hub that everything flows through — is possible but introduces a centralization that doesn't fit the intent.

### POSSE

[POSSE](https://indieweb.org/POSSE) — Publish on your Own Site, Syndicate Elsewhere. The devlog entry in this repo is the canonical version. Copies go to Twitter, dnuke.com, wherever — but the source stays here. Deletion or modification at a syndication target doesn't affect the original.

### Internet scale, not team scale

Working in public implies an internet-scale audience and internet-scale distribution — not a local team or company. The tooling should reflect this: no shared database, no intranet, no "the server." Everything should work offline-first and sync by pushing to git or posting to a public URL.

### Distributed by default

Each project knows its own identity (UUID) and its own publication targets (`.project.toml`). The wip-stream tooling can correlate sessions to projects without the project knowing anything about wip-stream. Publication targets (dnuke.com, Twitter, etc.) receive content but don't own it.

### What's not settled

- **wip-stream as hub vs. each project being self-contained**: Currently leaning toward self-contained projects with wip-stream as a *processor* (reads sessions, outputs correlation data) rather than a hub (receives everything, routes it).
- **How devlog entries actually reach publication targets**: `devpublish.sh` is a stub. The real question is whether publishing is a push (script runs, copies file, commits to dnuke.com) or a pull (dnuke.com's build reads from a known location/feed). Pull is more decoupled.
- **Multi-machine**: This tooling assumes Linux (Chrome headless, xdotool). Mac support needs a thin shim for the screenshot commands. The devlog markdown and assets should sync fine via git on any machine.

---

## Files

```
.project.toml               project identity + publication config
devlog/                     devlog entries (markdown)
devlog/assets/              screenshots
devlog/preview.html         generated preview — gitignored
scripts/devsnap.sh          snapshot script (screenshot + entry)
scripts/devlog-preview.sh   generate preview.html
scripts/devpublish.sh       publish an entry to a target (stub)
.git/hooks/post-commit      auto-snap on [snap] commits
.claude/commands/devsnap.md /devsnap skill for Claude Code
```
