// swift-tools-version: 5.9
import PackageDescription

// macOS menu-bar + onboarding GUI that wraps the desktop pipeline (desktop/patch.sh etc.).
// Builds with the Command Line Tools — no full Xcode needed: `swift build -c release`,
// then gui/build.sh assembles Claude-RTL.app (LSUIElement menu-bar agent). See ROADMAP
// "Distribution & GUI". No Apple Developer Program ($99) needed — ad-hoc signed + OSS build.
let package = Package(
    name: "ClaudeRTL",
    platforms: [.macOS(.v13)], // MenuBarExtra
    targets: [
        .executableTarget(name: "ClaudeRTL", path: "Sources/ClaudeRTL")
    ]
)
