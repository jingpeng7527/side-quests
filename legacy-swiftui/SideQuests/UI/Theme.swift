import SwiftUI

// Concept: "start flag". A race-day poster printed in two inks — signal red
// and paper white — with near-black for reading text.
// Rules:
//  • Two tones only. Calm screens are paper; the high-energy moments (home,
//    the live quest, game over, the winner) flip to a full red field.
//  • Compressed black display type, set big. Mono for labels and numbers.
//  • Sharp corners, hairline rules, no shadows, no gradients.
//  • The only ornament is the halftone burst (see Halftone.swift), always
//    printed tonally — one step off the ground — so it never fights the type.

extension Color {
    init(hex: UInt32) {
        self.init(red: Double((hex >> 16) & 0xFF) / 255, green: Double((hex >> 8) & 0xFF) / 255, blue: Double(hex & 0xFF) / 255)
    }
    static let signalRed = Color(hex: 0xD9241C)   // oklch(0.57 0.215 29) — 4.8:1 with paper
    static let deepRed = Color(hex: 0xB01B14)
    static let paper = Color(hex: 0xF6F2EC)       // warm off-white ground
    static let paperBright = Color(hex: 0xFFFAF6) // type on red
    static let inkBlack = Color(hex: 0x17110F)    // warm near-black
    static let stone = Color(hex: 0x6B645E)       // muted text on paper, 5.2:1
    static let paperLine = Color(hex: 0xDDD6CD)
    static let blush = Color(hex: 0xF0CFC6)       // halftone ink on paper
    static let paperRaised = Color(hex: 0xECE6DE)
}

/// Every color a component needs, resolved per tone.
struct Palette {
    var bg: Color
    var fg: Color
    var muted: Color
    var line: Color
    var raised: Color
    var accent: Color
    var onAccent: Color
    /// The halftone ink on this ground.
    var art: Color

    static let paper = Palette(bg: .paper, fg: .inkBlack, muted: .stone, line: .paperLine,
                               raised: .paperRaised, accent: .signalRed, onAccent: .paperBright, art: .blush)
    // On red, small text stays full white: tints of white drop below AA.
    static let signal = Palette(bg: .signalRed, fg: .paperBright, muted: .paperBright, line: Color.paperBright.opacity(0.35),
                                raised: .deepRed, accent: .paperBright, onAccent: .signalRed, art: .deepRed)
}

extension EnvironmentValues {
    @Entry var palette: Palette = .paper
}

enum Tone { case paper, signal
    var palette: Palette { self == .paper ? .paper : .signal }
}

extension Font {
    static func display(_ size: CGFloat) -> Font {
        .system(size: size, weight: .black).width(.compressed)
    }
    static func label(_ size: CGFloat = 12) -> Font {
        .system(size: size, weight: .semibold, design: .monospaced)
    }
    static func numerals(_ size: CGFloat) -> Font {
        .system(size: size, weight: .bold, design: .monospaced).monospacedDigit()
    }
}

enum Space {
    static let xs: CGFloat = 4, s: CGFloat = 8, m: CGFloat = 16, l: CGFloat = 24, xl: CGFloat = 40
    static let gutter: CGFloat = 20
}

/// "02 — QUESTS": the mono step marker heading every screen.
struct Kicker: View {
    let index: String
    let title: String
    var trailing: String? = nil
    @Environment(\.palette) private var pal

    var body: some View {
        HStack(spacing: Space.s) {
            Text(index).foregroundStyle(pal.accent)
            Rectangle().fill(pal.line).frame(width: 18, height: 1)
            Text(title.uppercased()).foregroundStyle(pal.muted)
            Spacer()
            if let trailing { Text(trailing.uppercased()).foregroundStyle(pal.muted) }
        }
        .font(.label(12))
        .tracking(1.5)
    }
}

struct Hairline: View {
    var emphasized = false
    @Environment(\.palette) private var pal
    var body: some View { Rectangle().fill(emphasized ? pal.accent : pal.line).frame(height: emphasized ? 2 : 1) }
}

struct SlabButtonStyle: ButtonStyle {
    enum Kind { case primary, secondary, quiet }
    var kind: Kind = .primary
    @Environment(\.isEnabled) private var isEnabled
    @Environment(\.palette) private var pal

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.display(26))
            .tracking(0.5)
            .textCase(.uppercase)
            .frame(maxWidth: .infinity, minHeight: 60)
            .padding(.horizontal, Space.m)
            .foregroundStyle(kind == .primary ? pal.onAccent : kind == .secondary ? pal.fg : pal.muted)
            .background(kind == .primary ? pal.accent : .clear)
            .overlay(Rectangle().strokeBorder(kind == .secondary ? pal.fg : .clear, lineWidth: 2))
            .opacity(isEnabled ? 1 : 0.4)
            .scaleEffect(configuration.isPressed ? 0.97 : 1)
            .animation(.spring(response: 0.25, dampingFraction: 0.7), value: configuration.isPressed)
            .contentShape(Rectangle())
    }
}

extension ButtonStyle where Self == SlabButtonStyle {
    static var slab: SlabButtonStyle { SlabButtonStyle() }
    static var slabOutline: SlabButtonStyle { SlabButtonStyle(kind: .secondary) }
    static var slabQuiet: SlabButtonStyle { SlabButtonStyle(kind: .quiet) }
}

/// Every screen: a tone, optional halftone art, kicker at top, action bar at bottom.
struct Screen<Content: View, Footer: View>: View {
    let index: String
    let title: String
    var trailing: String? = nil
    var tone: Tone = .paper
    var art: Halftone? = nil
    @ViewBuilder var content: Content
    @ViewBuilder var footer: Footer

    var body: some View {
        let pal = tone.palette
        VStack(spacing: 0) {
            HStack(spacing: Space.s) {
                Kicker(index: index, title: title, trailing: trailing)
                DevMenu()
            }
                .padding(.horizontal, Space.gutter)
                .padding(.top, Space.s)
                .padding(.bottom, Space.m)
            content
                .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
            VStack(spacing: Space.s) { footer }
                .padding(.horizontal, Space.gutter)
                .padding(.top, Space.s)
                .padding(.bottom, Space.s)
        }
        .background {
            ZStack {
                pal.bg
                if let art { HalftoneView(spec: art, color: pal.art) }
            }
            .ignoresSafeArea()
        }
        .foregroundStyle(pal.fg)
        .tint(pal.accent)
        .environment(\.palette, pal)
    }
}

extension Screen where Footer == EmptyView {
    init(index: String, title: String, trailing: String? = nil, tone: Tone = .paper, art: Halftone? = nil,
         @ViewBuilder content: () -> Content) {
        self.init(index: index, title: title, trailing: trailing, tone: tone, art: art, content: content, footer: { EmptyView() })
    }
}

/// Small sharp tag, e.g. "AI" or "HOST".
struct Tag: View {
    let text: String
    var filled = false
    @Environment(\.palette) private var pal
    var body: some View {
        Text(text.uppercased())
            .font(.label(10))
            .tracking(1.2)
            .padding(.horizontal, 6).padding(.vertical, 3)
            .foregroundStyle(filled ? pal.onAccent : pal.muted)
            .background(filled ? pal.accent : .clear)
            .overlay(Rectangle().strokeBorder(filled ? .clear : pal.line, lineWidth: 1))
    }
}

struct Avatar: View {
    let name: String
    var size: CGFloat = 36
    var highlighted = false
    @Environment(\.palette) private var pal
    var body: some View {
        Text(String(name.prefix(1)).uppercased())
            .font(.display(size * 0.62))
            .frame(width: size, height: size)
            .foregroundStyle(highlighted ? pal.onAccent : pal.fg)
            .background(highlighted ? pal.accent : pal.raised)
    }
}

/// Mono caption used for field labels.
struct FieldLabel: View {
    let text: String
    @Environment(\.palette) private var pal
    init(_ text: String) { self.text = text }
    var body: some View {
        Text(text.uppercased()).font(.label(11)).tracking(1.5).foregroundStyle(pal.muted)
    }
}
