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

Vision-language models can describe differences between two images, and embedding APIs
support semantic search through LangChain. Exact provider quality, cost, structured-output
support, privacy behavior, and orchestration still require testing on the demo asset pack.

### Creative File Formats and the Version-Sprawl Opportunity (2026-07-18)

#### Scope and terminology

This review asks where Chronicle could expand after PNG/JPG. It focuses on **working/project
files**, not only exported media. “Binary” does not automatically mean “undiffable”:

- A **render diff** compares normalized previews (image, contact sheet, viewport render,
  waveform, or short proxy) and lets a multimodal model explain the visible/audible result.
- A **structure diff** compares meaningful objects such as layers, text, scene nodes, tracks,
  clips, materials, dimensions, or components after a trusted parser extracts them.
- The strongest commit message combines both: “Text layer `Summer sale` was removed; the
  background changed from navy to teal.”
- “Version history” below distinguishes a real, browsable history from **recovery backups**.
  A rotating autosave folder protects against crashes, but usually has no semantic message,
  search, milestone, or durable long-term history.

There is no defensible cross-industry dataset showing exact format usage or how often people
type `v1`, `v2`, and `final`. The ranking below therefore uses official product behavior as a
strong proxy: when the application itself offers **Increment and Save**, sequential backups,
or recommends saving differently named copies, numbered-file workflows are not anecdotal.
The ranking is a product hypothesis to validate with users, not a market-share claim.

#### Opportunity matrix

| Industry / workflow | Common working formats | What can be extracted | AI commit-message feasibility | Existing history and evidence of version sprawl | Chronicle opportunity |
|---|---|---|---|---|---|
| **3D animation / VFX** | Blender `.blend`; Maya `.ma` / `.mb`; Houdini `.hip` | Camera renders plus object/node, material, light, rig, and timeline inventories. Maya ASCII and Houdini text exports expose more structure; binary scenes need the host app or a compatible SDK. External textures, caches, plug-ins, and references can make a scene incomplete. | **Medium–high** with the authoring app installed; medium from previews alone. Messages can describe visible composition and structural changes. | **Very strong numbered-file signal.** Blender has **Save Incremental**, which creates a numerically incremented name; Maya's **Increment & Save** creates `.0001`, `.0002`, etc.; Houdini supports numbered backups and versioned cache paths. These are mostly files/backups, not explained searchable history. ([Blender manual](https://docs.blender.org/manual/en/dev/files/blend/open_save.html), [Maya help](https://help.autodesk.com/cloudhelp/2026/ENU/Maya-ManagingScenes/files/GUID-62B28906-C01A-4A48-8AB7-F8A7FE4D3510.htm), [Houdini environment reference](https://www.sidefx.com/docs/houdini/ref/env), [Houdini cache reference](https://www.sidefx.com/docs/houdini/nodes/sop/filecache.html)) | **Best post-MVP discovery track.** The pain is explicit, files are high-value, and no commit message accompanies each increment. Start with Blender because it is cross-platform, scriptable, and available without a proprietary DCC license. |
| **Motion graphics / compositing** | After Effects `.aep` (binary), `.aepx` (XML) | Composition/layer names, text, markers, footage references, timing, effects, and rendered keyframes. Adobe says AEPX exposes much—but not all—project information as human-readable XML. | **High for AEPX**, **medium for AEP** via After Effects render/automation. Sample several meaningful frames; a single thumbnail misses timing and animation changes. | **Very strong numbered-file signal.** After Effects' **Increment and Save** appends or increments a number; autosave keeps a configurable number of project versions. Team Projects adds cloud version control, but local AEP files remain common and increments have no automatic explanation. ([Adobe project documentation](https://helpx.adobe.com/ca/after-effects/using/projects.html), [Adobe autosave documentation](https://helpx.adobe.com/sa_en/after-effects/using/preferences.html)) | **Top candidate.** Excellent `v001` story and richer, more judge-visible messages than raw pixels: “Moved the title reveal 12 frames earlier; replaced the logo footage; added glow.” |
| **Graphic design / photo compositing** | Photoshop `.psd` / `.psb`; layered TIFF; Illustrator `.ai` | Composite preview, thumbnails, dimensions, color profile, text/layer names, visibility, masks, and effects where a parser supports them. PSD/PSB preserve layers and editing features and can include a composite preview. | **High** for visual changes; **medium–high** for structure because complete Adobe feature compatibility is hard. | Photoshop cloud documents have named, searchable version history, but that is a **cloud-document feature**; local PSD/PSB files do not receive the same automatic durable timeline. Photoshop's local History snapshots are temporary. ([Adobe format overview](https://helpx.adobe.com/photoshop/desktop/save-and-export/export-files-to-different-formats/photoshop-file-formats-overview.html), [Adobe cloud history](https://helpx.adobe.com/photoshop/using/manage-cloud-documents-photoshop.html), [Adobe local save behavior](https://helpx.adobe.com/ca/photoshop/desktop/save-and-export/save-files/save-your-work.html)) | **Natural near-term extension** from PNG/JPG and the easiest demo bridge. Chronicle is most differentiated for local files and cross-tool folders; it should not claim Adobe has no version history. |
| **Editorial / publishing / packaging** | InDesign `.indd`; interchange `.idml` | Rendered spreads, OCR/text, style names, placed-asset links, colors, and geometry. IDML is explicitly a ZIP archive of XML files split into stories, spreads, resources, and preferences for automated processing. | **High for IDML**, **medium for INDD** unless InDesign exports/render previews. Text and layout changes make unusually precise commit messages possible. | Adobe cloud workflows offer versions, but ordinary local project files still rely on Save As/copies and linked assets. IDML itself contains structure, not a history. ([Adobe IDML specification](https://community.adobe.com/havfw69955/attachments/havfw69955/indesign/632652/1/idml-specification.pdf)) | **Strong specialist wedge** for agencies and publishers: “Price changed from €49 to €39 on page 3; legal paragraph added; product image replaced.” Prefer IDML ingestion before native INDD. |
| **Video editing** | Premiere `.prproj`; DaVinci Resolve database projects / `.drp`; Final Cut libraries / FCPXML | Timeline structure, clip references, edits, captions, markers, effects, and low-resolution frame/contact-sheet proxies. FCPXML is a documented plain-text interchange route for Final Cut library, event, project, and clip data. Audio and temporal sampling are required; a first-frame comparison is misleading. | **Medium–high** from structured timeline data plus selected frames; **low–medium** from opaque project files alone. Missing source media and plug-ins are common. | Premiere defaults to autosaving every five minutes and retaining the last 20 timestamped `.prproj` versions. Resolve supports timeline and project backups. Final Cut automatically creates timestamped library-database backups but excludes media and eventually deletes old backups. These are useful recovery histories but normally do not explain the editorial decision. ([Premiere autosave](https://helpx.adobe.com/in/premiere/desktop/get-started/preferences-and-settings/auto-save-preferences.html), [Resolve 20 Editors Guide](https://documents.blackmagicdesign.com/UserManuals/DaVinci-Resolve-20-Editors-Guide.pdf), [Final Cut FCPXML](https://support.apple.com/en-gb/guide/final-cut-pro/verdbd66ae/mac), [Final Cut backups](https://support.apple.com/en-ie/guide/final-cut-pro/ver85d95b8a9/mac)) | **High pain, higher implementation cost.** A good message (“Cut 18 seconds from the opening; moved interview B before the product shot; updated captions”) is compelling, but dependency handling and temporal comparison should follow simpler formats. |
| **Music production / audio post** | Ableton `.als`; Logic project package; FL Studio `.flp`; Pro Tools `.ptx` | Track/clip/MIDI inventories, tempo, arrangement, plug-in names and parameters where readable, plus rendered loudness/spectrum/waveform and audio embeddings. Referenced samples and unavailable plug-ins limit faithful reconstruction. | **Medium** for project structure; **medium–low** for judging whether the mix “sounds” different without rendering in the DAW. Text-only metadata still yields useful factual messages. | **Very strong version-sprawl signal.** Ableton's manual explicitly describes saving different Set versions along the way; FL Studio has **Save new version** and local sequential backups; Pro Tools documents Save As for successive session versions; Logic stores up to ten backups per project alternative. None automatically describes the musical change. ([Ableton manual](https://www.ableton.com/en/manual/managing-files-and-sets/), [FL Studio project files](https://www.image-line.com/fl-studio-learning/fl-studio-online-manual/html/fformats_project.htm), [Pro Tools guide](https://resources.avid.com/SupportFiles/attach/Pro_Tools/12.5/Pro_Tools_12_5_Reference_Guide.pdf), [Logic Pro guide](https://support.apple.com/guide/logicpro/use-project-alternatives-and-backups-lgcpa158ef77/10.7/mac/11.0)) | **Excellent user pain, later technical target.** Begin with metadata-only session summaries or exported mix WAV comparisons; do not promise a faithful mix without the same plug-ins and samples. |
| **Architecture / 2D CAD** | AutoCAD `.dwg` (native binary), `.dxf` (ASCII or binary) | Entities, layers, blocks, dimensions, text, properties, and normalized sheet/model renders. DWG needs a licensed/compatible library or AutoCAD automation; ASCII DXF is structurally accessible. | **High for 2D changes** once parsed/rendered; **medium** for complex 3D/custom objects. | AutoCAD keeps the previous save as `.bak`; supported cloud accounts expose previous versions; DWG Compare already identifies added, removed, and modified objects and draws revision clouds. This validates the need, but also creates a strong incumbent. ([AutoCAD saving](https://help.autodesk.com/view/ACD/2026/ENU/?guid=GUID-5692ECA7-091D-446B-B946-BC8FF893E296), [DWG Compare](https://help.autodesk.com/cloudhelp/2025/ENU/AutoCAD-Core/files/GUID-2D69E78D-5C82-464F-B864-CD29D5720EB9.htm), [DXF save options](https://help.autodesk.com/cloudhelp/2026/ENU/AutoCAD-Core/files/GUID-E2CEA3F2-43CA-41D0-A2C6-BACF2229715A.htm)) | **Good vertical, not the easiest first extension.** Chronicle adds cross-tool local capture, natural-language explanation, and semantic search; it should integrate or summarize native object diffs rather than pretend they do not exist. Licensing must be researched before promising DWG. |
| **Architecture / BIM** | Revit `.rvt`, `.rfa`; open IFC `.ifc` | Model categories, element/property changes, quantities, rooms, sheets, and viewpoint renders. Native Revit is proprietary and version-specific; IFC is a vendor-neutral, machine-interpretable ISO standard whose prevalent exchange form is a readable STEP physical file. It is better for neutral extraction, though separate exports can still produce noisy diffs. | **Medium–high** for object/property changes with stable IDs; **medium** for visual-only model changes. | Revit creates numbered backups such as `model.0001.rvt`, with a configurable retention cap. That is direct evidence of numbered files, but it is a rollback mechanism rather than explained history. Cloud/workshared projects add stronger history. ([Revit backup files](https://help.autodesk.com/cloudhelp/2023/ENU/Revit-GetStarted/files/GUID-E79353E9-CC57-4ECE-93B8-5D12D9B3B135.htm), [buildingSMART IFC overview](https://www.buildingsmart.org/standards/bsi-standards/industry-foundation-classes/?lang=en), [buildingSMART IFC formats](https://technical.buildingsmart.org/%20standards/ifc/ifc-formats/)) | **Compelling long-term vertical** for “what changed in this model?” Start with IFC exports or a Revit plug-in/sidecar, not reverse-engineering RVT. |
| **Industrial / product CAD** | STEP `.step` / `.stp`; native SolidWorks parts/assemblies; Fusion designs; IGES | Components, bodies, topology, dimensions/properties where present, mass/bounding box, and standardized multi-view renders. STEP is clear-text structured data but not human-readable without its EXPRESS schema. Geometric matching across exports is harder than line diffing. | **Medium–high** for gross geometry/property changes; **medium–low** for design intent from exchange files that omit feature history. | Mature systems already compete strongly: SOLIDWORKS PDM creates a version on each check-in, supports comments/compare/restore, and separates versions from approved revisions; Fusion has versions, milestones, descriptions, and history. ([STEP format description](https://www.loc.gov/preservation/digital/formats/fdd/fdd000448.shtml), [SOLIDWORKS PDM history](https://help.solidworks.com/2024/English/EnterprisePDM/FileExplorer/c_Versions_and_Revisions.htm), [Fusion version history](https://help.autodesk.com/view/fusion360/ENU/?guid=ASM-DESIGNS)) | **Lower greenfield value in managed enterprises**, higher value for freelancers/small shops using local files or neutral exchange formats. Chronicle's AI could draft missing check-in comments, but it would enter a PDM-heavy market. |
| **Digital illustration** | Procreate `.procreate`; Clip Studio `.clip`; Krita `.kra` | Flattened preview plus layers, text, and time-lapse/stroke data where the format exposes it. Procreate embeds time-lapse video in the artwork file, which could provide creation context but is not a reversible version chain. | **High visually**, **medium structurally** because native formats vary and mobile files may not live in a watched desktop folder. | Procreate auto-saves locally and tells users to export/back up artwork; its time-lapse is replay, not version restore. Manual duplicates/exports are therefore plausible but require interview validation. ([Procreate file types](https://help.procreate.com/procreate/handbook/5.0/gallery/gallery-file-types), [Procreate backup guidance](https://help.procreate.com/articles/zmppbd-back-up-artwork)) | **Good creator story but weaker desktop fit** for Procreate. Krita is a better open desktop experiment; validate whether illustrators actually keep numbered copies before prioritizing. |
| **Photography / color grading of stills** | RAW `.cr3`, `.nef`, `.arw`, `.dng` plus XMP sidecars; Lightroom catalogs | Pixel preview, EXIF, crop/develop parameters, masks, ratings, and sidecar edits. | **High** for rendered appearance and parameter changes. | Mostly **non-destructive editing**: the original RAW stays fixed and edits live in a catalog/sidecar with application history. The core Chronicle trigger—same binary working file repeatedly overwritten—is therefore weaker. | **Low priority.** Sidecar/catalog history competes with Chronicle, and storing repeated RAW blobs is wasteful. Support exported TIFF/PSD deliverables instead. |
| **Game art / real-time scenes** | Unreal `.uasset` / `.umap`; Unity scenes/prefabs/assets; texture and model dependencies | Object/component/property inventories and editor screenshots if the engine can load the project. Binary assets may be source-control-aware but still lack a human visual diff. | **Medium**, highly engine/version dependent. Untrusted projects may execute code or editor scripts. | Studios commonly use Perforce/Git LFS and engine-specific diff tools; histories exist, but binary changes often have poor review descriptions. | **Interesting enterprise extension, not near-term.** Repository semantics, huge dependency graphs, and code-execution risk conflict with Chronicle's simple watched-file MVP. |

#### Prioritization

1. **Keep PNG/JPG for the hackathon MVP.** It proves the capture-to-explanation loop with the
   least format risk.
2. **Use the selected future-format set: SVG, BLEND, OBJ, STEP/STP, PSD, and PSB.** This is a
   roadmap decision, not MVP scope.
3. **Prototype PSD/PSB and SVG first** as the closest image/vector adjacencies. Image-first
   comparison still works, while layers, text, and vector structure can make messages precise.
4. **Use BLEND as the first rich 3D project experiment.** Blender has strong numbered-save
   evidence, accessible automation, scene structure, and renderable previews.
5. **Use OBJ and STEP/STP as interchange-format experiments.** Their structures are accessible
   without committing Chronicle to proprietary authoring applications.
6. **Do not place the other researched formats on the committed roadmap.** The matrix remains
   useful market research, but AEPX, IDML, DWG/DXF, IFC, video, DAW, and other formats are not
   selected future support targets.

#### Product implications for Chronicle

- Chronicle currently defines an asset by its working path. That solves future `final-v8`
  sprawl when users keep saving the same file, but it does **not** automatically unify an
  existing family such as `shot_010_v001.mb`, `shot_010_v002.mb`, and `shot_010_v003.mb`.
  A later **Import existing versions** flow should detect conservative numeric suffix patterns,
  show the proposed grouping, sort by timestamp/number, and require confirmation. Never merge
  similarly named files silently.
- Store the original bytes, but generate **derived comparison artifacts** asynchronously:
  normalized preview(s), extracted structure JSON, text/OCR, and dependency warnings. Hash and
  cache those artifacts per content hash. The AI receives the smallest useful diff context, not
  an entire opaque file by default.
- A commit message should state both the change and the confidence/coverage. Example: “Camera
  render: sofa changed from gray to green. Scene inventory: two lights added. Three linked
  textures were unavailable, so material changes may be incomplete.”
- Large creative formats are frequently **compound documents** with linked media, fonts,
  textures, plug-ins, and caches. “File changed” and “project changed” are different product
  concepts. Chronicle should not claim a faithful diff when dependencies are missing.
- Do not execute embedded macros, Python, expressions, plug-ins, or editor scripts from an
  untrusted file. Blender itself warns that blend files may contain executable Python. Any
  host-app rendering/conversion should run with scripts disabled, network restricted where
  practical, time/memory limits, and explicit user consent.
- Existing vendor histories are not only competitors; they can be inputs. Chronicle's durable
  differentiation is **automatic natural-language explanation + cross-tool semantic search**.
  An adapter could eventually annotate AutoCAD comparisons, Revit backups, Premiere autosaves,
  or PDM check-ins instead of replacing those systems.

#### Validation still required

Before implementing future formats, interview users of the selected graphic-design, 3D, and
product-design workflows and request an anonymized folder listing or screen share. Measure:
number of sibling versions, naming pattern, file size, save frequency, existing backup/history
feature used, how often old versions are recovered, and the questions users wish they could
search. Then build a 5–10 file-pair corpus for SVG, BLEND, OBJ, STEP/STP, PSD, and PSB and score
commit messages for factuality, usefulness, extraction coverage, latency, and cost. Official
documentation proves the workflows exist; only user evidence can establish frequency and
willingness to adopt.

### Past Hackathon Winners (if available)

BeMyApp runs recurring IBM events (Build-a-Bot Challenge, IBM Dev Day: Bob Edition, NextGen Hackathon). No public winner list found for this specific series yet — check the hub's community/Discord for July examples. (2026-07-16)

---

## Recommendations

> Update this section whenever a meaningful new finding changes the strategic picture.

### Framing That Resonates With This Company

- Pitch Chronicle as **"version control for the creative industry"** — squarely inside the July theme ("creative tools"). Say "Challenge Fit" out loud in the video: designers/marketers are creative-industry workers with a universal, demonstrable pain.
- Frame IBM Bob as a co-builder: "planned, scaffolded, and tested with IBM Bob" — the Technical Execution criterion literally scores *effective use of IBM Bob*.
- Use the roadmap line **“from `final-v8.png` to `scene_v042.blend`”**. Numbered versions are
  not merely a joke: Blender explicitly supports incremental numeric saves. Chronicle supplies
  the explanation those filenames lack.

### Technical Choices That Align

- **LangChain, model-agnostic** (team decision): default classes/methods only. Model-agnosticism is itself a good judging story — "swap in Granite/watsonx without code changes."
- ~~Keep Docling on the roadmap slide for PDF/PPTX~~ — **superseded first on 2026-07-16
  and finalized on 2026-07-19**: documents remain out, and the selected future formats are
  SVG, BLEND, OBJ, STEP/STP, PSD, and PSB. The IBM alignment story stays via watsonx/Granite
  as the model-agnostic swap.
- Minimal, clear, documented code — judges are told to reward "well-structured"; the README is a judged artifact, treat it as a feature.
- For the desktop UI, use a neutral-gray, dark-first palette with IBM blue reserved for primary actions and focus. IBM's public design language recommends gray-dominant product interfaces, blue as the primary action color, paired dark/light themes, and WCAG contrast checks.
- Keep product navigation in one persistent left shell and use short “productive” motion only to clarify page changes. Carbon presents the UI shell as the stable orientation layer and describes efficient motion as a way to move users forward, not decoration.
- Treat the desktop title bar as functional window chrome, not spare canvas. Keep the app identity at the leading edge, preserve native caption controls, and leave unused space draggable. Add a centered global search/command field only when it provides real app-wide functionality; Microsoft recommends a 48 px title bar when global search is present.
- Self-host Google Material Symbols SVGs so the desktop UI remains offline-capable. The future Google sign-in control uses the standard-color “G” and approved “Continue with Google” wording; do not improvise or recolor the brand mark.
- For format expansion, prefer an adapter pipeline of **safe extraction → normalized preview /
  structure diff → LangChain annotation**. Do not send opaque project bytes to a model and hope
  it understands a proprietary container.
- For future-format work, follow the selected order: SVG and PSD/PSB adjacency experiments,
  then a sandboxed Blender proof of concept, followed by OBJ and STEP/STP interchange support.

### What to Emphasize in the Demo

- The **live capture → plain-English diff** moment (save file → AI explains the change). That is the "hadn't thought of that" beat.
- Hybrid semantic search finding a version by meaning ("blue background").
- Real-world impact: everyone has a `_final_v8.png` story — open the video with it.
- Keep the video ≤3 minutes; script it around VISION.md's demo script.

### What to Avoid

- Don't build a cloud/collab storage product — out of scope. Say that versions remain local and Chronicle does not upload the library; disclose that configured AI inference sends required inputs to an API provider or the optional gateway.
- Don't skip or defer the **SkillsBuild learning activity** — a missing certificate invalidates the submission regardless of product quality.
- Don't under-document IBM Bob usage — a great product with an undocumented Bob workflow loses the criterion that's easiest to score.
- Don't over-engineer: no custom AI abstractions, no delta storage, no branching.
- Do not claim that creative tools have no history. Many have rotating backups, cloud history,
  PDM, or native compare. Say precisely that histories are fragmented, tool-specific, often
  recovery-oriented, and usually lack automatic natural-language explanations and cross-tool
  semantic search.
- Do not promise support based only on a file extension. Compound projects can be missing media,
  fonts, textures, plug-ins, or caches; proprietary parsers may also carry licensing constraints.

---

## Research Log

> Append entries here as new information surfaces. Never delete old entries — mark them
> superseded if they become stale. Format: `YYYY-MM-DD — finding — source`.

- 2026-07-16 — Event identified: "AI Builders Challenge with IBM Bob", BeMyApp for IBM SkillsBuild; July theme "Reimagine Creative Industries with AI"; submissions due July 31, 2026 11:59 PM ET; prizes $2,250/$1,250/$750/$750 per month + $5,000 grand prize — event page
- 2026-07-16 — Judging: 4 equal criteria, 1–5 each (max 20): Technical Execution (incl. effective IBM Bob use), Innovation, Challenge Fit, Implementation & Feasibility — Official Rules doc
- 2026-07-16 — Submission: public GitHub repo + README (problem, solution, AI approach, theme, Bob usage) + ≤3 min video + SkillsBuild learning activity; 1 submission/person; teams 1–5 — Official Rules + event page
- 2026-07-16 — Eligibility: enrolled higher-ed students 18+; void in embargoed countries + Brazil, Italy, Quebec, China. Team confirmed eligible (all students) — Official Rules + team
- 2026-07-16 — Optional IBM tech encouraged: watsonx, Granite, LangFlow, Docling — Official Rules doc
- 2026-07-16 — Team decisions: LangChain model-agnostic AI layer (library defaults, minimal code); MVP file types PNG/JPG (PDF/PPTX future — *format roadmap superseded below: CAD, not documents*); hybrid keyword + embeddings search — team via clarification protocol
- 2026-07-16 — Architecture clarified by team: FastAPI backend used as control plane (login, logs, stats) + optional AI-inference gateway (hybrid: bring-your-own-key or route through our service); files stay on-device — team
- 2026-07-16 — IBM Bob researched: AI-first IDE with agentic workflows, Literate Coding, BobShell CLI, Bobalytics, built-in security scanning; orchestrates Claude/Mistral/Llama/Granite with full repo context — [IBM announcement](https://www.ibm.com/new/announcements/ibm-project-bob), [VentureBeat](https://venturebeat.com/ai/ibm-claims-45-productivity-gains-with-project-bob-its-multi-model-ide-that), https://bob.ibm.com/
- 2026-07-16 — Hub page read via playwright: official July brief ("help creators work smarter…"); SkillsBuild activity is **per team member**; hub lists a 5th criterion, Real-World Impact; Wildcard is once-only; GitHub Learning Labs exist per theme — hub page
- 2026-07-16 — OPEN: full July challenge page + FAQ gated behind registration (`#/forbidden`) — register on the hub, then re-check for July-specific requirements, resources, and the exact SkillsBuild activity list — hub page
- 2026-07-16 — SUPERSEDED (partially): earlier note that Bob research was pending — closed by the two entries above; only the gated July page remains open
- 2026-07-16 — SUPERSEDED (partially): control plane demoted to **lowest priority (non-essential)** and startup offers "Log in / Register" or "Continue local"; the earlier “no API connection” wording applies to Chronicle's API, not the external provider required for AI — team; clarified 2026-07-17 below
- 2026-07-16 — Team decision: file-format roadmap after images = **architecture/design-software formats (CAD, e.g. DWG/DXF)**, not PDF/PPTX — Word/PDF versioning already exists (Office/Adobe/cloud drives), while design industries lack a unified VCS; supersedes the Docling/PDF recommendation above — team
- 2026-07-16 — UI structure defined conceptually (pages, layout, startup flow, feature coverage) in docs/desktop/overview.md — team + session
- 2026-07-17 — Contract policy clarified: contracts define operation functionality and input/output/error formats, not prompts, algorithms, tools, orchestration, storage layout, provider choices, or internal classes. Prompt assets are centralized under `packages/prompts/` as Markdown with YAML front matter — team
- 2026-07-17 — AI scope clarified: MVP inference is API-based through LangChain only; “local” means local version storage and desktop-side orchestration, not a local model. BYOK sends required inputs directly to the configured provider; gateway routing remains stretch scope — team
- 2026-07-17 — OPEN RESEARCH: before implementing AI, test LangChain-native structured output/runnables/tools, a shared Markdown/YAML-front-matter loader, deterministic image/OCR assistance, provider image handling, privacy, cost, and result quality. Prefer library-native facilities; add no custom AI classes unless the tested implementation requires them — team architecture review
- 2026-07-17 — Visual direction validated before first UI implementation: IBM Design Language uses gray-dominant UI surfaces, core blue for primary actions, paired dark/light themes, and 4.5:1 contrast for small text. Chronicle adopts a minimal dark-first system with a light toggle and semantic color tokens — [IBM Design Language: Color](https://www.ibm.com/design/language/color/)
- 2026-07-17 — Full desktop screen-shell research: Carbon recommends a persistent UI shell for navigation/orientation and distinguishes efficient productive motion from expressive motion. Chronicle uses one left nav, explicit nested back paths, and a 220 ms reduced-motion-aware page transition — [Carbon UI shell](https://carbondesignsystem.com/components/UI-shell-header/usage/), [Carbon motion](https://carbondesignsystem.com/elements/motion/overview/)
- 2026-07-17 — Icon/identity direction: Material Symbols may be self-hosted under Apache 2.0; Chronicle bundles only the Google SVG glyphs it uses. Google sign-in branding requires the standard-color “G” and approved CTA wording, so the disabled skeleton follows those rules — [Material Symbols guide](https://developers.google.com/fonts/docs/material_symbols), [Google sign-in branding](https://developers.google.com/identity/branding-guidelines)
- 2026-07-18 — Watcher findings (MVP-03): chokidar 5's `awaitWriteFinish` (`stabilityThreshold: 2000`) implements the F3.1 settle rule directly — no custom debounce code; `atomic: true` folds temp-write + rename saves into one event for the final name (verified in automated tests with `.tmp` → rename). chokidar 5 is ESM-only but Electron 43 ships Node 24 where CJS `require()` of ESM works natively (probed at runtime — no bundler workaround). OPEN: manual save test in the actual demo editor (Photoshop or the tool used in the video) still required once capture (MVP-04) makes candidates visible — automated tests simulate the rename pattern but not real editor behavior — team
- 2026-07-17 — Desktop title-bar direction: Windows guidance defines the bar as app identity + window movement + native caption controls, requires unused/non-interactive space to remain draggable, and recommends 48 px when global search or an account control is added. Electron supports the same pattern with a hidden default title bar plus native Window Controls Overlay. Chronicle removes the redundant Windows/Linux menu row, uses a 48 px branded drag region, keeps native caption controls, and intentionally leaves the center empty until real global search earns it — [Microsoft title bar design](https://learn.microsoft.com/en-us/windows/apps/design/basics/titlebar-design), [Electron custom title bar](https://www.electronjs.org/docs/latest/tutorial/custom-title-bar)
- 2026-07-18 — File-format opportunity research: strongest evidenced numbered-file workflows are 3D/VFX and motion graphics. Blender and Maya expose incremental numeric saves; After Effects increments project filenames; Houdini uses numbered backups/versioned caches. These workflows make `v001` sprawl a product-supported convention, not only anecdote — official Blender, Autodesk, Adobe, and SideFX documentation linked in the opportunity matrix above
- 2026-07-18 — Architecture finding: DWG/Revit are valuable but not greenfield versioning markets. AutoCAD already offers `.bak`, cloud history, and object-level DWG Compare; Revit creates numbered `.rvt` backups. Chronicle's defensible layer is automated explanation and semantic retrieval across tools; DXF/IFC should precede proprietary integration research — Autodesk documentation linked above
- 2026-07-18 — Other-industry finding: audio and video tools also preserve many versions (Ableton named Sets, FL Studio sequential versions, Logic alternatives/backups, Pro Tools successive Save As files, Premiere timestamped autosaves), but linked media, plug-ins, and temporal comparison make them later technical targets — official vendor documentation linked above
- 2026-07-18 — Roadmap recommendation: after the PNG/JPG MVP, evaluate PSD/PSB as the nearest visual extension; run a Blender and AEPX discovery spike; validate actual prevalence with user interviews and anonymized folder samples before changing committed scope. Add a future confirmed “Import existing versions” flow because Chronicle's current path-based asset identity would otherwise treat `v001`, `v002`, and `v003` as separate assets — research synthesis
- 2026-07-19 — ROADMAP DECISION: selected future formats are **SVG, BLEND, OBJ, STEP/STP, PSD, and PSB**. The broader 2026-07-18 matrix remains research, but its AEPX, IDML, DXF/IFC, video, audio, and other candidates are not committed future support targets. PNG/JPG remain the only MVP formats — team
- 2026-07-19 — ARCHITECTURE DECISION: AI features are developed **in Python**, not LangChain.js in the Electron app. A **local AI service** (`services/ai/`: FastAPI + LangChain Python, loopback-only, no Docker) runs beside the desktop app; the Electron main process keeps the job queue and calls it over `127.0.0.1`. Distinct from the `services/api/` control plane. BYOK keys stay in Electron `safeStorage` and are passed per-request over loopback, never persisted by the service. One AI codebase: the stretch gateway (F9) reuses it. C3's source of truth moves to the service's OpenAPI + `output.schema.json` with generated TS client types. Supersedes the "LangChain exists twice" split in spec §2 — team
- 2026-07-19 — AI FEATURE SCOPE DECISION: MVP AI operations are exactly (1) version diff annotation, (2) first-version description (same `annotate` operation with `previous: null` — this covers "image-to-text"/enrichment; tags are the metadata), and (3) **text** embeddings for versions and search queries. Service surface: `POST /annotate`, `POST /embed-text`, `GET /health`. The annotation schema gains an optional nullable `confidence` (0–1) so future partial-extraction formats need no contract change. **Image embeddings** (visual-similarity search) and a **history chatbot** (RAG over annotations) are roadmap, not MVP — the chatbot may be reconsidered only if MVP-12 finishes early — team
- 2026-07-19 — AI IMPLEMENTATION FINDING: LangChain's current Python API provides neutral `init_chat_model` and `init_embeddings` factories, async embedding methods, structured output, and standard base64 image content blocks. Chronicle uses those library-native seams rather than provider wrappers. Provider integration packages remain separate dependencies, so the demo provider package must be installed explicitly. Live provider quality/cost/privacy evaluation remains open because no BYOK credential was available during automated implementation — [LangChain models](https://docs.langchain.com/oss/python/langchain/models), [embedding reference](https://reference.langchain.com/python/langchain/embeddings/base/init_embeddings)
- 2026-07-19 — AI LIVE ACCEPTANCE: Gemini `gemini-flash-latest` correctly described the controlled first-version fixture and identified the two added magenta ellipses in the diff fixture. Its first response used multi-word tags with spaces, exposing a C3 mismatch; prompt v0.1.1 now explicitly requires lowercase hyphenated slugs, and both reruns validated successfully. `gemini-embedding-001` returned a 3,072-dimension text vector. The full temporary flow (capture → queue → loopback FastAPI → provider → annotation persistence → embedding queue → vector persistence) passed. BYOK stayed process-local/per-request and no key appeared in output; provider-side retention/privacy and exact per-call cost were not independently verified, so demo copy must not claim zero retention or a measured cost — team live test
