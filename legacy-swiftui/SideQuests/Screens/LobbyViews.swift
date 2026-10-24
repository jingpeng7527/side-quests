import SwiftUI

/// "Bring your phones together" — browses for lobbies advertised nearby.
struct JoinNearbyView: View {
    @EnvironmentObject var session: GameSession
    var body: some View { JoinNearbyContent(transport: session.transport) }
}

private struct JoinNearbyContent: View {
    @EnvironmentObject var session: GameSession
    @ObservedObject var transport: PeerTransport
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        Screen(index: "01", title: "Join nearby") {
            VStack(alignment: .leading, spacing: Space.l) {
                Pulse()
                    .frame(maxWidth: .infinity)
                    .frame(height: 220)
                    .padding(.top, Space.m)
                Text("Hold your phone next to the host's.")
                    .font(.display(44))
                    .padding(.horizontal, Space.gutter)

                VStack(spacing: 0) {
                    Hairline()
                    ForEach(transport.nearbyLobbies) { lobby in
                        Button { session.join(lobby) } label: {
                            HStack {
                                Text(lobby.code).font(.display(40)).foregroundStyle(Color.signalRed)
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(lobby.hostName).font(.system(size: 17, weight: .semibold))
                                    FieldLabel("Hosting")
                                }
                                .padding(.leading, Space.s)
                                Spacer()
                                Text(session.joining == lobby ? "JOINING…" : "JOIN →")
                                    .font(.label(12)).tracking(1.5)
                            }
                            .padding(.vertical, Space.m)
                        }
                        .foregroundStyle(Color.inkBlack)
                        Hairline()
                    }
                    if transport.nearbyLobbies.isEmpty {
                        FieldLabel("Searching…").padding(.vertical, Space.m)
                    }
                }
                .padding(.horizontal, Space.gutter)
            }
        } footer: {
            Button("Cancel") { session.transport.stop(); dismiss() }.buttonStyle(.slabQuiet)
        }
        .presentationBackground(Color.paper)
        .onAppear { session.browseLobbies() }
        .onChange(of: session.state != nil) { _, joined in if joined { dismiss() } }
    }
}

/// Concentric halftone rings radiating out, like a signal being found.
struct Pulse: View {
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        TimelineView(.animation(paused: reduceMotion)) { ctx in
            Canvas { g, size in
                let t = ctx.date.timeIntervalSinceReferenceDate
                let c = CGPoint(x: size.width / 2, y: size.height / 2)
                let maxR = min(size.width, size.height) / 2
                let step: CGFloat = 12
                // Dots on a square grid; size follows a travelling wave outward.
                let n = Int(maxR / step)
                for i in -n...n {
                    for j in -n...n {
                        let p = CGPoint(x: c.x + CGFloat(i) * step, y: c.y + CGFloat(j) * step)
                        let d = hypot(p.x - c.x, p.y - c.y) / maxR
                        guard d <= 1 else { continue }
                        let wave = 0.5 + 0.5 * sin(Double(d) * 14 - t * 3.2)
                        let r = step * 0.46 * CGFloat(wave) * (1 - d * 0.75)
                        guard r > 0.6 else { continue }
                        g.fill(Path(ellipseIn: CGRect(x: p.x - r, y: p.y - r, width: r * 2, height: r * 2)), with: .color(.signalRed))
                    }
                }
            }
        }
        .accessibilityHidden(true)
    }
}

struct LobbyRoomView: View {
    @EnvironmentObject var session: GameSession
    @State private var showSettings = false

    var body: some View {
        let state = session.state!
        Screen(index: "01", title: "Lobby", trailing: "\(state.players.count) in", art: .lobby) {
            ScrollView {
                VStack(alignment: .leading, spacing: Space.l) {
                    VStack(alignment: .leading, spacing: Space.xs) {
                        FieldLabel("Lobby code")
                        Text(state.code)
                            .font(.display(128))
                            .tracking(4)
                            .foregroundStyle(Color.signalRed)
                        Text(session.isHost
                             ? "Friends join by holding their phone near yours and tapping Join nearby."
                             : "You're in. Waiting for the host to kick things off.")
                            .font(.system(size: 15))
                            .foregroundStyle(Palette.paper.muted)
                            .frame(maxWidth: 300, alignment: .leading)
                    }

                    VStack(spacing: 0) {
                        Hairline()
                        ForEach(state.players) { p in
                            PlayerRow(player: p, isHost: p.id == state.hostID, isMe: p.id == session.me.id)
                            Hairline()
                        }
                    }

                    SettingsSummary(settings: state.settings, editable: session.isHost) { showSettings = true }
                }
                .padding(.horizontal, Space.gutter)
            }
        } footer: {
            if session.isHost {
                Button("+ Add a bot (testing)") { session.addBot() }.buttonStyle(.slabQuiet)
                Button("Write quests") { session.send(.setPhase(.writing)) }.buttonStyle(.slab)
            } else {
                WaitingBar(text: "Waiting for host")
            }
            Button("LEAVE") { session.leave() }
                .font(.label(12)).tracking(1.5).foregroundStyle(Palette.paper.muted)
        }
        .sheet(isPresented: $showSettings) { GameSettingsView().presentationDetents([.large]) }
    }
}

/// "15 MIN · 3 SKIPS · AI REFILLS" with a way into the settings for the host.
struct SettingsSummary: View {
    let settings: GameSettings
    var editable: Bool
    var onEdit: () -> Void
    @Environment(\.palette) private var pal

    var body: some View {
        Button(action: onEdit) {
            HStack(spacing: Space.m) {
                Image(systemName: "slider.horizontal.3").font(.system(size: 18, weight: .bold))
                VStack(alignment: .leading, spacing: 2) {
                    Text("GAME SETTINGS").font(.display(24))
                    Text(summary).font(.label(11)).tracking(1).foregroundStyle(pal.muted)
                        .lineLimit(1).minimumScaleFactor(0.7)
                }
                Spacer()
                if editable { Text("EDIT →").font(.label(12)).tracking(1.5).foregroundStyle(pal.accent) }
            }
            .padding(Space.m)
            .background(pal.raised)
        }
        .foregroundStyle(pal.fg)
        .disabled(!editable)
    }

    private var summary: String {
        var parts = ["\(settings.durationMinutes) MIN"]
        parts.append(settings.allowSkips ? "\(settings.maxSkips) SKIPS" : "NO SKIPS")
        parts.append(settings.aiRefill ? "AI REFILLS" : "NO AI REFILLS")
        return parts.joined(separator: " · ")
    }
}

struct PlayerRow: View {
    let player: Player
    var isHost = false
    var isMe = false
    var trailing: String? = nil
    @Environment(\.palette) private var pal

    var body: some View {
        HStack(spacing: Space.m) {
            Avatar(name: player.name, highlighted: isMe)
            Text(player.name).font(.display(30))
            if isHost { Tag(text: "Host") }
            if player.isBot { Tag(text: "Bot") }
            Spacer()
            if let trailing { Text(trailing).font(.label(12)).tracking(1.5).foregroundStyle(pal.muted) }
        }
        .padding(.vertical, Space.s + 2)
    }
}

struct WaitingBar: View {
    let text: String
    @State private var on = false
    @Environment(\.palette) private var pal
    var body: some View {
        HStack(spacing: Space.s) {
            Rectangle().fill(pal.accent).frame(width: 8, height: 8).opacity(on ? 1 : 0.2)
                .animation(.easeInOut(duration: 0.8).repeatForever(), value: on)
            Text(text.uppercased()).font(.label(13)).tracking(2).foregroundStyle(pal.muted)
        }
        .frame(maxWidth: .infinity, minHeight: 60)
        .overlay(Rectangle().strokeBorder(pal.line, lineWidth: 2))
        .onAppear { on = true }
    }
}
