import Foundation

struct Player: Codable, Identifiable, Hashable {
    let id: UUID
    var name: String
    var isBot: Bool = false
}

enum QuestSource: String, Codable {
    case human, ai
}

/// A spot a quest has to be done at.
struct QuestPlace: Codable, Hashable {
    var name: String
    var coordinate: Coordinate
    /// How close counts as "there", in meters.
    var radius: Double = 100

    static let radiusOptions: [Double] = [50, 100, 250]
}

struct Quest: Codable, Identifiable, Hashable {
    let id: UUID
    var text: String
    var place: QuestPlace?
    /// nil for AI-written quests.
    var authorID: UUID?
    var source: QuestSource
    /// Whether the host kept this quest in the pool during review.
    var included: Bool = true

    init(id: UUID = UUID(), text: String, place: QuestPlace? = nil, authorID: UUID?, source: QuestSource, included: Bool = true) {
        self.id = id
        self.text = text
        self.place = place
        self.authorID = authorID
        self.source = source
        self.included = included
    }
}

struct GameSettings: Codable, Equatable {
    var durationMinutes: Int = 15
    var allowSkips: Bool = true
    var maxSkips: Int = 3
    /// Let the AI top up the pool when the human-written quests run out.
    var aiRefill: Bool = true
    /// Quests the AI writes up front, before the game starts.
    var aiStarterCount: Int = 3

    static let durationOptions = [2, 5, 10, 15, 30, 60]
}

struct Coordinate: Codable, Hashable {
    var latitude: Double
    var longitude: Double

    /// Great-circle distance in meters.
    func distance(to other: Coordinate) -> Double {
        let r = 6_371_000.0
        let (p1, p2) = (latitude * .pi / 180, other.latitude * .pi / 180)
        let dp = p2 - p1, dl = (other.longitude - longitude) * .pi / 180
        let a = sin(dp / 2) * sin(dp / 2) + cos(p1) * cos(p2) * sin(dl / 2) * sin(dl / 2)
        return 2 * r * atan2(sqrt(a), sqrt(1 - a))
    }
}

struct Submission: Codable, Identifiable, Hashable {
    let id: UUID
    var questID: UUID
    var playerID: UUID
    /// JPEG, already downscaled for sending over the local network.
    var photo: Data
    var takenAt: Date
    var location: Coordinate?
    /// For quests with a place: meters from it when the photo was taken.
    var distanceFromPlace: Double?
    /// voterID -> approved
    var votes: [UUID: Bool] = [:]

    var approvals: Int { votes.values.filter { $0 }.count }
    var rejections: Int { votes.values.filter { !$0 }.count }
    /// Benefit of the doubt: a tie (including no votes) counts.
    var isVerified: Bool { approvals >= rejections }

    func wasAtPlace(_ place: QuestPlace?) -> Bool? {
        guard let place, let d = distanceFromPlace else { return nil }
        return d <= place.radius
    }
}

enum Phase: String, Codable {
    case lobby, writing, review, playing, ended, verifying, scoreboard
}

struct GameState: Codable, Equatable {
    var code: String
    var hostID: UUID
    var phase: Phase = .lobby
    var players: [Player] = []
    var quests: [Quest] = []
    var settings = GameSettings()
    var startedAt: Date?
    var endsAt: Date?
    /// playerID -> current questID. Missing means waiting for a quest.
    var assignments: [UUID: UUID] = [:]
    /// playerID -> quest IDs they've already seen (done or skipped).
    var history: [UUID: [UUID]] = [:]
    var skipsUsed: [UUID: Int] = [:]
    var submissions: [Submission] = []
    var aiWriting: Bool = false

    func player(_ id: UUID) -> Player? { players.first { $0.id == id } }
    func quest(_ id: UUID) -> Quest? { quests.first { $0.id == id } }

    func score(for playerID: UUID) -> Int {
        submissions.filter { $0.playerID == playerID && $0.isVerified }.count
    }

    var ranking: [(player: Player, score: Int)] {
        players
            .map { ($0, score(for: $0.id)) }
            .sorted { $0.1 == $1.1 ? $0.0.name < $1.0.name : $0.1 > $1.1 }
    }
}

enum GameAction: Codable {
    case join(Player)
    case leave(UUID)
    case setPhase(Phase)
    case updateSettings(GameSettings)
    case addQuest(Quest)
    case editQuest(UUID, String)
    case removeQuest(UUID)
    case toggleQuest(UUID)
    case addAIQuests([String])
    case setAIWriting(Bool)
    case startGame
    case submit(Submission)
    case skip(UUID)
    case vote(submissionID: UUID, voterID: UUID, approve: Bool)
}
