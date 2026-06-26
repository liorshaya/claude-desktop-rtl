// make-appicon.swift — render the manager's app icon natively (no design app, no Node).
// The glyph (Claude-style starburst + a left arrow = "RTL for Claude") is drawn VECTORIALLY,
// so it stays razor-sharp at every size. Squircle on warm off-white, glyph in the Claude
// terracotta gradient (matching the in-window header badge). Writes a full .iconset.
//
//   swift make-appicon.swift <out.iconset-dir>
//   iconutil -c icns <out.iconset-dir>  →  AppIcon.icns
import AppKit
import Foundation

let args = CommandLine.arguments
guard args.count >= 2 else { fputs("usage: make-appicon <out.iconset>\n", stderr); exit(2) }
let outDir = URL(fileURLWithPath: args[1])
try? FileManager.default.createDirectory(at: outDir, withIntermediateDirectories: true)

let glyphGrad = NSGradient(starting: NSColor(red: 0.86, green: 0.42, blue: 0.30, alpha: 1),
                           ending:   NSColor(red: 0.72, green: 0.25, blue: 0.16, alpha: 1))!
let bgGrad = NSGradient(starting: NSColor(red: 0.995, green: 0.976, blue: 0.946, alpha: 1),
                        ending:   NSColor(red: 0.957, green: 0.925, blue: 0.882, alpha: 1))!

// The logo glyph, drawn in solid black on the current context (it gets tinted afterwards).
// A radial starburst on the right + a left-pointing arrow whose shaft enters the burst.
func drawGlyph(_ s: CGFloat) {
    NSColor.black.setStroke(); NSColor.black.setFill()
    let cx = s * 0.585, cy = s * 0.50

    // Starburst: 12 spokes, alternating long/short, small gap at the center. Skip the spoke
    // pointing straight left — the arrow shaft takes that side.
    let spokes = 12, inner = s * 0.052, w = s * 0.027
    for i in 0..<spokes {
        let ang = CGFloat(i) * (.pi * 2 / CGFloat(spokes))
        if abs(ang - .pi) < 0.01 { continue }                 // ~180° → leave for the arrow
        let outer = (i % 2 == 0) ? s * 0.195 : s * 0.138
        let p = NSBezierPath()
        p.lineWidth = w; p.lineCapStyle = .round
        p.move(to: NSPoint(x: cx + cos(ang) * inner, y: cy + sin(ang) * inner))
        p.line(to: NSPoint(x: cx + cos(ang) * outer, y: cy + sin(ang) * outer))
        p.stroke()
    }

    // Arrow shaft — a thick rounded line from the burst center going left.
    let headBaseX = s * 0.315, tipX = s * 0.165
    let shaft = NSBezierPath()
    shaft.lineWidth = s * 0.052; shaft.lineCapStyle = .round
    shaft.move(to: NSPoint(x: headBaseX, y: cy))
    shaft.line(to: NSPoint(x: cx, y: cy))
    shaft.stroke()

    // Arrowhead — a solid triangle, tip pointing left.
    let hh = s * 0.092
    let head = NSBezierPath()
    head.move(to: NSPoint(x: tipX, y: cy))
    head.line(to: NSPoint(x: headBaseX, y: cy + hh))
    head.line(to: NSPoint(x: headBaseX, y: cy - hh))
    head.close(); head.fill()
}

// Render a px×px RGBA bitmap with the given drawing closure (origin bottom-left).
func render(_ px: Int, _ draw: (CGFloat) -> Void) -> NSBitmapImageRep {
    let rep = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: px, pixelsHigh: px,
        bitsPerSample: 8, samplesPerPixel: 4, hasAlpha: true, isPlanar: false,
        colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0)!
    rep.size = NSSize(width: px, height: px)
    let g = NSGraphicsContext(bitmapImageRep: rep)!
    NSGraphicsContext.saveGraphicsState()
    NSGraphicsContext.current = g
    g.imageInterpolation = .high
    draw(CGFloat(px))
    g.flushGraphics()
    NSGraphicsContext.restoreGraphicsState()
    return rep
}

func iconRep(_ px: Int) -> NSBitmapImageRep {
    // 1) The vector glyph, tinted with the terracotta gradient, on a transparent canvas.
    let tinted = render(px) { s in
        drawGlyph(s)
        NSGraphicsContext.current!.compositingOperation = .sourceAtop   // tint only the glyph
        glyphGrad.draw(in: NSRect(x: 0, y: 0, width: s, height: s), angle: -90)
    }
    let tintedImg = NSImage(size: NSSize(width: px, height: px)); tintedImg.addRepresentation(tinted)

    // 2) Squircle (off-white, soft shadow) + the tinted glyph on top.
    return render(px) { s in
        let margin = s * 0.094, side = s - margin * 2, radius = side * 0.2237
        let sq = NSRect(x: margin, y: margin, width: side, height: side)
        let path = NSBezierPath(roundedRect: sq, xRadius: radius, yRadius: radius)

        NSGraphicsContext.saveGraphicsState()
        let sh = NSShadow(); sh.shadowColor = NSColor.black.withAlphaComponent(0.20)
        sh.shadowBlurRadius = s * 0.022; sh.shadowOffset = NSSize(width: 0, height: -s * 0.012)
        sh.set(); NSColor.white.setFill(); path.fill()
        NSGraphicsContext.restoreGraphicsState()

        NSGraphicsContext.saveGraphicsState()
        path.addClip(); bgGrad.draw(in: sq, angle: -90)
        NSGraphicsContext.restoreGraphicsState()

        tintedImg.draw(in: NSRect(x: 0, y: 0, width: s, height: s), from: .zero,
                       operation: .sourceOver, fraction: 1)
    }
}

let targets: [(String, Int)] = [
    ("icon_16x16.png", 16), ("icon_16x16@2x.png", 32),
    ("icon_32x32.png", 32), ("icon_32x32@2x.png", 64),
    ("icon_128x128.png", 128), ("icon_128x128@2x.png", 256),
    ("icon_256x256.png", 256), ("icon_256x256@2x.png", 512),
    ("icon_512x512.png", 512), ("icon_512x512@2x.png", 1024),
]
var cache: [Int: Data] = [:]
for (name, px) in targets {
    if cache[px] == nil { cache[px] = iconRep(px).representation(using: .png, properties: [:])! }
    try! cache[px]!.write(to: outDir.appendingPathComponent(name))
}
fputs("make-appicon: wrote \(targets.count) sizes to \(outDir.path)\n", stderr)
