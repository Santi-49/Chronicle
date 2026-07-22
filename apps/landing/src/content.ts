export const landingContent = {
  productName: "Chronicle",
  appUrl: "https://github.com/Santi-49/Chronicle/releases/latest",
  nav: [
    { label: "Why Chronicle", href: "#why" },
    { label: "Features", href: "#features" },
    { label: "Formats", href: "#formats" },
  ],
  headline: "Never lose a creative version again.",
  subheadline:
    "Chronicle watches your folders and turns every save into a named, AI-explained version — automatically. For photographers, video editors, designers, and teams who can't afford to lose work.",
  primaryCta: "Download for free",
  secondaryCta: "See how it works",
  whyTitle: "The version control creatives actually needed.",
  whySubtitle:
    "Developers have had git for 20 years. Photographers, editors, and design teams have had nothing — just a graveyard of files named _final_v8_APPROVED_use_this_one. Chronicle fixes that.",
  cards: [
    {
      icon: "◎",
      title: "Every save. Captured.",
      text: "Point at a folder and forget about it. Every time you hit save — in Lightroom, Photoshop, Blender, anywhere — Chronicle silently captures a new version.",
    },
    {
      icon: "⌁",
      title: "AI explains the diff",
      text: '"Exposure lifted +0.8EV, background desaturated, subject crop tightened." Plain English. No guessing what changed between your 30 exports.',
    },
    {
      icon: "◎",
      title: "Built for teams",
      text: "Everyone saves to the same watched folder. Chronicle tracks who changed what and when — no Git, no shared drives, no version conflicts.",
    },
    {
      icon: "◫",
      title: "100% local. Always private.",
      text: "Your RAWs, PSDs, and project files never leave your machine. AI inference is model-agnostic via LangChain — BYOK, your provider, your rules.",
    },
  ],
  featuresTitle: "The version timeline your creative work deserves.",
  featuresSubtitle:
    "From live capture to AI-explained diffs to instant restore — Chronicle makes every save count.",
  featurePanels: [
    "Asset Timeline",
    "AI Diff",
    "One-Click Restore",
    "Version Graph",
    "Semantic Search",
  ],
  formatsTitle: "Every format in your workflow.",
  formatsSubtitle:
    "Whether you shoot RAW, composite in Photoshop, model in Blender, or draft in CAD — Chronicle tracks it. Starting with the formats creatives use most, expanding fast.",
  formats: {
    available: [
      { ext: "PNG", label: "PNG", desc: "Raster image", live: true },
      { ext: "JPG", label: "JPG / JPEG", desc: "Raster image", live: true },
      { ext: "PSD", label: "PSD", desc: "Photoshop document", live: false },
      { ext: "PSB", label: "PSB", desc: "Photoshop large document", live: false },
      { ext: "SVG", label: "SVG", desc: "Vector graphic", live: false },
      { ext: "BLEND", label: "BLEND", desc: "Blender 3D scene", live: false },
      { ext: "OBJ", label: "OBJ", desc: "3D model", live: false },
      { ext: "STEP", label: "STEP / STP", desc: "CAD model", live: false },
    ],
  },
  downloadTitle: "Your next save is already a version. Don't lose it.",
  downloadSubtitle:
    "Free. Local. No account required. Works with the tools you already use — Lightroom, Photoshop, Blender, Figma, After Effects, anything.",
  downloadCta: "Download Chronicle",
  downloadSecondaryCta: "View on GitHub",
  githubUrl: "https://github.com/Santi-49/Chronicle",
};
