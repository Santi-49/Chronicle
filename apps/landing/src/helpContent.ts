export type HelpCategory = "Start here" | "Install" | "AI & costs" | "Privacy" | "Troubleshooting" | "FAQ";

export interface HelpSection {
  id: string;
  title: string;
  html: string;
}

export interface HelpArticle {
  slug: string;
  title: string;
  description: string;
  category: HelpCategory;
  updated: string;
  minutes: number;
  keywords: string[];
  sections: HelpSection[];
  related: string[];
}

const officialDownload = "https://github.com/Santi-49/Chronicle/releases/latest";
const issues = "https://github.com/Santi-49/Chronicle/issues";

export const helpArticles: HelpArticle[] = [
  {
    slug: "getting-started",
    title: "Set up Chronicle and save your first version",
    description: "A calm, step-by-step path from download to a searchable, restorable creative-file history.",
    category: "Start here",
    updated: "July 27, 2026",
    minutes: 8,
    keywords: ["first run", "continue local", "project", "watched folder", "PNG", "JPG", "setup", "timeline", "gallery", "list view", "subfolder"],
    related: ["install/windows", "install/mac", "ai/costs", "troubleshooting/capture-files"],
    sections: [
      {
        id: "before-you-start",
        title: "Before you start",
        html: `<p>Chronicle works without an account and without AI. You can begin with <strong>Continue local</strong>, capture versions, search filenames and notes, and restore work on your device.</p>
        <div class="help-callout"><strong>You need</strong><p>A Windows x64 PC or Apple Silicon Mac, one folder containing creative work, and a supported file. PNG and JPG are the safest formats for your first walkthrough.</p></div>`,
      },
      {
        id: "install",
        title: "1. Download and install Chronicle",
        html: `<ol><li>Open the <a href="${officialDownload}">official Chronicle release page</a>.</li><li>Download the Windows installer or the Apple Silicon Mac DMG.</li><li>Open the download and follow the installer.</li></ol>
        <p>The current installers are not digitally signed. First, make sure your download came from the <a href="${officialDownload}">official Chronicle GitHub Releases page</a> and that its version matches the release. You can then bypass the expected trust warning by following the <a href="/help/install/windows/">Windows instructions</a> or <a href="/help/install/mac/">Mac instructions</a>. Do not continue if your computer reports malware or the download came from another source.</p>`,
      },
      {
        id: "choose-entry",
        title: "2. Choose how to enter",
        html: `<p>Select <strong>Continue local</strong> for the quickest start. Your creative history remains on this computer. Sign-in is optional and adds account-backed features; it never unlocks the core versioning workflow.</p>`,
      },
      {
        id: "add-folder",
        title: "3. Choose a folder to watch",
        html: `<ol><li>Select <strong>New project</strong>.</li><li>Choose the folder where you normally save creative work.</li><li>Review the files Chronicle found.</li><li>Leave PNG and JPG enabled for this first test, then create the project.</li></ol>
        <div class="help-callout help-callout--tip"><strong>Use a normal local folder first</strong><p>Cloud-synced folders can save files in unusual ways. Test with a folder in Documents or Pictures before adding OneDrive, Dropbox, or a network drive.</p></div>`,
      },
      {
        id: "first-version",
        title: "4. Capture the first version",
        html: `<ol><li>Open a PNG or JPG from the watched folder in your usual creative app.</li><li>Make a visible change and save normally.</li><li>Return to Chronicle. A new version should appear after the file finishes saving.</li><li>Open the asset to see its Timeline.</li></ol>
        <p>The project screen shows your four most recently changed files first, then the project's own folders. Open a folder to go deeper, use the breadcrumb at the top to come back, and switch between gallery and list layout with the toggle beside the file list. Chronicle remembers the layout you prefer.</p>
        <figure class="help-figure"><img src="/chronicle-home.png" width="1440" height="900" alt="Chronicle desktop interface showing a creative project and its version history" loading="lazy"><figcaption>Your exact layout may differ slightly by release.</figcaption></figure>`,
      },
      {
        id: "ai",
        title: "5. Add AI only if you want it",
        html: `<p>AI change summaries and meaning-based search require an internet connection and your selected provider. Open <strong>Settings → AI summaries</strong>, save a key under <strong>Provider API keys</strong>, then choose a provider and model for <strong>Change summaries (vision)</strong> and for <strong>Semantic search (embeddings)</strong>.</p>
        <p>Provider validation makes a small real request and may incur a small charge. If you skip AI, Chronicle continues capturing versions and keyword search remains available.</p>`,
      },
      {
        id: "check",
        title: "6. Check search and restore",
        html: `<ol><li>Search for the filename or a phrase from the version description.</li><li>Open a result and select an older version.</li><li>Use <strong>Save a copy</strong> when you only want to inspect it.</li><li>Use restore only after checking the destination. Chronicle preserves history, but keeping a copy is the least surprising first test.</li></ol>`,
      },
    ],
  },
  {
    slug: "install/windows",
    title: "Install Chronicle when Windows shows a red or blue warning",
    description: "Why “Windows protected your PC” appears, when Run anyway is appropriate, and when you should stop.",
    category: "Install",
    updated: "July 26, 2026",
    minutes: 4,
    keywords: ["red screen", "blue screen", "Windows protected your PC", "SmartScreen", "unknown publisher", "More info", "Run anyway", "exe"],
    related: ["getting-started", "troubleshooting/updates", "install/mac"],
    sections: [
      {
        id: "why",
        title: "Why Windows shows this screen",
        html: `<p>The current Chronicle installer is not digitally signed. Microsoft Defender SmartScreen cannot confirm a trusted publisher, so it warns before opening the <code>.exe</code>.</p>
        <div class="help-callout help-callout--warning"><strong>This is a trust warning, not a Chronicle crash</strong><p>It does not automatically mean the file is harmful, but it is not proof that the file is safe either. Continue only when you intentionally downloaded Chronicle from the official release page.</p></div>`,
      },
      {
        id: "open",
        title: "Open the expected Chronicle installer",
        html: `<ol><li>Confirm the download came from the <a href="${officialDownload}">official Chronicle release page</a>.</li><li>Confirm its name begins with <strong>Chronicle-Setup-</strong> and the version matches the release.</li><li>On “Windows protected your PC,” select <strong>More info</strong>.</li><li>Check that the app shown is the Chronicle installer. “Unknown publisher” is expected for the current unsigned release.</li><li>Select <strong>Run anyway</strong>.</li></ol>`,
      },
      {
        id: "stop",
        title: "When you should stop",
        html: `<ul><li><strong>Run anyway is missing:</strong> Smart App Control or an organization policy may be enforcing the block. Use a personal device, ask your administrator, or wait for a signed release.</li><li><strong>Windows reports malware or quarantines the file:</strong> do not bypass the alert. Delete the download and <a href="${issues}">tell the Chronicle team</a>.</li><li><strong>The filename or source is different:</strong> do not open it. Download again from the official page.</li></ul>
        <p>Do not switch off Windows Security, SmartScreen, antivirus, or Smart App Control just to install Chronicle.</p>`,
      },
      {
        id: "source",
        title: "Official Windows guidance",
        html: `<p>Microsoft explains how unsigned downloads begin without publisher reputation in its <a href="https://learn.microsoft.com/en-us/windows/apps/package-and-deploy/smartscreen-reputation">SmartScreen reputation guidance</a>. Microsoft also states that <a href="https://support.microsoft.com/en-US/Windows/Security/Threat-Malware-Protection/smart-app-control-frequently-asked-questions">Smart App Control has no per-app bypass</a>.</p>`,
      },
    ],
  },
  {
    slug: "install/mac",
    title: "Open Chronicle when macOS cannot verify the developer",
    description: "A safe, per-app Gatekeeper override for the current unsigned and unnotarized Mac release.",
    category: "Install",
    updated: "July 26, 2026",
    minutes: 4,
    keywords: ["Mac", "macOS", "unidentified developer", "cannot verify", "malicious software", "Gatekeeper", "Open Anyway", "DMG"],
    related: ["getting-started", "install/windows", "troubleshooting/updates"],
    sections: [
      {
        id: "why",
        title: "Why macOS blocks the first launch",
        html: `<p>The current Chronicle DMG is not signed with an Apple Developer ID or notarized by Apple. Gatekeeper therefore cannot verify the developer in the normal way.</p>
        <div class="help-callout help-callout--warning"><strong>Only continue with an expected download</strong><p>Apple warns that overriding this protection can expose a Mac to harmful software. Continue only if you downloaded Chronicle from the <a href="${officialDownload}">official Chronicle GitHub Releases page</a> and the filename and version match the release.</p></div>`,
      },
      {
        id: "open",
        title: "Allow this copy of Chronicle",
        html: `<ol><li>Try to open Chronicle once, then close the warning.</li><li>Open <strong>System Settings</strong>.</li><li>Select <strong>Privacy &amp; Security</strong>.</li><li>Scroll down to the Security section.</li><li>Select <strong>Open Anyway</strong>. Apple makes this available for about one hour after the launch attempt.</li><li>Enter your Mac login password if requested.</li><li>When the warning appears again, select <strong>Open</strong>.</li></ol>
        <p>This creates an exception for this copy of Chronicle. It does not turn Gatekeeper off for every app.</p>`,
      },
      {
        id: "stop",
        title: "When you should stop",
        html: `<ul><li>If macOS says Chronicle <strong>will damage your computer</strong> or moves it to the Bin, do not override the alert.</li><li>If it says the app is damaged, download a fresh copy and compare the release version.</li><li>If Open Anyway is unavailable on a managed Mac, ask its administrator.</li></ul>
        <p>Do not disable Gatekeeper globally.</p>`,
      },
      {
        id: "source",
        title: "Official Apple guidance",
        html: `<p>See Apple's current instructions for <a href="https://support.apple.com/en-ie/102445">opening apps safely on a Mac</a>.</p>`,
      },
    ],
  },
  {
    slug: "ai/google",
    title: "Connect a Google Gemini API key",
    description: "Create, test, monitor, and revoke a Gemini key without sharing it with Chronicle support.",
    category: "AI & costs",
    updated: "July 27, 2026",
    minutes: 5,
    keywords: ["Google", "Gemini", "AI Studio", "API key", "billing", "quota", "429"],
    related: ["ai/costs", "troubleshooting/api-billing", "privacy-data"],
    sections: [
      { id: "create", title: "Create and save the key", html: `<ol><li>Sign in to <a href="https://aistudio.google.com/app/apikey">Google AI Studio API keys</a>.</li><li>Create a key for the project you want Chronicle usage associated with.</li><li>In Chronicle, open <strong>Settings → AI summaries → Provider API keys → Google Gemini</strong>.</li><li>Paste the key there and save it. Never paste it into this website, a screenshot, a public issue, or a support message.</li></ol><p>Chronicle encrypts provider keys on this device. Optional encrypted key sync is separate and off until you enable it.</p>` },
      { id: "billing", title: "Billing and limits", html: `<p>Availability, free access, billing rules, and rate limits can change. Review Google's live <a href="https://ai.google.dev/gemini-api/docs/billing">billing guide</a>, <a href="https://ai.google.dev/gemini-api/docs/pricing">pricing page</a>, and <a href="https://ai.google.dev/gemini-api/docs/rate-limits">rate limits</a>. Your Google invoice and AI Studio usage view are authoritative.</p>` },
      { id: "revoke", title: "Revoke or replace the key", html: `<p>Delete or replace the key in Google AI Studio, then clear the saved Google key in Chronicle. A revoked key makes new AI work fail or remain pending; local version capture continues.</p>` },
    ],
  },
  {
    slug: "ai/anthropic",
    title: "Connect an Anthropic Claude API key",
    description: "Create a Claude API key, understand prepaid usage credits, and monitor or revoke access.",
    category: "AI & costs",
    updated: "July 27, 2026",
    minutes: 5,
    keywords: ["Anthropic", "Claude", "API key", "prepaid credits", "billing", "rate limit"],
    related: ["ai/costs", "troubleshooting/api-billing", "privacy-data"],
    sections: [
      { id: "create", title: "Create and save the key", html: `<ol><li>Sign in to the <a href="https://console.anthropic.com/settings/keys">Anthropic Console key page</a>.</li><li>Create a key in the workspace you want to use.</li><li>In Chronicle, open <strong>Settings → AI summaries → Provider API keys → Anthropic Claude</strong>.</li><li>Paste and save it only inside Chronicle.</li></ol><p>Anthropic does not currently provide an embeddings API, so Claude can annotate visual changes while another provider supplies semantic-search embeddings.</p>` },
      { id: "billing", title: "Credits, usage, and limits", html: `<p>Anthropic API access commonly uses prepaid usage credits. Check the current <a href="https://support.anthropic.com/en/articles/8977456-how-do-i-pay-for-my-api-usage">billing guidance</a>, <a href="https://docs.anthropic.com/en/docs/about-claude/pricing">pricing</a>, and the Usage and Cost pages in Console. Chronicle does not control those charges.</p>` },
      { id: "revoke", title: "Revoke or replace the key", html: `<p>Delete the key in Anthropic Console, then clear it in Chronicle. Review Console usage immediately if the key may have been exposed.</p>` },
    ],
  },
  {
    slug: "ai/openai",
    title: "Connect an OpenAI API key",
    description: "Create a project key, check API billing and usage, and rotate a key safely.",
    category: "AI & costs",
    updated: "July 27, 2026",
    minutes: 5,
    keywords: ["OpenAI", "API key", "project key", "billing", "usage dashboard", "rate limit"],
    related: ["ai/costs", "troubleshooting/api-billing", "privacy-data"],
    sections: [
      { id: "create", title: "Create and save the key", html: `<ol><li>Sign in to the <a href="https://platform.openai.com/api-keys">OpenAI API key page</a>.</li><li>Create a key for the project you want Chronicle to use.</li><li>In Chronicle, open <strong>Settings → AI summaries → Provider API keys → OpenAI</strong>.</li><li>Paste and save it only inside Chronicle.</li></ol><div class="help-callout"><strong>ChatGPT and API billing are separate</strong><p>A ChatGPT subscription does not automatically provide API credits. Check the Platform billing page before testing.</p></div>` },
      { id: "billing", title: "Billing and usage", html: `<p>Use the official <a href="https://platform.openai.com/usage">API Usage Dashboard</a> and <a href="https://platform.openai.com/settings/organization/billing/overview">billing settings</a>. Prices and account limits change, so rely on the live provider pages and invoice rather than an estimate in Chronicle.</p>` },
      { id: "revoke", title: "Rotate a key safely", html: `<p>If a key may be exposed, delete it from the <a href="https://platform.openai.com/api-keys">API key dashboard</a>, create a replacement, and update Chronicle. OpenAI's <a href="https://help.openai.com/en/articles/8304786-preventing-unauthorized-usage">account security guidance</a> recommends deleting exposed keys and reviewing unfamiliar usage.</p>` },
    ],
  },
  {
    slug: "ai/costs",
    title: "Understand and control AI costs",
    description: "What can create provider charges, why costs vary, and how to pause or stop spending.",
    category: "AI & costs",
    updated: "July 26, 2026",
    minutes: 5,
    keywords: ["cost", "price", "billing", "BYOK", "tokens", "spend", "free tier", "charges"],
    related: ["ai/google", "ai/anthropic", "ai/openai", "privacy-data"],
    sections: [
      { id: "byok", title: "You pay the provider you choose", html: `<p>Chronicle uses bring your own key (BYOK). Google, Anthropic, or OpenAI bills the account connected to that key. Chronicle does not set provider prices or issue provider invoices.</p>` },
      { id: "billable", title: "Actions that can make API calls", html: `<ul><li>Validating a provider and model in Settings.</li><li>Describing a first version.</li><li>Comparing a new version with the previous one.</li><li>Creating text embeddings for semantic search.</li><li>Embedding a search query when meaning-based search is enabled.</li></ul><p>Capturing bytes, browsing cached history, keyword search, and restore do not require a provider call.</p>` },
      { id: "varies", title: "Why usage varies", html: `<p>Cost depends on the provider, model, image size, amount of text, number of saved versions, retries, and the provider's current pricing. Chronicle cannot promise a free tier, fixed price, or exact monthly cost.</p>` },
      { id: "limit", title: "Limit or stop spending", html: `<ol><li>Review the provider's usage dashboard.</li><li>Choose lower-cost models where available.</li><li>Set provider budgets or spend caps when offered.</li><li>Clear the provider key in Chronicle to stop new calls.</li><li>Revoke the key at the provider if you no longer need it.</li></ol><p>Already completed provider requests may still appear on a later invoice.</p>` },
    ],
  },
  {
    slug: "privacy-data",
    title: "What stays local and what leaves your device",
    description: "A plain-language map of Chronicle files, AI inputs, keys, accounts, reporting, logs, and offline behavior.",
    category: "Privacy",
    updated: "July 27, 2026",
    minutes: 6,
    keywords: ["privacy", "local", "upload", "files", "keys", "telemetry", "sync", "delete", "offline", "logs", "retention", "removed files", "30 days"],
    related: ["ai/costs", "getting-started", "faq"],
    sections: [
      { id: "local", title: "Your version library stays on this device", html: `<p>Original watched files, captured version bytes, previews, the local database, AI summaries, tags, embeddings, settings, and queued work are stored on your device. Chronicle does not provide cloud storage for the creative version library.</p>` },
      { id: "ai", title: "AI sends task inputs to your provider", html: `<p>When you enable AI, Chronicle's local AI service sends only the inputs required for that task, such as the current and previous image, filename, or annotation text, to the provider you selected. The provider's terms, privacy policy, and retention rules apply.</p>` },
      { id: "keys", title: "Provider keys", html: `<p>Provider keys are encrypted locally with Electron safe storage and are not readable back through the normal interface. Optional passphrase-encrypted key sync is separate, requires sign-in, and remains off until you enable it.</p>` },
      { id: "account", title: "Optional account, sync, and reporting", html: `<p>Continue local requires no account. If you sign in, Chronicle can sync portable preferences but not local paths, projects, files, or version history. Content-free usage reporting can include app version, operating-system family, coarse counts, timings, provider/model identifiers, and sanitized failures. It excludes filenames, paths, project names, file contents, summaries, tags, embeddings, search queries, and credentials.</p>` },
      { id: "offline", title: "Offline behavior and deletion", html: `<p>Capture, cached history, restore, and keyword search work offline. AI annotations, semantic indexing, account sync, and reporting wait for a connection. Removing a Chronicle project does not delete your original working files; local Chronicle history and cloud account data have separate deletion controls.</p>
      <p>One local deletion happens on its own: when a watched file leaves your disk, Chronicle keeps its stored history under <strong>Removed files</strong> for 30 days and then deletes it permanently. You can delete that history sooner from the same place. See <a href="/help/troubleshooting/capture-files/#removed">files you deleted, renamed, or moved</a>.</p><p>Read the full <a href="/privacy/">Chronicle Privacy Policy</a> for the authoritative detail.</p>` },
    ],
  },
  {
    slug: "troubleshooting/updates",
    title: "Fix an update that will not download or install",
    description: "Retry safely, use the official GitHub release, and reinstall Chronicle without deleting creative originals.",
    category: "Troubleshooting",
    updated: "July 26, 2026",
    minutes: 5,
    keywords: ["update", "updater", "download update", "restart to update", "latest version", "GitHub release", "uninstall", "reinstall"],
    related: ["install/windows", "install/mac", "getting-started"],
    sections: [
      { id: "retry", title: "Try the in-app update once more", html: `<ol><li>Keep Chronicle open long enough for the download to finish.</li><li>Check that the computer is online and no VPN or firewall is blocking GitHub.</li><li>If Chronicle says the update is ready, select <strong>Restart to update</strong>.</li><li>After restart, open Settings or About and confirm the version changed.</li></ol><p>Your current projects remain usable while an optional update downloads.</p>` },
      { id: "manual", title: "If the in-app update still fails", html: `<ol><li>Quit Chronicle completely. Closing the window is not enough if Chronicle is set to keep capturing in the background. Select its icon near the clock and choose <strong>Quit Chronicle</strong>.</li><li>Open the <a href="${officialDownload}">official Chronicle GitHub Releases page</a>.</li><li>Download the newest installer for your platform.</li><li>Run it over the existing installation.</li><li>Open Chronicle and confirm the new version.</li></ol><div class="help-callout help-callout--tip"><strong>Use only the official release page</strong><p>Do not download “update tools” or repackaged Chronicle installers from another site.</p></div>` },
      { id: "reinstall", title: "Uninstall and reinstall as a last step", html: `<p>If running the newest installer does not work, uninstall Chronicle, restart the computer, then install the latest release from GitHub.</p><ol><li>Before uninstalling, note your watched folders and close creative applications.</li><li>Do not delete your original creative folders.</li><li>Use the operating system's normal uninstall process.</li><li>Restart, download the latest official installer, and install again.</li><li>Open Chronicle and check your projects and history before making new changes.</li></ol><p>Uninstalling should not delete original working files. Local Chronicle history lives separately, but back it up before troubleshooting if the history is important.</p>` },
      { id: "mac", title: "Mac updates", html: `<p>Automatic updates are currently Windows-only. On a Mac, download each new DMG from the official GitHub release page and replace the existing app. Because the current Mac build is unsigned and unnotarized, you may need to follow the <a href="/help/install/mac/">Open Anyway steps</a> again.</p>` },
      { id: "support", title: "Still not updating?", html: `<p><a href="${issues}">Open a Chronicle issue</a> with the old version, new version, operating system, and the exact visible message. Do not attach API keys, tokens, private filenames, folder paths, or creative files.</p>` },
    ],
  },
  {
    slug: "troubleshooting/ai-service",
    title: "AI says unavailable, unhealthy, or pending",
    description: "Keep working locally while you check connectivity, provider settings, and queued AI jobs.",
    category: "Troubleshooting",
    updated: "July 26, 2026",
    minutes: 4,
    keywords: ["AI unavailable", "unhealthy", "pending", "offline", "sidecar", "annotation", "embedding"],
    related: ["troubleshooting/api-billing", "ai/costs", "privacy-data"],
    sections: [
      { id: "safe", title: "Your versions are still being captured", html: `<p>The AI service is separate from Chronicle's local capture engine. An unavailable provider or local AI service should leave annotation and embedding work pending while local versions, cached history, keyword search, and restore remain usable.</p>` },
      { id: "steps", title: "Recovery steps", html: `<ol><li>Check the internet connection.</li><li>Quit Chronicle normally and reopen it.</li><li>Open Settings and confirm the selected provider has a saved key.</li><li>Validate the annotation and embedding selections again.</li><li>Wait a few minutes for pending work to retry.</li></ol><p>If one provider annotates and another creates embeddings, check both.</p>` },
    ],
  },
  {
    slug: "troubleshooting/api-billing",
    title: "Fix invalid keys, billing errors, and rate limits",
    description: "Translate common provider failures into reversible steps without exposing your API key.",
    category: "Troubleshooting",
    updated: "July 26, 2026",
    minutes: 5,
    keywords: ["invalid key", "revoked", "401", "403", "429", "quota", "rate limit", "billing", "credits"],
    related: ["ai/google", "ai/anthropic", "ai/openai", "troubleshooting/ai-service"],
    sections: [
      { id: "invalid", title: "Invalid or revoked key", html: `<ol><li>Do not post the key anywhere.</li><li>Open the provider's key dashboard and confirm the key is active.</li><li>Create a replacement if needed.</li><li>Clear the old key in Chronicle, save the replacement, and validate the model again.</li></ol>` },
      { id: "billing", title: "Billing or credits required", html: `<p>Open the provider's billing page and confirm the API account, not a consumer chat subscription, has usable billing or credits. Anthropic commonly uses prepaid credits; OpenAI API billing is separate from ChatGPT; Google access depends on the project, region, tier, and selected model.</p>` },
      { id: "rate", title: "Quota or rate-limit error", html: `<p>Wait and retry after a short period. Reduce rapid saves while the queue catches up, select a lighter model, or request more capacity from the provider. Do not repeatedly validate the same model: validation itself makes a real request.</p>` },
    ],
  },
  {
    slug: "troubleshooting/capture-files",
    title: "Fix missing versions, folders, or ignored files",
    description: "Check folder access, supported formats, save timing, duplicate saves, and files you deleted or renamed.",
    category: "Troubleshooting",
    updated: "July 27, 2026",
    minutes: 6,
    keywords: ["missing version", "folder missing", "ignored file", "unsupported", "capture delay", "duplicate", "watch folder", "deleted file", "renamed", "moved", "removed files", "30 days", "history gone"],
    related: ["getting-started", "troubleshooting/search-restore"],
    sections: [
      { id: "folder", title: "Check the watched folder", html: `<ol><li>Confirm the folder still exists in the same location.</li><li>Reconnect external or network storage.</li><li>Open the project settings and rescan the folder.</li><li>Confirm the file or its extension was not excluded.</li></ol>` },
      { id: "formats", title: "Check the format", html: `<p>PNG, JPG, SVG, PSD, PSB, OBJ, STEP/STP, and BLEND can be captured in the current desktop architecture. AI annotation support is narrower and depends on local service capabilities. A file can have version history even when its AI explanation remains pending.</p>` },
      { id: "timing", title: "Allow the save to finish", html: `<p>Chronicle waits for files to settle so it does not capture half-written temporary files. Large files and cloud-synced folders can take longer. Wait a few seconds, then check the Timeline. Re-saving identical bytes does not create a duplicate version.</p>` },
      { id: "removed", title: "A file you deleted, renamed, or moved", html: `<p>Chronicle identifies a file by its location, so deleting it, renaming it, or moving it elsewhere all look the same from the outside: the original path is gone. Its history is not thrown away. The file leaves the main project view and moves into a <strong>Removed files</strong> section at the bottom of the project, which appears only when something is missing. Open it to see when each file disappeared and how long its history will be kept.</p>
        <div class="help-callout help-callout--warning"><strong>Removed history is kept for 30 days</strong><p>Each removed file shows how many days are left. After that, Chronicle permanently deletes that file's versions, summaries, and stored bytes. Put the file back at the same path before the countdown ends and Chronicle picks it up again with its history intact.</p></div>
        <p>A renamed or moved file starts a fresh history at its new path. The old path keeps the earlier versions under Removed files until you restore the file or the retention window ends. Matching a file across renames is not supported yet.</p>
        <p>To recover work from a removed file, open it under <strong>Removed files</strong>, choose a version, and use <strong>Save a copy</strong> or restore it. Restoring writes the file back to its original folder; if that folder no longer exists, save a copy somewhere else instead.</p>
        <p>To clear it sooner, select <strong>Delete now</strong> on a single removed file, or <strong>Delete all removed files</strong> for the whole list. Both ask for confirmation and cannot be undone. Chronicle refuses to delete history for a file that is still on disk; to erase an entire project's history, use <strong>Delete project and history</strong> when you remove the project.</p>` },
      { id: "running", title: "Check that Chronicle was running", html: `<p>Chronicle records saves while it is running. It does not need to be the window you are looking at: by default, closing the window leaves Chronicle in the notification area (the small icons near the clock) and it keeps versioning your folders. Only <strong>Quit Chronicle</strong> from that icon stops it.</p><p>If Chronicle was fully closed while you worked, the next launch still notices the file's current contents and records them as a new version. Saves you made in between are not recorded separately, so a long editing session with Chronicle closed becomes one version instead of several.</p><ol><li>Look for the Chronicle icon near the clock. If it is hidden, select the arrow to show more icons.</li><li>Open <strong>Settings → Startup &amp; background</strong>.</li><li>Keep <strong>Keep capturing after I close the window</strong> switched on.</li><li>Turn on <strong>Start Chronicle when I sign in</strong> so it is running after every restart. Leave the window option off if you prefer it to start quietly.</li></ol>` },
    ],
  },
  {
    slug: "troubleshooting/search-restore",
    title: "Fix search indexing and restore safely",
    description: "Use keyword fallback, wait for semantic indexing, and recover without losing later work.",
    category: "Troubleshooting",
    updated: "July 26, 2026",
    minutes: 5,
    keywords: ["search not finding", "indexing", "semantic", "keyword", "restore", "save copy", "recovery"],
    related: ["troubleshooting/capture-files", "troubleshooting/ai-service", "getting-started"],
    sections: [
      { id: "search", title: "When search misses a version", html: `<ol><li>Search the filename or an exact word from its description.</li><li>Clear filters and try again.</li><li>If AI is pending, use keyword search while embeddings finish.</li><li>After changing embedding provider or model, allow existing descriptions to re-index.</li></ol>` },
      { id: "restore", title: "Restore with a recovery path", html: `<ol><li>Open the correct asset and preview the target version.</li><li>Use <strong>Save a copy</strong> if you only need an older file beside the current one.</li><li>Close the creative application before restoring to avoid competing saves.</li><li>Restore, reopen the file, and confirm the result.</li></ol><p>Chronicle records restoration in the timeline so later history is not silently erased.</p>` },
    ],
  },
  {
    slug: "faq",
    title: "Chronicle FAQ",
    description: "Short, direct answers about accounts, AI, files, platforms, privacy, storage, restore, deletion, and support.",
    category: "FAQ",
    updated: "July 27, 2026",
    minutes: 7,
    keywords: ["FAQ", "frequently asked questions", "account", "offline", "supported", "storage", "delete", "deleted file", "renamed", "removed files"],
    related: ["getting-started", "privacy-data", "ai/costs"],
    sections: [
      {
        id: "answers",
        title: "Frequently asked questions",
        html: `<div class="faq-list">
        <details id="trust-warning"><summary>How do I bypass the Windows or Mac trust warning?</summary><p>First, make sure you downloaded Chronicle from the <a href="${officialDownload}">official Chronicle GitHub Releases page</a> and that the filename and version match the release. On Windows, select <strong>More info → Run anyway</strong>. On macOS, try to open Chronicle once, then go to <strong>System Settings → Privacy &amp; Security → Open Anyway</strong>. Follow the full <a href="/help/install/windows/">Windows guide</a> or <a href="/help/install/mac/">Mac guide</a>. Stop if the computer reports malware, says the app will damage your computer, or the file came from another source.</p></details>
        <details id="supported-systems"><summary>Which computers are supported?</summary><p>Chronicle currently publishes Windows x64 and macOS Apple Silicon builds. The Mac build is unsigned and unnotarized; Intel Macs are not currently supported.</p></details>
        <details id="supported-files"><summary>Which files can Chronicle capture?</summary><p>The current architecture captures PNG, JPG, SVG, PSD, PSB, OBJ, STEP/STP, and BLEND. AI explanations depend on the installed AI service's capabilities, so some captured formats can remain pending.</p></details>
        <details id="account"><summary>Do I need an account?</summary><p>No. Select Continue local for capture, timeline, restore, and keyword search. Sign-in is optional.</p></details>
        <details id="ai-required"><summary>Is AI required?</summary><p>No. AI adds change summaries and meaning-based search. Local version history works without it.</p></details>
        <details id="offline"><summary>What works offline?</summary><p>Capture, cached history, keyword search, and restore. AI, semantic indexing, account sync, and reporting wait for connectivity.</p></details>
        <details id="where-data-lives"><summary>Where do my files and keys live?</summary><p>Chronicle's creative version library and database stay on your device. Provider keys are encrypted locally. Enabled AI sends only task-required inputs to your selected provider.</p></details>
        <details id="provider"><summary>Which AI provider should I choose?</summary><p>Choose based on model availability, privacy terms, and cost. Google and OpenAI can provide embeddings; Anthropic currently does not provide an embeddings API.</p></details>
        <details id="cost"><summary>How much will AI cost?</summary><p>There is no fixed Chronicle price. Your provider charges according to its current models, inputs, outputs, and account. Review its usage dashboard and invoice.</p></details>
        <details id="storage"><summary>Will version history use more disk space?</summary><p>Yes. Chronicle keeps version bytes locally and de-duplicates identical content. Large files and frequent meaningful saves use more storage.</p></details>
        <details id="restore"><summary>Can restore destroy my current work?</summary><p>Chronicle preserves timeline history, but Save a copy is the safest option when you only want to inspect or reuse an old version.</p></details>
        <details id="deleted-file"><summary>I deleted or renamed a file. Where did its history go?</summary><p>It moved to the <strong>Removed files</strong> section at the bottom of that project. Chronicle keeps a removed file's versions for 30 days, shows the days remaining, and then deletes them permanently. Put the file back at the same path before then and Chronicle continues its history. A renamed or moved file starts a new history at its new path. See <a href="/help/troubleshooting/capture-files/#removed">the full guide</a>.</p></details>
        <details id="delete-history"><summary>Can I permanently delete a file's version history?</summary><p>Yes, once the file itself is gone from disk. Open <strong>Removed files</strong> in the project and select <strong>Delete now</strong> for one file or <strong>Delete all removed files</strong> for every removed file. Chronicle will not delete history for a file that is still on disk. To erase an entire project's history at once, choose <strong>Delete project and history</strong> when you remove the project. These actions cannot be undone.</p></details>
        <details id="delete"><summary>What happens when I remove a project or uninstall?</summary><p>Your original creative files are not Chronicle's library and should not be deleted. Local history and optional cloud account data have separate controls. Back up important history before uninstall troubleshooting.</p></details>
        <details id="support"><summary>How do I get more help?</summary><p>Search this help center or <a href="${issues}">open a GitHub issue</a>. Share the app version, operating system, exact message, and steps. Never share keys, tokens, private paths, or creative files.</p></details>
        </div>`,
      },
    ],
  },
];

export const helpCategories: { title: HelpCategory; description: string; icon: string }[] = [
  { title: "Start here", description: "Install Chronicle and capture your first creative version.", icon: "auto_awesome" },
  { title: "Install", description: "Handle Windows and macOS trust warnings safely.", icon: "download" },
  { title: "AI & costs", description: "Connect a provider and stay in control of spending.", icon: "neurology" },
  { title: "Privacy", description: "See exactly what stays local and what can leave your device.", icon: "shield_lock" },
  { title: "Troubleshooting", description: "Recover from update, capture, search, and AI problems.", icon: "build_circle" },
  { title: "FAQ", description: "Quick answers about files, accounts, storage, and restore.", icon: "help" },
];

export const getHelpArticle = (slug: string) => helpArticles.find((article) => article.slug === slug);

export const articlePath = (slug: string) => `/help/${slug}/`;

export const articleSearchText = (article: HelpArticle) =>
  [
    article.title,
    article.description,
    article.category,
    ...article.keywords,
    ...article.sections.map((section) => `${section.title} ${section.html.replace(/<[^>]*>/g, " ")}`),
  ]
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
