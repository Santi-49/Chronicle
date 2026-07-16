# Company & Challenge Research

> **Iterative document** — update this before major design decisions, not just once.
> Each entry should include the date it was added so stale findings are easy to spot.

---

## The Company / Organizer

- **Name:** BeMyApp (hackathon agency, organizer) on behalf of **IBM SkillsBuild** (sponsor)
- **Industry:** IBM — enterprise technology & AI; SkillsBuild — free tech-skills education arm
- **Size / stage:** IBM — incumbent enterprise giant; BeMyApp — established hackathon/event agency that runs many IBM developer events
- **Mission statement:** SkillsBuild: free skills-based learning to prepare people for tech careers
- **Core product(s):** IBM Bob (AI development partner/IDE), watsonx platform, Granite models, Docling, LangFlow
- **Website / relevant links:** https://aibuilderschallenge-bob.bemyapp.com/ · hub: https://aibuilderschallenge-bobhub.bemyapp.com/ · [Official Rules](https://docs.google.com/document/d/e/2PACX-1vTvsdh2JTNvSTODxZTTmHpbtzBuKrpQxOvhvgAeyptwNL66obTRNWoAEZ-0_dGgaA/pub)

### Their Existing Approach to This Problem

IBM has no consumer product in creative-asset versioning — the July theme ("Reimagine Creative Industries with AI") is a showcase domain for IBM Bob, not an internal product gap. What they want demonstrated is that **Bob can take a team from idea to working product fast**.

### Tech Stack & Preferences

- **IBM Bob is the mandatory primary development tool.** Researched 2026-07-16 — Bob (a.k.a. "Project Bob", https://bob.ibm.com/) is IBM's **AI-first IDE**, announced Oct 2025:
  - **Agentic workflows** — spawns focused agents/subagents with their own context, tools, and skills that work the codebase in parallel.
  - **Literate Coding** — describe intent in natural language, Bob generates the implementation in context.
  - **BobShell** — CLI for repeatable, *self-documenting* workflows (CI/CD, recipe-driven tasks).
  - **Bobalytics** — tracks contributions across the SDLC (useful evidence of "effective use of Bob").
  - Built-in **vulnerability + secrets detection** in the IDE.
  - **Multi-model orchestration**: routes across Anthropic Claude, Mistral, Llama, and IBM Granite with full repository context. IBM claims ~45% productivity gains across 6,000+ internal devs.
- Optional but explicitly encouraged in the rules: **watsonx, Granite, LangFlow, Docling**.
- Implication for Chronicle: our **LangChain model-agnostic** choice mirrors Bob's own multi-model philosophy — say so in the pitch. BobShell recipes checked into the repo are cheap, judge-visible proof of Bob usage.

### Public Statements About This Challenge

Framing is education + portfolio: "build real-world AI solutions, develop in-demand technical skills, and showcase their work to a global audience." Outcome language: *learn, build, win.* Student-focused (higher-ed only).

**Official July brief (hub page, 2026-07-16):** "AI is transforming how people create content, tell stories, design experiences, and bring ideas to life. Build solutions that help **creators work smarter**, explore new forms of expression, and unlock new creative possibilities." — Chronicle is squarely a "help creators work smarter" play; reuse that exact phrase in the video and README.

**Hub-only details found:**
- **Each team member** must complete at least one IBM SkillsBuild IBM Bob learning activity — it's per person, not per team.
- The hub lists **five** judging criteria — Technical Execution, Innovation, Challenge Fit, Feasibility, **and Real-World Impact** — while the Official Rules score four. Treat Real-World Impact as judged either way: quantify the pain (time lost hunting versions) in the video.
- Wildcard Challenge can only be entered **once** across July+August (not relevant — we're on the July theme, but keep in mind if we slip to August).
- The full July challenge page (`#/sponsors/1-july-challenge`) and FAQ are **gated behind platform registration** — register at https://aibuilderschallenge-bobhub.bemyapp.com/#/register early and re-check for July-specific requirements/resources.
- Challenge-themed **GitHub Learning Labs** accompany each monthly challenge.

### Values & Culture Signals

- Skills development and learning (SkillsBuild learning activity is a **hard submission requirement** — don't leave it to the last day).
- Real-world impact and feasibility over pure novelty (2 of 4 judging criteria).
- Enterprise sensibility: well-structured, documented, maintainable solutions ("functional and well-structured solution" is quoted in the Technical Execution criterion).

---

## The Problem Space

### Existing Solutions in the Market

| Solution | Approach | Gap |
|----------|----------|-----|
| Filename versioning (`_final_v8`) | Manual suffixes | No history, no diff, no search — the pain we demo |
| Git / Git LFS | Text diffs, binary blobs | Binary files get no readable diff; git UX alienates designers |
| Abstract / Plant (design VCS) | Sketch-specific version control | Tool-locked, mostly defunct; no AI explanation of changes |
| Figma version history | In-app history | Only works inside Figma; no cross-tool, no local files, weak search |
| Dropbox/Drive version history | Cloud file snapshots | No diff, no "what changed", retention limits, cloud-only |
| Adobe Version History (Creative Cloud) | Cloud doc snapshots | Adobe-only, no semantic explanation or cross-asset search |

**Chronicle's gap:** tool-agnostic, local-first, and the diff is *explained in plain language by AI* — none of the incumbents do this.

### Relevant Research or Industry Context

Vision-language models now reliably describe differences between two images; local embedding models make on-device semantic search practical. Both are commodity via LangChain — feasibility risk is low, which suits the Feasibility criterion.

### Past Hackathon Winners (if available)

BeMyApp runs recurring IBM events (Build-a-Bot Challenge, IBM Dev Day: Bob Edition, NextGen Hackathon). No public winner list found for this specific series yet — check the hub's community/Discord for July examples. (2026-07-16)

---

## Recommendations

> Update this section whenever a meaningful new finding changes the strategic picture.

### Framing That Resonates With This Company

- Pitch Chronicle as **"version control for the creative industry"** — squarely inside the July theme ("creative tools"). Say "Challenge Fit" out loud in the video: designers/marketers are creative-industry workers with a universal, demonstrable pain.
- Frame IBM Bob as a co-builder: "planned, scaffolded, and tested with IBM Bob" — the Technical Execution criterion literally scores *effective use of IBM Bob*.

### Technical Choices That Align

- **LangChain, model-agnostic** (team decision): default classes/methods only. Model-agnosticism is itself a good judging story — "swap in Granite/watsonx without code changes."
- Keep Docling on the roadmap slide for PDF/PPTX — mentioning the IBM path forward costs nothing and aligns with "Best Use of Technology."
- Minimal, clear, documented code — judges are told to reward "well-structured"; the README is a judged artifact, treat it as a feature.

### What to Emphasize in the Demo

- The **live capture → plain-English diff** moment (save file → AI explains the change). That is the "hadn't thought of that" beat.
- Hybrid semantic search finding a version by meaning ("blue background").
- Real-world impact: everyone has a `_final_v8.png` story — open the video with it.
- Keep the video ≤3 minutes; script it around VISION.md's demo script.

### What to Avoid

- Don't build a cloud/collab product — out of scope, and local-first is a differentiator, not a limitation. Say "your files never leave your machine."
- Don't skip or defer the **SkillsBuild learning activity** — a missing certificate invalidates the submission regardless of product quality.
- Don't under-document IBM Bob usage — a great product with an undocumented Bob workflow loses the criterion that's easiest to score.
- Don't over-engineer: no custom AI abstractions, no delta storage, no branching.

---

## Research Log

> Append entries here as new information surfaces. Never delete old entries — mark them
> superseded if they become stale. Format: `YYYY-MM-DD — finding — source`.

- 2026-07-16 — Event identified: "AI Builders Challenge with IBM Bob", BeMyApp for IBM SkillsBuild; July theme "Reimagine Creative Industries with AI"; submissions due July 31, 2026 11:59 PM ET; prizes $2,250/$1,250/$750/$750 per month + $5,000 grand prize — event page
- 2026-07-16 — Judging: 4 equal criteria, 1–5 each (max 20): Technical Execution (incl. effective IBM Bob use), Innovation, Challenge Fit, Implementation & Feasibility — Official Rules doc
- 2026-07-16 — Submission: public GitHub repo + README (problem, solution, AI approach, theme, Bob usage) + ≤3 min video + SkillsBuild learning activity; 1 submission/person; teams 1–5 — Official Rules + event page
- 2026-07-16 — Eligibility: enrolled higher-ed students 18+; void in embargoed countries + Brazil, Italy, Quebec, China. Team confirmed eligible (all students) — Official Rules + team
- 2026-07-16 — Optional IBM tech encouraged: watsonx, Granite, LangFlow, Docling — Official Rules doc
- 2026-07-16 — Team decisions: LangChain model-agnostic AI layer (library defaults, minimal code); MVP file types PNG/JPG (PDF/PPTX future); hybrid keyword + embeddings search — team via clarification protocol
- 2026-07-16 — Architecture clarified by team: FastAPI backend used as control plane (login, logs, stats) + optional AI-inference gateway (hybrid: bring-your-own-key or route through our service); files stay on-device — team
- 2026-07-16 — IBM Bob researched: AI-first IDE with agentic workflows, Literate Coding, BobShell CLI, Bobalytics, built-in security scanning; orchestrates Claude/Mistral/Llama/Granite with full repo context — [IBM announcement](https://www.ibm.com/new/announcements/ibm-project-bob), [VentureBeat](https://venturebeat.com/ai/ibm-claims-45-productivity-gains-with-project-bob-its-multi-model-ide-that), https://bob.ibm.com/
- 2026-07-16 — Hub page read via playwright: official July brief ("help creators work smarter…"); SkillsBuild activity is **per team member**; hub lists a 5th criterion, Real-World Impact; Wildcard is once-only; GitHub Learning Labs exist per theme — hub page
- 2026-07-16 — OPEN: full July challenge page + FAQ gated behind registration (`#/forbidden`) — register on the hub, then re-check for July-specific requirements, resources, and the exact SkillsBuild activity list — hub page
- 2026-07-16 — SUPERSEDED (partially): earlier note that Bob research was pending — closed by the two entries above; only the gated July page remains open
