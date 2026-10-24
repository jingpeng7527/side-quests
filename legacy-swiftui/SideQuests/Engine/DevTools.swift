import SwiftUI

/// Debug-only shortcuts. The DEV tag sits in the corner of every game
/// screen; release builds render nothing.
struct DevMenu: View {
    @EnvironmentObject var session: GameSession
    @Environment(\.palette) private var pal

    var body: some View {
        #if DEBUG
        if let phase = session.state?.phase {
            Menu {
                Button("Skip to end of game", systemImage: "forward.end.fill") { session.devSkipToEnd() }
                    .disabled(phase == .ended || phase == .verifying || phase == .scoreboard)
                if phase == .playing {
                    Button("Bots complete a quest each", systemImage: "camera") { session.devSimulateRounds(1) }
                    Button("Add 30s to the clock", systemImage: "plus") { session.devAddTime(30) }
                    Button("Deal me a quest with a place", systemImage: "mappin") { session.devDealPlaceQuest() }
                }
                Divider()
                Button("Jump to verification", systemImage: "checkmark.seal") { session.devJump(to: .verifying) }
                Button("Jump to scoreboard", systemImage: "trophy") { session.devJump(to: .scoreboard) }
                if session.isHost {
                    Button("Add a bot", systemImage: "person.badge.plus") { session.addBot() }
                }
            } label: {
                Text("DEV")
                    .font(.label(10)).tracking(1.2)
                    .padding(.horizontal, 6).padding(.vertical, 3)
                    .foregroundStyle(pal.bg)
                    .background(pal.fg)
            }
            .accessibilityLabel("Developer shortcuts")
        }
        #endif
    }
}

#if DEBUG
extension GameSession {
    /// Ends the game now. If it hasn't started, deals and plays a few
    /// simulated rounds first so the results screens have something to show.
    func devSkipToEnd() {
        guard let phase = state?.phase else { return }
        if [.lobby, .writing, .review].contains(phase) {
            if state!.players.count < 2 { addBot(); addBot() }
            devSeedQuests()
            send(.startGame)
            devSimulateRounds(3)
        }
        send(.setPhase(.ended))
    }

    func devJump(to target: Phase) {
        if state?.phase != .ended && state?.phase != .verifying { devSkipToEnd() }
        if target == .scoreboard, let s = state {
            for sub in s.submissions {
                for p in s.players where p.isBot && p.id != sub.playerID && sub.votes[p.id] == nil {
                    send(.vote(submissionID: sub.id, voterID: p.id, approve: .random(in: 0...1) < 0.8))
                }
            }
        }
        send(.setPhase(target))
    }

    func devDealPlaceQuest() {
        guard isHost, var s = state else { return }
        let seen = Set(s.history[me.id] ?? [])
        guard let q = s.quests.first(where: { $0.place != nil && $0.included && $0.authorID != me.id && !seen.contains($0.id) })
        else { return }
        s.assignments[me.id] = q.id
        devReplace(s)
    }

    func devAddTime(_ seconds: TimeInterval) {
        guard isHost, var s = state, let end = s.endsAt else { return }
        s.endsAt = end.addingTimeInterval(seconds)
        devReplace(s)
    }

    /// Every player — you included — completes their current quest.
    func devSimulateRounds(_ rounds: Int) {
        let base = location.current ?? Coordinate(latitude: 37.7749, longitude: -122.4194)
        for round in 0..<rounds {
            guard let s = state else { return }
            for p in s.players {
                guard let s = state, let qid = s.assignments[p.id], let q = s.quest(qid) else { continue }
                var spot = Coordinate(latitude: base.latitude + Double(round + 1) * 0.0018 + .random(in: -0.0012...0.0012),
                                      longitude: base.longitude + Double(round + 1) * 0.0014 + .random(in: -0.0012...0.0012))
                if let place = q.place {
                    // Most players make it to the spot; some fudge it from a few blocks away.
                    let j = Bool.random() || Bool.random() ? 0.0003 : 0.006
                    spot = Coordinate(latitude: place.coordinate.latitude + .random(in: -j...j),
                                      longitude: place.coordinate.longitude + .random(in: -j...j))
                }
                let photo = ProofArt.render(quest: q.text, by: p.name).proofJPEG() ?? Data()
                send(.submit(Submission(id: UUID(), questID: qid, playerID: p.id, photo: photo,
                                        takenAt: .now.addingTimeInterval(Double(round * 45)), location: spot,
                                        distanceFromPlace: q.place.map { spot.distance(to: $0.coordinate) })))
            }
        }
    }

    func devSeedQuests() {
        guard let s = state else { return }
        let ideas = [
            "Get a stranger to rate your outfit out of ten",
            "Find the tiniest door in the neighborhood",
            "Pose like a statue next to an actual statue",
            "Convince someone to swap an object with you",
            "Find a car the exact color of your shoes",
            "Hold a 10-second staring contest with a pigeon",
            "Get someone to sign your hand like you're famous",
            "Recreate an album cover in a doorway",
        ]
        let have = Set(s.quests.map(\.text))
        for (n, text) in ideas.enumerated() where !have.contains(text) {
            let author = s.players[n % s.players.count]
            send(.addQuest(Quest(text: text, place: DemoPlaces.place(for: text, near: location.current),
                                 authorID: author.id, source: n >= 6 ? .ai : .human)))
        }
    }

    /// `-dummyRun` sets up a real game to play by hand: a lobby with three
    /// bots and a short clock, already in the writing phase. Add `-autopilot`
    /// and the host plays itself through every phase on the real clock.
    /// `-minutes <n>` overrides the game length (default 2).
    func startDummyRunIfRequested() {
        let args = ProcessInfo.processInfo.arguments
        guard args.contains("-dummyRun") else { return }
        let minutes = args.firstIndex(of: "-minutes").flatMap { args.indices.contains($0 + 1) ? Int(args[$0 + 1]) : nil } ?? 2

        if me.name.isEmpty { setName("Ryan") }
        createLobby()
        for _ in 0..<3 { addBot() }
        var settings = state!.settings
        settings.durationMinutes = minutes
        settings.aiStarterCount = 2
        send(.updateSettings(settings))
        send(.setPhase(.writing))
        for text in ["Get a stranger to teach you their best dance move", "Find a dog and learn its full name"] {
            send(.addQuest(Quest(text: text, place: DemoPlaces.place(for: text, near: location.current),
                                 authorID: me.id, source: .human)))
        }
        guard args.contains("-autopilot") else { return }

        Task { @MainActor in
            func log(_ s: String) { print("[autopilot] \(s)") }
            func wait(_ seconds: Double) async { try? await Task.sleep(for: .seconds(seconds)) }

            await wait(8)
            log("quests written: \(state?.quests.count ?? 0)")
            send(.setPhase(.review))
            generateStarterQuests()
            await wait(4)
            log("deck: \(state?.quests.count ?? 0) (\(state?.quests.filter { $0.source == .ai }.count ?? 0) AI)")
            send(.startGame)
            log("dealt, game ends \(state?.endsAt?.formatted(date: .omitted, time: .standard) ?? "?")")

            while state?.phase == .playing {
                await wait(12)
                guard state?.phase == .playing, let q = myQuest else { continue }
                submitProof(ProofArt.render(quest: q.text, by: me.name))
                log("submitted '\(q.text)'; lobby total \(state?.submissions.count ?? 0), fresh in deck \(state.map(GameEngine.freshQuestCount) ?? 0)")
            }
            log("clock ran out → \(state?.phase.rawValue ?? "?")")

            await wait(5)
            send(.setPhase(.verifying))
            for sub in state?.submissions ?? [] where sub.playerID != me.id {
                send(.vote(submissionID: sub.id, voterID: me.id, approve: true))
            }
            await wait(8)
            send(.setPhase(.scoreboard))
            log("final: " + (state?.ranking.map { "\($0.player.name) \($0.score)" }.joined(separator: ", ") ?? ""))
        }
    }

    /// `-demoPhase <phase>` launches straight into a seeded lobby (you + three
    /// bots) at that phase, for screenshots and UI iteration.
    func seedDemoIfRequested() {
        let args = ProcessInfo.processInfo.arguments
        guard let i = args.firstIndex(of: "-demoPhase"), i + 1 < args.count,
              let phase = Phase(rawValue: args[i + 1]) else { return }

        if me.name.isEmpty { setName("Ryan") }
        createLobby()
        for _ in 0..<3 { addBot() }
        guard phase != .lobby else { return }
        devSeedQuests()
        send(.setPhase(.writing))
        guard phase != .writing else { return }
        send(.setPhase(.review))
        guard phase != .review else { return }
        send(.startGame)
        if args.contains("-placeQuest") { devDealPlaceQuest() }
        guard phase != .playing else { return }
        devSimulateRounds(3)
        send(.setPhase(.ended))
        guard phase != .ended else { return }
        devJump(to: phase)
    }
}
#endif
