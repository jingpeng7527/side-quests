import SwiftUI
import MapKit

struct EndGameView: View {
    @EnvironmentObject var session: GameSession

    var body: some View {
        let state = session.state!
        let mine = state.submissions.filter { $0.playerID == session.me.id }.sorted { $0.takenAt < $1.takenAt }
        let route = mine.compactMap(\.location).map { CLLocationCoordinate2D(latitude: $0.latitude, longitude: $0.longitude) }

        Screen(index: "05", title: "Time's up", tone: .signal, art: .gameOver) {
            VStack(alignment: .leading, spacing: Space.m) {
                VStack(alignment: .leading, spacing: -26) {
                    Text("GAME")
                    Text("OVER")
                }
                .font(.display(120))
                .foregroundStyle(Color.paperBright)
                .fixedSize(horizontal: false, vertical: true)
                    .padding(.horizontal, Space.gutter)

                HStack(spacing: 0) {
                    Stat(value: "\(mine.count)", label: "Quests done")
                    Stat(value: "\(state.skipsUsed[session.me.id] ?? 0)", label: "Skipped")
                    Stat(value: "\(state.submissions.count)", label: "Lobby total")
                }
                .padding(.horizontal, Space.gutter)

                // Your route: where each proof was snapped, in order.
                Map {
                    if route.count > 1 {
                        MapPolyline(coordinates: route).stroke(Color.signalRed, style: StrokeStyle(lineWidth: 4, lineCap: .round, lineJoin: .round))
                    }
                    ForEach(Array(route.enumerated()), id: \.offset) { i, c in
                        Annotation("", coordinate: c) {
                            Text("\(i + 1)")
                                .font(.numerals(12))
                                .frame(width: 22, height: 22)
                                .foregroundStyle(i == route.count - 1 ? Color.paperBright : Color.signalRed)
                                .background(i == route.count - 1 ? Color.signalRed : Color.paperBright)
                                .overlay(Rectangle().strokeBorder(Color.signalRed, lineWidth: 2))
                        }
                    }
                }
                .mapStyle(.standard(elevation: .flat, pointsOfInterest: .excludingAll))
                .environment(\.colorScheme, .light)
                .overlay(Rectangle().strokeBorder(Color.paperBright, lineWidth: 3))
                .overlay {
                    if route.isEmpty {
                        Text("NO PINS DROPPED").font(.label(12)).tracking(1.5).foregroundStyle(Color.paperBright)
                            .padding(Space.s).background(Color.signalRed)
                    }
                }
                .padding(.horizontal, Space.gutter)
            }
        } footer: {
            if session.isHost {
                Button("Verify proofs") { session.send(.setPhase(.verifying)) }.buttonStyle(.slab)
            } else {
                WaitingBar(text: "Waiting for verification")
            }
        }
    }
}

struct Stat: View {
    let value: String
    let label: String
    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(value).font(.display(48))
            FieldLabel(label)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

/// Everyone judges everyone else's proof.
struct VerificationView: View {
    @EnvironmentObject var session: GameSession
    @State private var zoomed: Submission?

    var body: some View {
        let state = session.state!
        let others = state.submissions.filter { $0.playerID != session.me.id }.sorted { $0.takenAt < $1.takenAt }
        let judged = others.filter { $0.votes[session.me.id] != nil }.count

        Screen(index: "06", title: "Verify", trailing: "\(judged)/\(others.count) judged") {
            ScrollView {
                LazyVStack(spacing: 0) {
                    Hairline()
                    ForEach(others) { sub in
                        ProofRow(submission: sub, state: state, myVote: sub.votes[session.me.id],
                                 onZoom: { zoomed = sub },
                                 onVote: { session.send(.vote(submissionID: sub.id, voterID: session.me.id, approve: $0)) })
                        Hairline()
                    }
                    if others.isEmpty {
                        Text("No one else submitted anything. Brutal.")
                            .font(.display(34)).foregroundStyle(Color.stone).padding(.top, Space.xl)
                    }
                }
                .padding(.horizontal, Space.gutter)
            }
        } footer: {
            if session.isHost {
                Button("Final scores") { session.send(.setPhase(.scoreboard)) }.buttonStyle(.slab)
            } else {
                WaitingBar(text: "Host reveals scores")
            }
        }
        .sheet(item: $zoomed) { sub in
            if let img = UIImage(data: sub.photo) {
                Image(uiImage: img).resizable().scaledToFit()
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                    .background(Color.inkBlack)
                    .presentationBackground(Color.inkBlack)
            }
        }
    }
}

struct ProofRow: View {
    let submission: Submission
    let state: GameState
    let myVote: Bool?
    let onZoom: () -> Void
    let onVote: (Bool) -> Void

    var body: some View {
        HStack(alignment: .top, spacing: Space.m) {
            VStack(alignment: .leading, spacing: Space.s) {
                HStack(spacing: Space.s) {
                    Text(state.player(submission.playerID)?.name.uppercased() ?? "—")
                        .font(.label(11)).tracking(1.5).foregroundStyle(Color.signalRed)
                    if let place = state.quest(submission.questID)?.place {
                        switch submission.wasAtPlace(place) {
                        case true?: Tag(text: "At the spot", filled: true)
                        case false?: Tag(text: Distance.label(submission.distanceFromPlace ?? 0) + " off")
                        case nil: Tag(text: "No location")
                        }
                    }
                }
                Text(state.quest(submission.questID)?.text ?? "")
                    .font(.system(size: 17, weight: .semibold))
                    .fixedSize(horizontal: false, vertical: true)
                HStack(spacing: Space.s) {
                    VoteButton(symbol: "checkmark", active: myVote == true) { onVote(true) }
                        .accessibilityLabel("Approve")
                    VoteButton(symbol: "xmark", active: myVote == false) { onVote(false) }
                        .accessibilityLabel("Reject")
                    Spacer()
                    Text("\(submission.approvals)✓ \(submission.rejections)✗")
                        .font(.numerals(12)).foregroundStyle(Color.stone)
                }
                .padding(.top, Space.xs)
            }
            Button(action: onZoom) {
                ProofThumb(data: submission.photo).frame(width: 96, height: 128)
            }
            .accessibilityLabel("View photo")
        }
        .padding(.vertical, Space.m)
    }
}

struct VoteButton: View {
    let symbol: String
    let active: Bool
    let action: () -> Void
    var body: some View {
        Button(action: action) {
            Image(systemName: symbol)
                .font(.system(size: 16, weight: .heavy))
                .frame(width: 52, height: 40)
                .foregroundStyle(active ? Color.paperBright : Color.inkBlack)
                .background(active ? Color.signalRed : Color.clear)
                .overlay(Rectangle().strokeBorder(active ? Color.clear : Color.paperLine, lineWidth: 2))
        }
        .sensoryFeedback(.selection, trigger: active)
    }
}

struct ProofThumb: View {
    let data: Data
    var body: some View {
        Group {
            if let img = UIImage(data: data) {
                Image(uiImage: img).resizable().scaledToFill()
            } else {
                Color.paperRaised
            }
        }
        .clipped()
    }
}

struct ScoreboardView: View {
    @EnvironmentObject var session: GameSession

    var body: some View {
        let state = session.state!
        let ranking = state.ranking
        let verified = state.submissions.filter(\.isVerified).sorted { $0.takenAt > $1.takenAt }

        Screen(index: "07", title: "Scoreboard") {
            ScrollView {
                VStack(alignment: .leading, spacing: Space.l) {
                    if let winner = ranking.first {
                        let tied = ranking.count > 1 && ranking[1].score == winner.score
                        VStack(alignment: .leading, spacing: 0) {
                            FieldLabel(tied ? "Tied at the top" : "Winner")
                            Text(winner.player.name.uppercased())
                                .font(.display(112))
                                .lineLimit(1).minimumScaleFactor(0.4)
                            Text("\(winner.score) verified quests").font(.system(size: 17, weight: .semibold))
                        }
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(Space.l)
                        .padding(.top, Space.xl)
                        .background {
                            ZStack { Color.signalRed; HalftoneView(spec: .winner, color: .deepRed) }
                        }
                        .foregroundStyle(Color.paperBright)
                        .environment(\.palette, .signal)
                    }

                    VStack(spacing: 0) {
                        Hairline()
                        ForEach(Array(ranking.enumerated()), id: \.element.player.id) { i, row in
                            HStack(spacing: Space.m) {
                                Text(String(format: "%02d", i + 1))
                                    .font(.numerals(16))
                                    .foregroundStyle(i == 0 ? Color.signalRed : Color.stone)
                                    .frame(width: 28, alignment: .leading)
                                Text(row.player.name).font(.display(32))
                                if row.player.id == session.me.id { Tag(text: "You") }
                                Spacer()
                                Text("\(row.score)").font(.display(40))
                            }
                            .padding(.vertical, Space.s)
                            Hairline()
                        }
                    }

                    if !verified.isEmpty {
                        FieldLabel("The evidence")
                        LazyVGrid(columns: [GridItem(.flexible(), spacing: 2), GridItem(.flexible(), spacing: 2), GridItem(.flexible(), spacing: 2)], spacing: 2) {
                            ForEach(verified) { sub in
                                ProofThumb(data: sub.photo)
                                    .aspectRatio(3 / 4, contentMode: .fit)
                                    .overlay(alignment: .bottomLeading) {
                                        Text(state.player(sub.playerID)?.name.uppercased() ?? "")
                                            .font(.label(9)).tracking(1)
                                            .foregroundStyle(Color.paperBright)
                                            .padding(4).background(Color.inkBlack)
                                    }
                            }
                        }
                    }
                }
                .padding(.horizontal, Space.gutter)
                .padding(.bottom, Space.l)
            }
        } footer: {
            if session.isHost {
                Button("Run it back") { session.send(.setPhase(.writing)) }.buttonStyle(.slab)
            }
            Button("Leave lobby") { session.leave() }.buttonStyle(.slabQuiet)
        }
    }
}
