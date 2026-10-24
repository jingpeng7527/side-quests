import Foundation
import SwiftUI

/// The device's view of the game. The host owns the authoritative state and
/// broadcasts it after every action; joiners forward their actions to the host.
@MainActor
final class GameSession: ObservableObject {
    @Published private(set) var state: GameState?
    @Published private(set) var isHost = false
    @Published var me: Player
    @Published private(set) var joining: NearbyLobby?

    let transport: PeerTransport
    let location = LocationProvider()
    private var bots: BotDirector?
    private var clock: Timer?

    init() {
        let defaults = UserDefaults.standard
        let id = defaults.string(forKey: "playerID").flatMap(UUID.init) ?? UUID()
        defaults.set(id.uuidString, forKey: "playerID")
        let name = defaults.string(forKey: "playerName") ?? ""
        me = Player(id: id, name: name)
        transport = PeerTransport(displayName: name.isEmpty ? "Player" : name)
        transport.onMessage = { [weak self] in self?.receive($0) }
    }

    func setName(_ name: String) {
        me.name = name
        UserDefaults.standard.set(name, forKey: "playerName")
    }

    // MARK: Lobby lifecycle

    func createLobby() {
        let code = String((0..<4).map { _ in "ABCDEFGHJKLMNPQRSTUVWXYZ".randomElement()! })
        var s = GameState(code: code, hostID: me.id)
        s.players = [me]
        state = s
        isHost = true
        bots = BotDirector(session: self)
        transport.host(code: code, hostName: me.name)
        transport.onPeerDropped = nil
        startClock()
        location.start()
    }

    func browseLobbies() {
        transport.browse()
    }

    func join(_ lobby: NearbyLobby) {
        joining = lobby
        isHost = false
        transport.join(lobby)
        location.start()
        // Introduce ourselves once the link is up.
        Task {
            for _ in 0..<30 {
                try? await Task.sleep(for: .milliseconds(500))
                if !transport.connectedPeers.isEmpty {
                    transport.send(.action(.join(me)))
                    return
                }
            }
            joining = nil
        }
    }

    func leave() {
        if !isHost { transport.send(.action(.leave(me.id))) }
        transport.disconnect()
        bots?.stop()
        bots = nil
        clock?.invalidate()
        state = nil
        isHost = false
        joining = nil
    }

    // MARK: Actions

    func send(_ action: GameAction) {
        if isHost {
            hostApply(action)
        } else {
            transport.send(.action(action))
        }
    }

    func addBot() {
        bots?.addBot()
    }

    private func receive(_ message: WireMessage) {
        switch message {
        case .state(let s):
            guard !isHost else { return }
            state = s
            joining = nil
            transport.stop()
        case .action(let a):
            guard isHost else { return }
            hostApply(a)
        }
    }

    func hostApply(_ action: GameAction) {
        guard isHost, var s = state else { return }
        let before = s.phase
        GameEngine.apply(action, to: &s)
        state = s
        transport.send(.state(s))
        if s.phase != before { bots?.phaseChanged(to: s.phase) }
        topUpQuestsIfNeeded()
    }

    // MARK: Host duties

    private func startClock() {
        clock?.invalidate()
        clock = Timer.scheduledTimer(withTimeInterval: 1, repeats: true) { [weak self] _ in
            Task { @MainActor in self?.tick() }
        }
    }

    private func tick() {
        guard isHost, let s = state, s.phase == .playing, let end = s.endsAt, Date.now >= end else { return }
        hostApply(.setPhase(.ended))
    }

    /// Writes the AI starter quests when the host moves into review.
    func generateStarterQuests() {
        guard let s = state, s.settings.aiStarterCount > 0 else { return }
        let already = s.quests.filter { $0.source == .ai }.count
        guard already < s.settings.aiStarterCount else { return }
        requestAIQuests(count: s.settings.aiStarterCount - already)
    }

    /// While playing, keep the pool ahead of the players.
    private func topUpQuestsIfNeeded() {
        guard let s = state, s.phase == .playing, s.settings.aiRefill, !s.aiWriting else { return }
        let fresh = GameEngine.freshQuestCount(in: s)
        let waiting = GameEngine.waitingPlayers(in: s).count
        if waiting > 0 || fresh < max(2, s.players.count) {
            requestAIQuests(count: max(4, s.players.count + waiting))
        }
    }

    func requestAIQuests(count: Int) {
        guard isHost, let s = state, !s.aiWriting else { return }
        hostApply(.setAIWriting(true))
        let human = s.quests.filter { $0.source == .human }.map(\.text)
        let all = s.quests.map(\.text)
        Task {
            let quests = await QuestGenerator.generate(count: count, inspiredBy: human, avoiding: all)
            hostApply(.addAIQuests(quests))
        }
    }

    #if DEBUG
    func devReplace(_ s: GameState) {
        guard isHost else { return }
        state = s
        transport.send(.state(s))
    }
    #endif

    // MARK: Convenience for views

    var myQuest: Quest? {
        guard let s = state, let id = s.assignments[me.id] else { return nil }
        return s.quest(id)
    }

    var mySkipsLeft: Int {
        guard let s = state else { return 0 }
        return s.settings.allowSkips ? max(0, s.settings.maxSkips - (s.skipsUsed[me.id] ?? 0)) : 0
    }

    func submitProof(_ image: UIImage) {
        guard let quest = myQuest, let data = image.proofJPEG() else { return }
        let here = location.current
        send(.submit(Submission(id: UUID(), questID: quest.id, playerID: me.id, photo: data,
                                takenAt: .now, location: here,
                                distanceFromPlace: quest.place.flatMap { p in here.map { $0.distance(to: p.coordinate) } })))
    }
}

extension UIImage {
    /// Small enough to ship to every phone in the lobby.
    func proofJPEG(maxSide: CGFloat = 640) -> Data? {
        let scale = min(1, maxSide / max(size.width, size.height))
        let target = CGSize(width: size.width * scale, height: size.height * scale)
        let resized = UIGraphicsImageRenderer(size: target).image { _ in draw(in: CGRect(origin: .zero, size: target)) }
        return resized.jpegData(compressionQuality: 0.6)
    }
}
