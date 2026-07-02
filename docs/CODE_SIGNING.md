# Code Signing Policy

This is the code signing policy for **claude-rtl** (the Claude Desktop RTL project),
required by and published for the [SignPath Foundation](https://signpath.org/) free OSS
code-signing program. It documents who can authorize a signed release, how releases are
built, and the project's privacy stance.

## About the project

claude-rtl brings smooth right-to-left (Hebrew / Arabic / Persian) rendering to **Claude
for Windows** (the desktop app) and **claude.ai** in the browser. It is an **accessibility
and localization tool**. It does not add, remove, or exfiltrate any user data.

- **Repository:** https://github.com/liorshaya/claude-desktop-rtl
- **License:** [MIT](../LICENSE) (OSI-approved, no commercial dual-licensing)
- **Author / maintainer:** Lior Shaya

## What the signed artifact does

The signed Windows artifact is **`ClaudeRTL-Setup-<version>.exe`** (an Inno Setup
per-user installer) and the **`ClaudeRtl.exe`** WPF tray application it installs. The tray
app applies the project's RTL payload to the user's **own, already-installed** copy of
Claude for Windows, on the user's explicit action.

To do so on the local machine the tooling: repacks Claude's Electron `app.asar` after
prepending the RTL payload to the renderer bundles, and disables the Electron
`EnableEmbeddedAsarIntegrityValidation` fuse so the locally-modified bundle still loads.
This is performed **only** against the user's own installation, **with a backup**
(`*.crtl-bak`) and a one-click **"Restore original"**. It is a localization patch of the
user's own software — not an exploitation, anti-malware-evasion, or privacy-compromising
tool.

## Privacy

The project performs **zero network access, zero telemetry, and stores zero user data** —
by design and as an enforced project rule. The RTL engine never injects bidi control
characters, so copied text is byte-for-byte identical to Claude's original output. No data
ever leaves the user's machine.

## Team roles

The project is currently maintained by a single trusted maintainer who fills all three
SignPath roles. Multi-factor authentication is enabled for both the GitHub account and the
SignPath account.

| Role | Person | Responsibility |
|---|---|---|
| **Author** | Lior Shaya | Trusted developer with commit access to the repository. |
| **Reviewer** | Lior Shaya | Reviews all changes before they reach `main`; external contributions are reviewed before merge. |
| **Approver** | Lior Shaya | Manually approves each signing request in SignPath before a release is signed. |

## Build and release process

1. A release is cut by pushing a `v*` tag, which triggers
   [`.github/workflows/release.yml`](../.github/workflows/release.yml) on GitHub Actions.
2. The Windows installer is built **entirely from source** in CI by
   [`gui/windows/package.ps1`](../gui/windows/package.ps1): `dotnet publish` of the WPF
   app, the prebuilt RTL payload, the patch scripts, a portable Node runtime, and finally
   the Inno Setup installer. No pre-built binaries are introduced into the signed package
   (the bundled Node runtime is the official upstream `node.exe`).
3. The build artifact is submitted to SignPath for signing via the SignPath GitHub Actions
   integration.
4. **Every signing request is approved manually** by the Approver before the artifact is
   signed.
5. The signed installer is published on the project's
   [GitHub Releases](https://github.com/liorshaya/claude-desktop-rtl/releases) page.

## Attribution

Code signing is provided free of charge by the [SignPath Foundation](https://signpath.org/),
with a certificate issued by SignPath.
</content>
</invoke>
