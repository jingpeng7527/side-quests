import SwiftUI

/// Stand-in friends for solo testing (e.g. one simulator). Runs only on the
/// host and drives bots through the same actions a real phone would send.
@MainActor
final class BotDirector {
    private weak var session: GameSession?
    private var tasks: [Task<Void, Never>] = []
    private var names = ["Juno", "Rook", "Mae", "Ozzie", "Bex", "Tamsin"].shuffled()

    private static let questIdeas = [
        "Get a stranger to rate your outfit out of ten",
        "Take a photo with something taller than a lamppost",
        "Find a menu item nobody in the group can pronounce",
        "Do a slow-motion movie walk past a shop window",
        "Convince someone to show you their lock screen",
        "Find the tiniest door in the neighborhood",
        "Pose like a statue next to an actual statue",
        "Get someone to sign your hand like you're famous",
        "Find a car the exact color of your shoes",
        "Hold a 10-second staring contest with a pigeon",
    ]

    init(session: GameSession) { self.session = session }

    func addBot() {
        guard let session, let name = names.popLast() else { return }
        session.hostApply(.join(Player(id: UUID(), name: name, isBot: true)))
        if let phase = session.state?.phase, phase == .writing { writeQuests(for: botIDs.last!) }
    }

    func stop() {
        tasks.forEach { $0.cancel() }
        tasks = []
    }

    private var botIDs: [UUID] { session?.state?.players.filter(\.isBot).map(\.id) ?? [] }

    func phaseChanged(to phase: Phase) {
        stop()
        switch phase {
        case .writing: botIDs.forEach(writeQuests)
        case .playing: botIDs.forEach(playQuests)
        case .verifying: botIDs.forEach(vote)
        default: break
        }
    }

    private func after(_ seconds: ClosedRange<Double>, _ work: @escaping @MainActor () -> Void) {
        tasks.append(Task { @MainActor in
            try? await Task.sleep(for: .seconds(Double.random(in: seconds)))
            if !Task.isCancelled { work() }
        })
    }

    private func writeQuests(for bot: UUID) {
        for _ in 0..<Int.random(in: 2...3) {
            after(1.5...7) { [weak self] in
                guard let session = self?.session, let s = session.state else { return }
                let used = Set(s.quests.map(\.text))
                guard let idea = Self.questIdeas.filter({ !used.contains($0) }).randomElement() else { return }
                let place = DemoPlaces.place(for: idea, near: session.location.current)
                session.hostApply(.addQuest(Quest(text: idea, place: place, authorID: bot, source: .human)))
            }
        }
    }

    private func playQuests(for bot: UUID) {
        tasks.append(Task { @MainActor [weak self] in
            while !Task.isCancelled {
                try? await Task.sleep(for: .seconds(Double.random(in: 10...28)))
                guard let self, let session = self.session, let s = session.state, s.phase == .playing else { return }
                guard let qid = s.assignments[bot], let quest = s.quest(qid) else { continue }
                if s.settings.allowSkips, Double.random(in: 0...1) < 0.12 {
                    session.hostApply(.skip(bot))
                    continue
                }
                let name = s.player(bot)?.name ?? "Bot"
                // Bots actually go to the quest's place, give or take a few steps.
                let base = quest.place?.coordinate ?? session.location.current ?? Coordinate(latitude: 37.3349, longitude: -122.0090)
                let jitter = quest.place == nil ? 0.004 : 0.0004
                let spot = Coordinate(latitude: base.latitude + .random(in: -jitter...jitter),
                                      longitude: base.longitude + .random(in: -jitter...jitter))
                let photo = ProofArt.render(quest: quest.text, by: name).proofJPEG() ?? Data()
                session.hostApply(.submit(Submission(id: UUID(), questID: qid, playerID: bot, photo: photo,
                                                     takenAt: .now, location: spot,
                                                     distanceFromPlace: quest.place.map { spot.distance(to: $0.coordinate) })))
            }
        })
    }

    private func vote(for bot: UUID) {
        guard let subs = session?.state?.submissions.filter({ $0.playerID != bot }) else { return }
        for sub in subs {
            after(1...6) { [weak self] in
                self?.session?.hostApply(.vote(submissionID: sub.id, voterID: bot, approve: Double.random(in: 0...1) < 0.85))
            }
        }
    }
}

/// Places for bot- and dev-written quests. Real landmarks around the
/// simulator's default San Francisco location; elsewhere, offsets from you.
enum DemoPlaces {
    private static let sf = Coordinate(latitude: 37.7749, longitude: -122.4194)
    private static let landmarks: [String: QuestPlace] = [
        "Pose like a statue next to an actual statue":
            QuestPlace(name: "Civic Center Plaza", coordinate: Coordinate(latitude: 37.7793, longitude: -122.4177), radius: 100),
        "Find the tiniest door in the neighborhood":
            QuestPlace(name: "Hayes Valley", coordinate: Coordinate(latitude: 37.7763, longitude: -122.4242), radius: 250),
        "Hold a 10-second staring contest with a pigeon":
            QuestPlace(name: "UN Plaza", coordinate: Coordinate(latitude: 37.7801, longitude: -122.4141), radius: 100),
        "Find a dog and learn its full name":
            QuestPlace(name: "Patricia's Green", coordinate: Coordinate(latitude: 37.7766, longitude: -122.4243), radius: 100),
    ]

    static func place(for quest: String, near here: Coordinate?) -> QuestPlace? {
        guard let landmark = landmarks[quest] else { return nil }
        guard let here, here.distance(to: sf) > 5_000 else { return landmark }
        // Not in SF: keep the same offset from you as the landmark has from SF.
        return QuestPlace(name: "Mystery spot",
                          coordinate: Coordinate(latitude: here.latitude + landmark.coordinate.latitude - sf.latitude,
                                                 longitude: here.longitude + landmark.coordinate.longitude - sf.longitude),
                          radius: landmark.radius)
    }
}

/// Generates a stand-in "photo" — used by bots, and by the simulator where
/// there's no camera. A duotone halftone print in the app's two inks.
enum ProofArt {
    static func render(quest: String, by name: String) -> UIImage {
        let size = CGSize(width: 900, height: 1200)
        let red = UIColor(red: 0.851, green: 0.141, blue: 0.110, alpha: 1)
        let paper = UIColor(red: 0.965, green: 0.949, blue: 0.925, alpha: 1)
        let ink = UIColor(red: 0.090, green: 0.067, blue: 0.059, alpha: 1)
        let (bg, dots, type) = [(red, paper, paper), (paper, red, ink), (ink, red, paper)].randomElement()!
        let art = Halftone(seed: .random(in: 0...UInt64.max),
                           focus: UnitPoint(x: .random(in: 0.2...0.9), y: .random(in: 0.55...0.95)),
                           reach: .random(in: 0.45...0.7), spacing: 22, angle: .random(in: 0...180), bars: .random(in: 2...6))
        return UIGraphicsImageRenderer(size: size).image { ctx in
            bg.setFill(); ctx.fill(CGRect(origin: .zero, size: size))
            art.draw(in: ctx.cgContext, size: size, color: dots.cgColor)

            let label = NSAttributedString(string: quest.uppercased(), attributes: [
                .font: UIFont.systemFont(ofSize: 76, weight: .black, width: .compressed),
                .foregroundColor: type,
            ])
            label.draw(with: CGRect(x: 56, y: 64, width: size.width - 112, height: 520),
                       options: [.usesLineFragmentOrigin, .truncatesLastVisibleLine], context: nil)
            let tag = NSAttributedString(string: "PROOF · \(name.uppercased())", attributes: [
                .font: UIFont.monospacedSystemFont(ofSize: 28, weight: .semibold),
                .foregroundColor: type,
            ])
            tag.draw(at: CGPoint(x: 56, y: size.height - 84))
        }
    }
}
