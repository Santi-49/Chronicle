# ai

AI version comparison via LangChain — model-agnostic, default classes/methods only.
Generates per version: what changed, short summary, searchable tags, embeddings.
BYOK path runs here; otherwise requests route through the control-plane gateway.

# Chronicle AI Module

This folder contains Chronicle's AI annotation pipeline. Its purpose is to turn a newly captured image version into a clear, structured explanation of what changed.

The module is intentionally isolated so that Electron does not need to know how Gemini, prompts, image encoding, or response validation work.

> Current implementation decision: the AI pipeline is written in Python and is called from Electron through a small JSON CLI bridge. This is an MVP choice. The rest of Chronicle remains Electron + React + TypeScript.

## Product Goal

Chronicle watches creative folders and captures every saved PNG/JPG version. For each captured version, this module should:

1. Describe the first version of an asset.
2. Compare later versions against the immediately previous version.
3. Produce a short human-readable summary.
4. Return a structured list of meaningful visual changes.
5. Generate searchable lowercase tags.
6. Never block the Electron UI while the AI request is running.

The AI should explain semantic changes such as:

- "The logo moved from the center to the top-left."
- "The background changed from dark blue to teal."
- "The tagline was removed and the layout became more minimal."

It should not behave like a raw pixel-diff tool. Deterministic image comparison may be added later to support the model, but Gemini is responsible for the human-readable explanation.

## Folder Structure

```text
ai/
├── __init__.py
├── schemas.py
├── image_loader.py
├── gemini_engine.py
├── compare_images.py
├── cli.py
├── README.md
└── tests/
    ├── __init__.py
    └── test_compare_images.py
```

## File Responsibilities

### `schemas.py`

Defines the validated input and output contracts using Pydantic.

Main models:

- `CompareImagesInput`: request received by the AI module.
- `VersionAnnotation`: structured result returned to Chronicle.

Expected output shape:

```json
{
  "summary": "The logo moved to the right and the background was simplified.",
  "changes": [
    "Logo moved from the center to the right",
    "Background details were removed"
  ],
  "tags": ["logo", "layout", "minimal"]
}
```

### `image_loader.py`

Validates and loads local image files.

Responsibilities:

- Accept PNG, JPG, and JPEG files only.
- Check that the path exists and points to a file.
- Read the image as bytes.
- Return the MIME type and image data.
- Raise clear errors for missing or unsupported files.

This file must not call Gemini.

### `gemini_engine.py`

Contains the only direct integration with LangChain and Gemini.

Responsibilities:

- Configure the Gemini model.
- Read the API key securely from the caller or environment.
- Convert image bytes to the multimodal message format.
- Send the prompt and images in the correct order.
- Request structured output matching `VersionAnnotation`.
- Return a validated result.

Image order for comparisons must always be:

```text
1. Previous version
2. Current version
```

The API key must never be hardcoded or committed.

### `compare_images.py`

Orchestrates the complete AI workflow.

Responsibilities:

1. Validate the request with `CompareImagesInput`.
2. Load the current image.
3. Load the previous image when present.
4. Select first-version or comparison behavior.
5. Load the project prompt.
6. Call `GeminiEngine`.
7. Validate and return `VersionAnnotation`.

This is the main application-level function. Other Chronicle components should call this layer instead of calling Gemini directly.

### `cli.py`

Provides the temporary Electron-to-Python bridge.

Responsibilities:

- Read one JSON request from standard input.
- Call the comparison workflow.
- Write one valid JSON response to standard output.
- Write logs and errors to standard error.
- Return a non-zero exit code on failure.

Important rule: `stdout` must contain JSON only. Debug messages must never be printed to `stdout`, because Electron will parse it.

Example input:

```json
{
  "file_name": "poster.png",
  "previous_image_path": "C:/chronicle/poster-v1.png",
  "current_image_path": "C:/chronicle/poster-v2.png"
}
```

For the first captured version, `previous_image_path` may be omitted or set to `null`.

### `tests/`

Contains automated tests for the AI module.

Tests should:

- Validate correct and incorrect schema data.
- Test missing and unsupported image files.
- Test first-version behavior.
- Test two-version comparison behavior.
- Mock `GeminiEngine` instead of making paid API calls.
- Verify that CLI output is valid JSON.

Real Gemini calls should not run in the normal test suite.

## End-to-End Flow

```text
Folder watcher captures a new version
            ↓
Electron creates an AI annotation job
            ↓
Electron sends JSON to cli.py
            ↓
compare_images.py validates the request
            ↓
image_loader.py loads the image files
            ↓
gemini_engine.py sends prompt + images to Gemini
            ↓
schemas.py validates VersionAnnotation
            ↓
cli.py returns JSON to Electron
            ↓
Electron stores the annotation in SQLite
            ↓
UI receives annotationUpdated event
```

## First Version vs Later Versions

### First version

When there is no previous image, the model should describe the current asset:

- Main visual content.
- Composition and layout.
- Important text when readable.
- Style, colors, and notable elements.
- Useful search tags.

It must not invent changes because no comparison exists.

### Later versions

When both images are present, the model should focus on differences:

- Added or removed elements.
- Movement or resizing of elements.
- Text changes.
- Color and styling changes.
- Layout and hierarchy changes.
- Simplification or increased complexity.

It should avoid repeating unchanged details unless they are necessary for context.

## Prompt Source

The shared production prompt should live outside the Python implementation, preferably at:

```text
packages/prompts/version-annotation.md
```

Do not duplicate the full prompt across multiple Python files. The orchestrator should load it from one canonical location.

## Dependencies

Minimum Python dependencies:

```bash
pip install pydantic langchain-google-genai
```

Development dependencies may include:

```bash
pip install pytest pytest-asyncio
```

## Configuration

Gemini credentials must come from a secure source.

For local development, an environment variable may be used:

```bash
GEMINI_API_KEY=your_key_here
```

For the desktop product, secrets should be managed by the Electron main process and never exposed to the renderer, committed to Git, written into settings JSON, or printed in logs.

## Error Handling Rules

The module must fail clearly and predictably for:

- Missing current image.
- Unsupported image format.
- Invalid input JSON.
- Missing API key.
- Gemini timeout or provider error.
- Invalid structured model output.

Errors returned to Electron should be machine-readable and safe for display. Internal stack traces and secrets must not be included in user-facing output.

## MVP Scope

Included:

- PNG, JPG, and JPEG.
- First-version descriptions.
- Previous-vs-current visual comparison.
- Gemini through LangChain.
- Structured summary, changes, and tags.
- JSON CLI bridge.
- Unit tests with a mocked model.

Not included in the MVP:

- CAD, STEP, DWG, PSD, video, or 3D comparison.
- Pixel-perfect measurement.
- Local vision models.
- Cloud file storage.
- Direct database writes from Python.
- Direct UI communication from Python.

Electron remains responsible for version capture, job scheduling, SQLite persistence, retries, and UI events.

## Definition of Done

The module is complete when:

- A valid first-version request returns a validated description.
- A valid comparison request returns meaningful structured changes.
- Invalid paths and formats produce clear errors.
- Gemini is accessed only through `gemini_engine.py`.
- Electron can call the CLI and parse its JSON response reliably.
- Tests pass without requiring a real API key.
- No secret or image content is stored outside the local Chronicle workflow.

## Development Principle

Keep each layer focused:

```text
schemas.py        = data contracts
image_loader.py   = local image loading
gemini_engine.py  = model provider integration
compare_images.py = workflow orchestration
cli.py            = Electron/Python transport
```

Do not mix these responsibilities. This separation allows the team to replace Gemini, remove the Python bridge, or add deterministic comparison later without rewriting the whole feature.