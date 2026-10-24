import Foundation

/// Pure game rules. Only the host runs `apply`; everyone else gets the
/// resulting state over the wire.
enum GameEngine {
    static func apply(_ action: GameAction, to state: inout GameState, now: Date = .now) {
        switch action {
        case .join(let player):
            guard !state.players.contains(where: { $0.id == player.id }) else { return }
            state.players.append(player)
            if state.phase == .playing { assignNext(to: player.id, in: &state) }

        case .leave(let id):
            state.players.removeAll { $0.id == id }
            state.assignments[id] = nil

        case .setPhase(let phase):
            state.phase = phase

        case .updateSettings(let settings):
            state.settings = settings

        case .addQuest(let quest):
            let text = quest.text.trimmingCharacters(in: .whitespacesAndNewlines)
            guard !text.isEmpty else { return }
            var q = quest
            q.text = text
            state.quests.append(q)
            fillWaiting(in: &state)

        case .editQuest(let id, let text):
            if let i = state.quests.firstIndex(where: { $0.id == id }) { state.quests[i].text = text }

        case .removeQuest(let id):
            state.quests.removeAll { $0.id == id }

        case .toggleQuest(let id):
            if let i = state.quests.firstIndex(where: { $0.id == id }) { state.quests[i].included.toggle() }

        case .addAIQuests(let texts):
            let existing = Set(state.quests.map { $0.text.lowercased() })
            for t in texts where !existing.contains(t.lowercased()) {
                state.quests.append(Quest(text: t, authorID: nil, source: .ai))
            }
            state.aiWriting = false
            fillWaiting(in: &state)

        case .setAIWriting(let writing):
            state.aiWriting = writing

        case .startGame:
            state.phase = .playing
            state.startedAt = now
            state.endsAt = now.addingTimeInterval(TimeInterval(state.settings.durationMinutes * 60))
            state.assignments = [:]
            state.history = [:]
            state.skipsUsed = [:]
            state.submissions = []
            for p in state.players.shuffled() { assignNext(to: p.id, in: &state) }

        case .submit(let submission):
            guard state.phase == .playing,
                  state.assignments[submission.playerID] == submission.questID else { return }
            state.submissions.append(submission)
            state.history[submission.playerID, default: []].append(submission.questID)
            assignNext(to: submission.playerID, in: &state)

        case .skip(let playerID):
            guard state.phase == .playing, state.settings.allowSkips,
                  state.skipsUsed[playerID, default: 0] < state.settings.maxSkips,
                  let current = state.assignments[playerID] else { return }
            state.skipsUsed[playerID, default: 0] += 1
            state.history[playerID, default: []].append(current)
            assignNext(to: playerID, in: &state)

        case .vote(let submissionID, let voterID, let approve):
            if let i = state.submissions.firstIndex(where: { $0.id == submissionID }),
               state.submissions[i].playerID != voterID {
                state.submissions[i].votes[voterID] = approve
            }
        }
    }

    /// Picks a quest this player hasn't written or seen, preferring ones no
    /// one else is currently on. Leaves the player waiting if the pool is dry.
    static func assignNext(to playerID: UUID, in state: inout GameState) {
        state.assignments[playerID] = nil
        let seen = Set(state.history[playerID] ?? [])
        let taken = Set(state.assignments.values)
        let eligible = state.quests.filter {
            $0.included && $0.authorID != playerID && !seen.contains($0.id)
        }
        let pick = eligible.filter { !taken.contains($0.id) }.randomElement() ?? eligible.randomElement()
        state.assignments[playerID] = pick?.id
    }

    static func fillWaiting(in state: inout GameState) {
        guard state.phase == .playing else { return }
        for p in state.players where state.assignments[p.id] == nil {
            assignNext(to: p.id, in: &state)
        }
    }

    /// Quests still unseen by at least one player — when this runs low the
    /// host asks the AI for more.
    static func freshQuestCount(in state: GameState) -> Int {
        let taken = Set(state.assignments.values)
        return state.quests.filter { q in
            q.included && !taken.contains(q.id) &&
            state.players.contains { p in q.authorID != p.id && !(state.history[p.id] ?? []).contains(q.id) }
        }.count
    }

    static func waitingPlayers(in state: GameState) -> [Player] {
        state.players.filter { state.assignments[$0.id] == nil }
    }
}
