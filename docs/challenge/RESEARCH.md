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

### Control-Plane Identity, Sync, and Telemetry (2026-07-21)

Google's OpenID Connect guidance identifies the `sub` claim—not email—as the stable,
never-reused Google account identifier. Chronicle should request only `openid email profile`,
validate the returned ID token, store a provider/subject link, and issue its own existing JWT
session. Google's current OAuth security guidance strongly recommends PKCE for desktop apps and
warns against embedded browsing environments. Google's installed-app guide is explicit that a
desktop app opens the **system browser** and uses a local loopback redirect; OAuth policy forbids
an embedded user-agent controlled by the app. RFC 8252 applies the same best-current-practice to
hybrid desktop apps such as Electron: use an external user-agent, normally the operating system's
default browser, because the app cannot inspect its cookies, credentials, or page content and the
user retains their existing session, password manager, and accessibility configuration. Chronicle
therefore opens the default browser (Chrome only when it is the user's default), **not** a small
temporary `BrowserWindow`/webview. It uses a short-lived state/nonce/PKCE transaction and a one-time
loopback handoff. Chronicle does not need
long-lived Google access or refresh tokens because Google APIs are not part of the feature.
([Google OpenID Connect](https://developers.google.com/identity/openid-connect/openid-connect),
[OIDC claims reference](https://developers.google.com/identity/openid-connect/reference),
[Google OAuth for desktop apps](https://developers.google.com/identity/protocols/oauth2/native-app),
[Google OAuth policy](https://developers.google.com/identity/protocols/oauth2/policies),
[RFC 8252](https://datatracker.ietf.org/doc/html/rfc8252))

The external-browser transaction must remain bounded and recoverable. Before opening the browser,
the desktop should call the Chronicle API's public health endpoint with a short timeout. If that
preflight fails, it should keep local mode available, show one actionable inline status, and avoid
opening Google or starting an OAuth timeout that cannot succeed. A browser flow that expires,
is cancelled, or loses its loopback callback should close its temporary listener and return a
plain product message (for example, “Google sign-in took too long. Try again.”), never the raw
Electron IPC wrapper text. A visible retry is preferable to automatic repeated health/auth calls.

Control-plane data has four distinct purposes and must not be presented as one permission:

- minimal best-effort installation registration for a random installation ID and first/last-seen,
  app-version, and OS-family metadata;
- optional portable settings sync, excluding device paths, project metadata, and secrets;
- separate optional end-to-end-encrypted API-key sync for signed-in users, requiring a
  client-held recovery/decryption design before implementation; and
- default-enabled usage statistics containing pseudonymous project inventory and allowlisted
  events, never creative content or identifying project/file/search metadata.

Project counts can be measured without uploading project identity: each project receives a random
telemetry-only ID, and the backend stores its current tracked-file count and allowlisted file-type
distribution. A version-capture event supplies the count increment plus file type, coarse size
bucket, and timing, but no asset/version ID, exact size, hash, path, or name. These IDs are
pseudonymous—not anonymous—when linked to an installation/account. Installation registration also
measures installations, not unique humans, so product/admin copy must use those terms accurately.

The GDPR principles of purpose limitation, data minimization, storage limitation, and security
require each category to have a defined purpose, lawful basis, retention, export/erasure behavior,
and accurate disclosure. The team chose a default-enabled telemetry toggle on 2026-07-21. That is
not affirmative opt-in and must not be labelled consent; onboarding must disclose it before the
first batch and allow immediate disablement. If consent is selected as the lawful basis, telemetry
must change to an affirmative choice before production.
([GDPR Article 5](https://eur-lex.europa.eu/eli/reg/2016/679/art_17/oj/eng))

### Default AI Provider/Model Validation (VALIDATE-01, 2026-07-21)

Chronicle ships Google Gemini as the default AI provider (`google_genai`) with
`gemini-flash-latest` for annotation and `gemini-embedding-001` for embeddings. This
section records the dated research and repeatable live test that confirm those defaults
work for a new BYOK user. A prior successful call is evidence, not proof that a *changing*
external default still works, so the defaults were re-probed live against the committed
demo fixtures on this date.

**Toolchain verified:** `langchain-google-genai` 4.2.2, `google-genai` 1.75.0,
LangChain 1.3.14, Python 3.13. The service resolves both tasks through LangChain's
model-agnostic `init_chat_model` / `init_embeddings` factories (no provider wrapper).

**Live results (2026-07-21, real BYOK key, three end-to-end passes):**

- **`gemini-flash-latest` (annotation).** First-version description and the controlled
  two-version diff both succeeded on every pass. The diff correctly identified the two
  added magenta ellipses in the `before.jpg → after.jpg` fixture; the first-version pass
  correctly described the navy Chronicle logo. Multimodal image input works through the
  standard `image_url` data-URL block, and structured output (summary/changes/tags) parsed
  cleanly. Observed latency ≈ 6–7 s per call; reported usage ≈ 1,230 input / 640–870 output
  tokens (first-version) and ≈ 2,330 input / 560–800 output tokens (diff). At the configured
  `$1.50` input / `$9.00` output per-million pricing that is ≈ **$0.007–0.011 per annotation**.
- **`gemini-embedding-001` (embeddings).** Returned a **3,072-dimension** vector on every
  call (matching the 2026-07-19 acceptance). Semantic ranking behaved correctly: "the
  version with the tagline removed" and "green bottle" each ranked the intended candidate
  first. `$0.15` input / `$0` output per million, so search embedding cost is negligible.
- **Configuration probe.** `POST /validate-provider-model` returned VALID for both the chat
  and embeddings tasks using the real task-specific call.
- **Error paths (all graceful/asynchronous).** An invalid API key was rejected for both
  tasks (`ChatGoogleGenerativeAIError` / `GoogleGenerativeAIError` → mapped to a 502 provider
  error, no key leaked). A non-existent model was rejected. `gemini-pro-latest` (a curated
  "highest quality" catalog option, not a default) returned **429 RESOURCE_EXHAUSTED** on the
  demo key's free-tier quota — a valid model ID that is rate-limited, exercising the
  unavailable/rate-limited path; it surfaces as a provider error and never blocks capture.

**Documentation findings (primary sources):**

- **`gemini-flash-latest` is a moving alias.** Google's model docs state `-latest` aliases
  "get hot-swapped with every new release" of that variation, with a **2-week email notice**
  before a breaking change to the version behind the alias. As of this date it resolves to a
  current Gemini 3.x Flash (the models page lists Gemini 3.6 Flash as the latest). **Risk:**
  the demo default can change under us. It works today, but for a rehearsed demo the team may
  prefer pinning a specific dated Flash ID for reproducibility. Recorded as an open decision;
  the default is left unchanged pending team approval.
- **Pricing is approximate/dated.** Google's public pricing page still prominently lists
  Gemini **2.5** Flash at `$0.30`/`$2.50`; third-party trackers put the current 3.x Flash tier
  near `$1.50`/`$9.00`, which is what `.env.example` uses for the cost estimate. Cost figures
  above are therefore ballpark and must not be presented as a measured/guaranteed rate.
- **`gemini-embedding-001` is GA:** 3,072 default dimensions (also 1,536 / 768 via Matryoshka
  truncation), 2,048-token max input, `$0.15`/M input, 100+ languages.
- **`text-embedding-004` is retired.** Its deprecation date (2026-01-14) has passed; a live
  request returns **404 NOT_FOUND**. It was still listed as the Gemini "lower cost" embedding
  option in the shipped catalog, so VALIDATE-01 removed it from
  `apps/desktop/src/shared/aiCatalog.ts` — `gemini-embedding-001` is now Google's only current
  text-embedding model and the sole Gemini embedding choice.
- **Data handling caveat (unchanged).** Google's Gemini *developer* API uses free-tier inputs
  to improve products; paid-tier inputs are not used for training. Chronicle sends image and
  text inputs to the provider on the BYOK path, so demo copy must say the *creative library*
  stays local while naming the AI-inference exception — never claim zero retention.

**Verdict:** both shipped defaults are **suitable and validated for the demo** on the current
BYOK path. Two items need team sign-off (tracked as open decisions): (1) whether to keep the
moving `gemini-flash-latest` alias or pin a dated Flash ID before the demo, and (2) formal
approval of provider/retention/cost/budget assumptions. Configuration was left unchanged; only
the confirmed-retired `text-embedding-004` catalog entry was removed.

Sources:
[Gemini API models & `-latest` aliases](https://ai.google.dev/gemini-api/docs/models) ·
[Gemini API pricing](https://ai.google.dev/gemini-api/docs/pricing) ·
[Gemini embeddings (dimensions, GA)](https://ai.google.dev/gemini-api/docs/embeddings) ·
[Gemini Embedding GA announcement](https://developers.googleblog.com/gemini-embedding-available-gemini-api/) ·
[text-embedding-004 deprecation (2026-01-14)](https://github.com/simonw/llm-gemini/issues/102)

### Windows Packaging, Versions, and Release Automation (MVP-12, 2026-07-21)

- Electron's `app.getVersion()` reads the packaged app's `package.json`, and electron-builder uses
  that same version for installer macros. Chronicle therefore treats
  `apps/desktop/package.json` as the desktop product's only authored version source; the sidebar,
  installation registration, artifact name, and release tag derive from it. The independently
  deployed AI and control-plane packages keep independent `pyproject.toml` versions. An HTTP
  `/api/v1` prefix is a compatibility generation, not a deployment version.
  ([Electron app API](https://www.electronjs.org/docs/latest/api/app),
  [electron-builder publish guide](https://www.electron.build/docs/publish/))
- GitHub distinguishes caches from workflow artifacts: installer binaries belong in artifacts,
  while npm/pip download state belongs in caches. Chronicle runs required CI only for PRs whose
  base is `main`, then builds the unsigned installer once from the reviewed release tag.
  ([GitHub workflow artifacts](https://docs.github.com/en/actions/concepts/workflows-and-actions/workflow-artifacts),
  [Node CI guidance](https://docs.github.com/en/actions/tutorials/build-and-test-code/nodejs))
- GitHub documents that a job skipped by a job-level `if` reports success even when it is required,
  whereas skipping an entire required workflow with path/branch filtering can leave its check
  pending. Chronicle therefore keeps Main PR CI triggered, retains the existing Desktop check as a
  version-only gate for labeled Release Please PRs, and skips only the irrelevant service jobs.
  ([GitHub job conditions](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/control-jobs-with-conditions),
  [GitHub skipped workflow checks](https://docs.github.com/en/actions/how-tos/manage-workflow-runs/skip-workflow-runs))
- Release Please turns Conventional Commit history into a reviewed version/changelog PR; merging
  that PR creates the tag/release. Its documentation confirms that a separate PAT is needed when
  Action-created PRs must trigger another workflow, because events created with the built-in
  `GITHUB_TOKEN` do not recursively trigger Actions. Chronicle therefore requires a fine-grained
  `RELEASE_PLEASE_TOKEN` rather than silently bypassing protected-branch CI.
  ([Release Please Action](https://github.com/googleapis/release-please-action))
- Local packaging evidence: a clean Python 3.12 environment built the PyInstaller Gemini sidecar
  in about 70 seconds (25.2 MB); both the raw executable and the copy inside Electron resources
  returned `/health` with `chronicle-ai` version `0.1.0`. electron-builder then produced a 135 MB
  unsigned NSIS installer. Building against a polluted global Python environment spent more than
  ten minutes inspecting unrelated installed packages, so clean, declared build environments are
  a reproducibility requirement, not merely a CI speed optimization.

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
- Treat provider configuration as a tested capability, not trusted text: require the BYOK key,
  probe the selected task through the loopback service before saving, preserve the last working
  configuration on failure, and disclose that the minimal probe is a real provider call.
- ~~Keep Docling on the roadmap slide for PDF/PPTX~~ — **superseded first on 2026-07-16
  and finalized on 2026-07-19**: documents remain out, and the selected future formats are
  SVG, BLEND, OBJ, STEP/STP, PSD, and PSB. The IBM alignment story stays via watsonx/Granite
  as the model-agnostic swap.
- Minimal, clear, documented code — judges are told to reward "well-structured"; the README is a judged artifact, treat it as a feature.
- For the desktop UI, use a neutral-gray, dark-first palette with IBM blue reserved for primary actions and focus. IBM's public design language recommends gray-dominant product interfaces, blue as the primary action color, paired dark/light themes, and WCAG contrast checks.
- Keep product navigation in one persistent left shell and use short “productive” motion only to clarify page changes. Carbon presents the UI shell as the stable orientation layer and describes efficient motion as a way to move users forward, not decoration.
- Treat the desktop title bar as functional window chrome, not spare canvas. Keep the app identity at the leading edge, preserve native caption controls, and leave unused space draggable. Add a centered global search/command field only when it provides real app-wide functionality; Microsoft recommends a 48 px title bar when global search is present.
- Make Chronicle's title bar follow the selected light/dark mode and blend with the adjacent app surface. A permanently dark shell inside a light theme is a valid Carbon high-contrast pattern, but it is best reserved for a substantial navigation shell or deliberate workflow emphasis. Chronicle's bar contains only identity and native window controls, so theme-matched chrome is quieter, more platform-consistent, and avoids making the bar look accidentally left behind in light mode. Theme the Electron overlay background and caption-symbol colors together with the rendered bar.
- Design the Windows app icon independently from the in-product logo lockup: start on a 48 px grid, use a bold transparent silhouette with no more than two metaphors, and judge it first at the 24 px Windows 11 taskbar size. Avoid a dark plate plus multiple translucent outlines—the plate merges into a dark taskbar and the outlines collapse into a generic nested-screen glyph. Prefer a restrained monochrome or analogous palette with dark, medium, and light values; ensure at least half the icon reaches 3:1 contrast on both light and dark contexts, and export exact 16/24/32/48/256 px resources.
- Self-host Google Material Symbols SVGs so the desktop UI remains offline-capable. The future Google sign-in control uses the standard-color “G” and approved “Continue with Google” wording; do not improvise or recolor the brand mark.
- For format expansion, prefer an adapter pipeline of **safe extraction → normalized preview /
  structure diff → LangChain annotation**. Do not send opaque project bytes to a model and hope
  it understands a proprietary container.
- For future-format work, follow the selected order: SVG and PSD/PSB adjacency experiments,
  then a sandboxed Blender proof of concept, followed by OBJ and STEP/STP interchange support.
- Keep control-plane operations purpose-separated in contracts and UI: installation registration,
  portable settings sync, encrypted-key sync, and usage statistics are not one blanket consent.
  Use strict allowlisted schemas, client-generated idempotency IDs, short raw-event retention, and
  aggregate admin views. Never claim “all data stays local”; say precisely that the creative
  library stays local and name the AI, telemetry, settings, and encrypted-secret exceptions.
- Demonstrate release discipline as technical-execution evidence: one authored desktop version,
  generated/runtime derivations, protected `main` PR checks, a clean Windows build, and a
  health-smoked sidecar. Do not imply the unsigned build is signed or auto-updating. Keep the
  validated Gemini provider plus the UI-promised OpenAI and Anthropic integrations in the MVP
  installer. Keep using an isolated build environment and frozen-import smoke because the measured
  provider breadth increases sidecar size and clean analysis time.

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
- 2026-07-19 — AI FEATURE SCOPE DECISION (surface amended 2026-07-21): MVP inference operations are (1) version diff annotation, (2) first-version description (same `annotate` operation with `previous: null`), and (3) **text** embeddings for versions and search queries. Service surface: `POST /annotate`, `POST /embed-text`, `POST /validate-provider-model`, and `GET /health`; the validation route is a configuration guard, not a fourth inference feature. The annotation schema includes optional nullable `confidence` (0–1). **Image embeddings** and a **history chatbot** remain roadmap — team
- 2026-07-19 — AI IMPLEMENTATION FINDING: LangChain's current Python API provides neutral `init_chat_model` and `init_embeddings` factories, async embedding methods, structured output, and standard base64 image content blocks. Chronicle uses those library-native seams rather than provider wrappers. Provider integration packages remain separate dependencies, so the demo provider package must be installed explicitly. Live provider quality/cost/privacy evaluation remains open because no BYOK credential was available during automated implementation — [LangChain models](https://docs.langchain.com/oss/python/langchain/models), [embedding reference](https://reference.langchain.com/python/langchain/embeddings/base/init_embeddings)
- 2026-07-19 — AI LIVE ACCEPTANCE: Gemini `gemini-flash-latest` correctly described the controlled first-version fixture and identified the two added magenta ellipses in the diff fixture. Its first response used multi-word tags with spaces, exposing a C3 mismatch; prompt v0.1.1 now explicitly requires lowercase hyphenated slugs, and both reruns validated successfully. `gemini-embedding-001` returned a 3,072-dimension text vector. The full temporary flow (capture → queue → loopback FastAPI → provider → annotation persistence → embedding queue → vector persistence) passed. BYOK stayed process-local/per-request and no key appeared in output; provider-side retention/privacy and exact per-call cost were not independently verified, so demo copy must not claim zero retention or a measured cost — team live test
- 2026-07-21 — TITLE-BAR THEME DECISION: Chronicle's minimal identity/window-control title bar should switch with light/dark mode. Microsoft says title-bar colors should adapt to theme and recommends blending the title bar with the window; Windows theme guidance says a fully themed app surface follows the selected mode. Carbon permits a contrasting Gray 100 shell in a light product as an intentional high-contrast moment, but that exception better fits a functional navigation shell than Chronicle's otherwise empty chrome. Electron exposes both overlay `color` and `symbolColor`, which must change together — [Microsoft title bar design](https://learn.microsoft.com/en-us/windows/apps/design/basics/titlebar-design), [Windows light/dark themes](https://learn.microsoft.com/en-us/windows/apps/desktop/modernize/ui/apply-windows-themes), [Carbon color and inline theming](https://carbondesignsystem.com/elements/color/usage/), [Electron custom title bar](https://www.electronjs.org/docs/latest/tutorial/custom-title-bar)
- 2026-07-21 — C1 CONTRACT DECISION (MVP-06): `TrackedFolder` extended from `{ id, path, addedAt }` to add presentation fields `displayName`, `icon`, `color`, so a tracked folder is the UI "project" without a separate grouping layer. New C1 methods: `pickFolder()` (native picker, no side effect), `addFolder(path, meta?)` (was a no-arg picker), `updateFolder(id, patch)`. SQLite gains an idempotent column migration (`user_version` 1→2). The renderer was moved off `demoData.ts` onto live C1 hooks — human-approved crossing of the C1/main boundary for this task — team + session
- 2026-07-21 — C1 CONTRACT DECISION (MVP-06 folder selection): `TrackedFolder` gained `excludedPaths` (absolute paths the watcher must skip) and `allowedExtensions` (enabled extension set; empty stored value = all supported), plus a read-only `scanFolder(path)` returning supported files with sizes for the New Project preview. Selection is **enforced persistently**: the capture wiring resolves each candidate's owning tracked folder and skips excluded paths / disabled types on both the initial scan and live saves (not just at import time) — chosen because a deselected file that recaptured on next save would defeat the purpose. Idempotent SQLite migration `user_version` 2→3 adds the two JSON columns. Renderer New Project screen shows a subfolder/file tree with select-all + file-type toggles and a live "N files will be tracked" count; custom letter/emoji icons now inherit the chosen accent color — team + session
- 2026-07-21 — C1/C5 CONTRACT DECISION (MVP-06 per-provider BYOK): BYOK keys are now stored **one per provider** instead of a single global key, so a task's provider can be switched without re-entering credentials (e.g. Gemini for annotation, OpenAI for embeddings). C1 `setApiKey`/`clearApiKey` take a `provider` argument and `hasApiKey()` is replaced by `configuredProviders(): string[]`; the safeStorage secret store is provider-scoped (`secret:ai-api-key:<provider>`) with a one-time migration of legacy keys to the default LangChain provider id (`google_genai`); the AI worker resolves the key for each task's selected provider; `getAppStatus.aiConfigured` now means the annotation provider is set AND has a saved key. Settings renders a key row per provider; `.env.example` documents provider-native env vars for the standalone service. Keys remain write-only over IPC and never enter `getSettings()` — team + session
- 2026-07-21 — AI PROVIDER/MODEL UX DECISION (MVP-06, amended): Settings ships predefined providers **Google Gemini · Anthropic Claude · OpenAI**, each with a curated 2–3 model shortlist per supported task (vision annotation vs. text embeddings) spanning a quality/price range; a **Developer mode** toggle allows free-text provider/model. Amazon Bedrock was removed because Chronicle's one-secret-per-provider BYOK contract cannot represent AWS access key + secret + region credentials. This is renderer presentation policy only — the engine stays model-agnostic (spec §6.4). `DEFAULT_SETTINGS` defaults to Google Gemini (`gemini-flash-latest` / `gemini-embedding-001`, the validated demo provider) as configuration, not code. Model IDs are illustrative and BYOK-dependent; availability is the user's account's responsibility — team + session
- 2026-07-21 — PROJECT METADATA/EDITING DECISION (MVP-06): tracked-folder projects gain an optional persisted `description` (`user_version` 3→4). A dedicated Edit Project route reuses the creation form for name, description, icon, color, enabled file types, and ignored files; it rescans the existing folder while keeping the path locked. Descriptions appear on project cards and details — team + session
- 2026-07-21 — DEMO FIXTURE DECISION (DEMO-01): the public test pack uses three deterministic, original image stories (logo navy→teal→tagline removed; banner 40%→50%→purple/limited-time copy; product gray→green→NEW badge). Untouched variants are committed under `demo-assets/sources/`, while the watched `workspace/` and version state are ignored. Everyday reset/set/next/status commands require no Pillow, keeping clean-clone demo setup reproducible — team + session
- 2026-07-21 — CONTROL-PLANE DATA DECISION (POST-03/04): sync portable settings except device-local paths/project metadata; offer separate signed-in, explicit, end-to-end-encrypted API-key sync; best-effort register every local/signed-in installation with a random non-hardware ID; collect default-enabled content-free telemetry for project/file/version/file-type and AI/search usage. Project/installation IDs remain pseudonymous, counts must not be called unique-user counts, and the default-enabled toggle is not affirmative consent. Google auth uses system-browser PKCE, stable `sub`, minimal scopes, and no stored Google API tokens — team + official Google OIDC/OAuth guidance and GDPR Article 5
- 2026-07-21 — GOOGLE DESKTOP AUTH UX DECISION (POST-03): retain the operating system's default external browser (Chrome only when it is the user's default), not a small Electron `BrowserWindow`/webview. Google requires desktop installed apps to open the system browser with a loopback redirect and prohibits developer-controlled embedded user-agents; RFC 8252 gives the same guidance and notes the security/session/accessibility benefits. Chronicle performs a short API-health preflight before opening Google, gives the user an explicit retry after an unreachable API, and converts timeout/cancellation/IPC failures into concise inline product messages — [Google desktop OAuth](https://developers.google.com/identity/protocols/oauth2/native-app), [Google OAuth policy](https://developers.google.com/identity/protocols/oauth2/policies), [RFC 8252](https://datatracker.ietf.org/doc/html/rfc8252)
- 2026-07-21 — WINDOWS APP-ICON FINDING: Chronicle's plated outline mark becomes a tiny nested-monitor glyph on the dark Windows taskbar; its dark tile merges with the shell and the green clock hand disappears. Microsoft recommends a simple singular form, at most two metaphors, a balanced 48 px grid silhouette, minimal gradients/opacity treatments, detail only on the prominent layer, and explicit exact-size exports (taskbar is 24 px at 100% scaling). At least half the icon should reach 3:1 contrast across light and dark contexts; transparent backgrounds and optional theme-specific assets are preferred. Six non-production SVG/PNG/ICO concepts plus an exact-scale comparison board live in `packages/brand/concepts/taskbar-exploration/` — [Windows app-icon design](https://learn.microsoft.com/en-us/windows/apps/design/iconography/app-icon-design), [Windows icon construction and sizes](https://learn.microsoft.com/en-us/windows/apps/design/iconography/app-icon-construction)
- 2026-07-21 — AI CONFIGURATION VALIDATION DECISION: both AI task selectors require a saved provider key before Save is enabled. A changed provider/model is probed through the loopback service with the real task path (one-pixel structured vision or a short embedding); rejected/unreachable configurations are not persisted, selectors return to the previous values, and IPC implementation prefixes are removed from user-facing errors. These probes can incur a tiny provider charge and must be described honestly. Developer-mode pairs remain model-agnostic and are judged by the live probe rather than a static allowlist — team + session
- 2026-07-21 — SEMANTIC INDEX COMPATIBILITY FIX: embedding rows and query lookup now share a provider-qualified `provider:model` identity. Changing either embedding selector queues existing annotation text for deduplicated asynchronous re-embedding without rerunning vision analysis; keyword search remains available while reindexing or provider calls are unavailable — team + session
- 2026-07-21 — CATALOG PROVIDER AUDIT (VALIDATE-01, amended): documentation-checked the non-default curated providers against current provider docs (no keys for live probes). Anthropic entries (`claude-haiku-4-5`/`claude-sonnet-5`/`claude-opus-4-8`) are current and vision-capable; empty Anthropic embeddings list is correct (no Anthropic embeddings API). OpenAI's GPT-4o family was superseded by the GPT-5.6 tiers, so chat entries were refreshed to `gpt-5.6-luna`/`gpt-5.6-terra`/`gpt-5.6-sol` (`text-embedding-3-small`/`-large` remain current). Bedrock models were evaluated but the provider was removed rather than presented as BYOK-compatible: AWS requires multiple credential fields plus region instead of Chronicle's single encrypted provider key. The retained models stay illustrative/BYOK-dependent and are live-probed before persistence — [OpenAI models](https://developers.openai.com/api/docs/models), [LangChain AWS/Bedrock authentication](https://docs.langchain.com/oss/python/integrations/chat/bedrock), Claude API model reference — team + session
- 2026-07-21 — DEFAULT PROVIDER VALIDATION (VALIDATE-01): re-probed the shipped Gemini defaults live against the demo fixtures (langchain-google-genai 4.2.2 / google-genai 1.75.0). `gemini-flash-latest` produced correct first-version and diff annotations with working image input and structured output (≈6–7 s, ≈$0.007–0.011/call at $1.50/$9 per-M); `gemini-embedding-001` returned 3,072-dim vectors with correct semantic ranking ($0.15/M). Invalid-key, unknown-model, and a 429-rate-limited `gemini-pro-latest` all failed gracefully as provider errors with no key leak. Findings: `gemini-flash-latest` is a hot-swapped moving alias (2-week breaking-change notice; now a Gemini 3.x Flash) so pinning a dated ID for the demo is an open decision; pricing is approximate/dated; `text-embedding-004` is retired (live 404) and was removed from the catalog. Defaults judged suitable; only the retired catalog entry was changed — configuration and both-default approval remain a team sign-off — team live test + [Gemini models](https://ai.google.dev/gemini-api/docs/models), [pricing](https://ai.google.dev/gemini-api/docs/pricing), [embeddings](https://ai.google.dev/gemini-api/docs/embeddings), [text-embedding-004 deprecation](https://github.com/simonw/llm-gemini/issues/102)
- 2026-07-21 — MVP-12 PACKAGING/RELEASE FINDING: established independent desktop/AI/control-plane versions, `package.json`-derived desktop display/installer/tag values, PR-only required CI for `main`, per-merge Windows artifacts, and reviewed Release Please version PRs. A clean Python 3.12 PyInstaller build produced a 25.2 MB Gemini sidecar; its raw and packaged-resource health probes passed; electron-builder produced a 135 MB unsigned NSIS installer. Polluted global Python made dependency analysis exceed ten minutes, validating isolated declared build environments. Additional installed provider packs, signing, macOS, and in-app auto-update remain future work — team implementation + official Electron/electron-builder/GitHub/Release Please sources linked above
- 2026-07-21 — MVP-12 CI OPTIMIZATION (supersedes per-merge artifact policy above): full Desktop/AI/control-plane CI remains mandatory for ordinary PRs to `main`; a labeled Release Please PR reuses the required Desktop check for package/lock/manifest/service-contract version consistency and job-level-skips the unchanged service suites; installer packaging runs once from the created release tag. Intermediate Windows snapshots remain manually dispatchable. This removes two redundant installer builds per release cycle without using workflow-level path filters that can strand required checks as pending — team + official GitHub job-condition/skipped-check guidance linked above
- 2026-07-22 — MACOS PACKAGING FOLLOW-UP: tagged releases now build native PyInstaller sidecars and electron-builder installers in parallel on Windows x64 and a pinned macOS 15 Apple Silicon runner; manual snapshot dispatch does the same. The DMG is deliberately unsigned and unnotarized, so it is a test/distribution artifact rather than a frictionless public Mac release; Intel packaging, Apple signing/notarization, and auto-update remain separate work.
- 2026-07-21 — MULTI-PROVIDER PACKAGING/PERFORMANCE: the frozen Windows sidecar now imports Gemini, OpenAI, and Anthropic successfully and passes `/health`; it grew from 25.2 MB to 30.0 MB, while the unsigned installer grew from about 135 MB to 139.7 MB. A clean warm build measured 6.5 seconds for PyInstaller and about 7 seconds for Vite inside a 255.7-second `make package`, showing Electron staging/NSIS creation—not bundling every globally installed Python module—is the dominant repeat cost; `make package-unpacked` measured 177.7 seconds. Packaging now uses a cached isolated provider-only environment and avoids duplicate native rebuilding. Bedrock was removed because its AWS credential set/region does not fit Chronicle's single-key BYOK contract — team local measurement + official LangChain provider and electron-builder lifecycle guidance
- 2026-07-21 — ZERO-TOUCH RELEASE PROMOTION: GitHub auto-merge waits for required checks/reviews, while PR authors cannot satisfy their own required approval. Chronicle therefore preserves all three protected-main checks but uses zero required approvals for the solo workflow; a no-checkout `pull_request_target` coordinator enables auto-merge only for the same-repository `dev` head or a correctly labeled Release Please branch. It uses the release PAT so follow-on push workflows run, validates a releasing `feat:`/`fix:` squash title, and deletes only the merged temporary release branch. Teams can restore required approvals, which intentionally reintroduces a manual gate — [GitHub auto-merge](https://docs.github.com/en/pull-requests/collaborating-with-pull-requests/incorporating-changes-from-a-pull-request/automatically-merging-a-pull-request), [required reviews](https://docs.github.com/en/pull-requests/collaborating-with-pull-requests/reviewing-changes-in-pull-requests/approving-a-pull-request-with-required-reviews), [GitHub CLI merge](https://cli.github.com/manual/gh_pr_merge)
