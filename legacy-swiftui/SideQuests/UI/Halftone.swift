import SwiftUI

/// The app's one ornament: a seeded halftone "burst". Dots on a rotated
/// screen swell toward an off-center focal point, with a few speed bars
/// shooting away from it — like a riso-printed race poster.
struct Halftone: Equatable {
    var seed: UInt64
    /// Focal point in unit coordinates. Keep it away from where text sits.
    var focus: UnitPoint
    /// How far the dots reach, as a fraction of the diagonal.
    var reach: CGFloat = 0.55
    var spacing: CGFloat = 14
    var angle: Double = 28
    var maxDot: CGFloat = 1.0          // fraction of spacing
    var bars: Int = 5
    var opacity: Double = 1

    struct Mark { var rect: CGRect; var isBar: Bool; var rotation: Double }

    func marks(in size: CGSize) -> [Mark] {
        var rng = SplitMix64(seed: seed)
        let diag = hypot(size.width, size.height)
        let f = CGPoint(x: focus.x * size.width, y: focus.y * size.height)
        let a = angle * .pi / 180
        let (ca, sa) = (CGFloat(cos(a)), CGFloat(sin(a)))
        var out: [Mark] = []

        // Rotated dot screen, covering the whole frame.
        let n = Int(diag / spacing) + 2
        let c = CGPoint(x: size.width / 2, y: size.height / 2)
        for i in -n...n {
            for j in -n...n {
                let gx = CGFloat(i) * spacing, gy = CGFloat(j) * spacing
                let p = CGPoint(x: c.x + gx * ca - gy * sa, y: c.y + gx * sa + gy * ca)
                guard p.x > -spacing, p.y > -spacing, p.x < size.width + spacing, p.y < size.height + spacing else { continue }
                let d = hypot(p.x - f.x, p.y - f.y) / (reach * diag)
                guard d < 1 else { continue }
                // Ease-in falloff, slight per-dot jitter so it reads as printed, not computed.
                let v = pow(1 - d, 1.7) * CGFloat(0.85 + 0.3 * rng.unit())
                let r = spacing * maxDot * 0.5 * min(1, v * 1.25)
                guard r > 0.7 else { continue }
                out.append(Mark(rect: CGRect(x: p.x - r, y: p.y - r, width: r * 2, height: r * 2), isBar: false, rotation: 0))
            }
        }

        // Speed bars: shoot from the focus toward the middle of the frame.
        let toward = atan2(Double(c.y - f.y), Double(c.x - f.x)) * 180 / .pi
        for k in 0..<bars {
            let offset = (CGFloat(k) - CGFloat(bars - 1) / 2) * spacing * CGFloat(1.6 + rng.unit())
            let length = diag * CGFloat(0.14 + 0.24 * rng.unit())
            let thick = spacing * CGFloat([0.35, 0.6, 1.0, 1.6].randomElement(using: &rng)!)
            let start = CGFloat(0.04 + 0.12 * rng.unit()) * diag
            out.append(Mark(rect: CGRect(x: start, y: offset - thick / 2, width: length, height: thick).offsetBy(dx: f.x, dy: f.y),
                            isBar: true, rotation: toward + (rng.unit() - 0.5) * 6))
        }
        return out
    }

    func draw(in ctx: CGContext, size: CGSize, color: CGColor) {
        ctx.saveGState()
        ctx.setFillColor(color)
        ctx.setAlpha(opacity)
        let f = CGPoint(x: focus.x * size.width, y: focus.y * size.height)
        for m in marks(in: size) {
            if m.isBar {
                ctx.saveGState()
                ctx.translateBy(x: f.x, y: f.y)
                ctx.rotate(by: m.rotation * .pi / 180)
                ctx.fill(m.rect.offsetBy(dx: -f.x, dy: -f.y))
                ctx.restoreGState()
            } else {
                ctx.fillEllipse(in: m.rect)
            }
        }
        ctx.restoreGState()
    }
}

struct HalftoneView: View {
    let spec: Halftone
    let color: Color

    var body: some View {
        Canvas(rendersAsynchronously: true) { ctx, size in
            ctx.opacity = spec.opacity
            let f = CGPoint(x: spec.focus.x * size.width, y: spec.focus.y * size.height)
            var dots = Path(), bars = Path()
            for m in spec.marks(in: size) {
                if m.isBar {
                    let t = CGAffineTransform(translationX: f.x, y: f.y)
                        .rotated(by: m.rotation * .pi / 180)
                        .translatedBy(x: -f.x, y: -f.y)
                    bars.addPath(Path(m.rect), transform: t)
                } else {
                    dots.addEllipse(in: m.rect)
                }
            }
            ctx.fill(dots, with: .color(color))
            ctx.fill(bars, with: .color(color))
        }
        .allowsHitTesting(false)
        .accessibilityHidden(true)
    }
}

/// Deterministic RNG so each screen's art is curated, not random per launch.
struct SplitMix64: RandomNumberGenerator {
    private var state: UInt64
    init(seed: UInt64) { state = seed }
    mutating func next() -> UInt64 {
        state &+= 0x9E3779B97F4A7C15
        var z = state
        z = (z ^ (z >> 30)) &* 0xBF58476D1CE4E5B9
        z = (z ^ (z >> 27)) &* 0x94D049BB133111EB
        return z ^ (z >> 31)
    }
    mutating func unit() -> Double { Double(next() >> 11) / Double(1 << 53) }
}

extension Halftone {
    // Curated per-screen compositions. Focus sits opposite the text mass.
    static let home = Halftone(seed: 7, focus: UnitPoint(x: 1.05, y: 0.02), reach: 0.62, spacing: 15, angle: 152, bars: 6)
    static let join = Halftone(seed: 11, focus: UnitPoint(x: 0.5, y: 0.26), reach: 0.42, spacing: 12, angle: 90, bars: 0)
    static let inGame = Halftone(seed: 3, focus: UnitPoint(x: 1.1, y: 0.95), reach: 0.6, spacing: 13, angle: 205, bars: 4)
    static let gameOver = Halftone(seed: 21, focus: UnitPoint(x: 0.95, y: 0.12), reach: 0.48, spacing: 14, angle: 160, bars: 5)
    static let winner = Halftone(seed: 42, focus: UnitPoint(x: 1.0, y: 0.0), reach: 0.7, spacing: 12, angle: 140, bars: 3)
    static let lobby = Halftone(seed: 5, focus: UnitPoint(x: 1.05, y: 0.08), reach: 0.42, spacing: 11, angle: 150, bars: 0)
}
