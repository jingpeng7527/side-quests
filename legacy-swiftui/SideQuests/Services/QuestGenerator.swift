import Foundation

/// Writes new side quests that match the vibe of what the lobby has written.
/// Uses Claude when an API key is configured, otherwise a local remixer so
/// the game never stalls.
enum QuestGenerator {
    static let apiKeyDefaultsKey = "anthropicAPIKey"

    static var apiKey: String? {
        let stored = UserDefaults.standard.string(forKey: apiKeyDefaultsKey)?.trimmingCharacters(in: .whitespaces)
        if let stored, !stored.isEmpty { return stored }
        // Launch-time override, e.g. `SIMCTL_CHILD_ANTHROPIC_API_KEY=... xcrun simctl launch ...`
        let env = ProcessInfo.processInfo.environment["ANTHROPIC_API_KEY"]
        return (env?.isEmpty == false) ? env : nil
    }

    static func generate(count: Int, inspiredBy examples: [String], avoiding: [String]) async -> [String] {
        if let key = apiKey {
            do {
                let quests = try await ClaudeQuestWriter(apiKey: key).write(count: count, examples: examples, avoiding: avoiding)
                if !quests.isEmpty { return quests }
            } catch {
                print("Claude quest generation failed, using local remix: \(error)")
            }
        }
        return LocalQuestRemixer.write(count: count, examples: examples, avoiding: avoiding)
    }
}

// MARK: - Claude

struct ClaudeQuestWriter {
    let apiKey: String
    var model = "claude-opus-5-5"

    enum WriterError: Error { case http(Int, String), refusal, malformed }

    private static let system = """
    You write side quests for a party game played in person by a group of friends. \
    Each quest is a short, concrete dare or mission a player can complete in a few minutes \
    and prove with a single photo. Match the group's vibe — their humor, boldness, setting \
    and level of chaos — as shown by the quests they wrote themselves. Keep quests legal, \
    safe, and kind to strangers. Each quest is one sentence, under 90 characters, \
    imperative voice, no numbering or emoji.
    """

    func write(count: Int, examples: [String], avoiding: [String]) async throws -> [String] {
        let exampleList = examples.isEmpty
            ? "(The group hasn't written any yet — go for playful, low-stakes chaos.)"
            : examples.map { "- \($0)" }.joined(separator: "\n")
        let avoidList = avoiding.isEmpty ? "" : "\n\nAlready in play (don't repeat or closely paraphrase):\n"
            + avoiding.map { "- \($0)" }.joined(separator: "\n")
        let prompt = "Quests this group wrote:\n\(exampleList)\(avoidList)\n\nWrite \(count) new quests in the same vibe."

        let body: [String: Any] = [
            "model": model,
            "max_tokens": 16000,
            "system": Self.system,
            "messages": [["role": "user", "content": prompt]],
            // Re-run on Anthropic's recommended fallback model if a safety classifier declines.
            "fallbacks": "default",
            "output_config": [
                "effort": "medium",
                "format": [
                    "type": "json_schema",
                    "schema": [
                        "type": "object",
                        "properties": ["quests": ["type": "array", "items": ["type": "string"]]],
                        "required": ["quests"],
                        "additionalProperties": false,
                    ],
                ],
            ],
        ]

        var request = URLRequest(url: URL(string: "https://api.anthropic.com/v1/messages")!)
        request.httpMethod = "POST"
        request.timeoutInterval = 120
        request.setValue("application/json", forHTTPHeaderField: "content-type")
        request.setValue(apiKey, forHTTPHeaderField: "x-api-key")
        request.setValue("2023-06-01", forHTTPHeaderField: "anthropic-version")
        request.setValue("server-side-fallback-2026-07-01", forHTTPHeaderField: "anthropic-beta")
        request.httpBody = try JSONSerialization.data(withJSONObject: body)

        let (data, response) = try await URLSession.shared.data(for: request)
        let status = (response as? HTTPURLResponse)?.statusCode ?? 0
        guard status == 200 else { throw WriterError.http(status, String(decoding: data, as: UTF8.self)) }

        guard let json = try JSONSerialization.jsonObject(with: data) as? [String: Any] else { throw WriterError.malformed }
        if json["stop_reason"] as? String == "refusal" { throw WriterError.refusal }
        let blocks = json["content"] as? [[String: Any]] ?? []
        guard let text = blocks.first(where: { $0["type"] as? String == "text" })?["text"] as? String,
              let payload = try JSONSerialization.jsonObject(with: Data(text.utf8)) as? [String: Any],
              let quests = payload["quests"] as? [String]
        else { throw WriterError.malformed }

        return quests
            .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
            .filter { !$0.isEmpty }
            .prefix(count)
            .map { $0 }
    }
}

// MARK: - Offline fallback

enum LocalQuestRemixer {
    private static let bank = [
        "Get a stranger to teach you a secret handshake",
        "Recreate a famous painting using only things in your pockets",
        "Find something older than everyone in the group combined",
        "Convince someone to swap an object with you",
        "Take a dramatic album-cover shot in the nearest doorway",
        "Find a dog and learn its full name",
        "Build a tower of five unrelated objects",
        "Get a high five from someone wearing a hat",
        "Find the most aggressively orange thing nearby",
        "Strike a superhero pose on top of something (safely)",
        "Order something using only a fake accent",
        "Find a sign with a typo",
        "Make a tiny shrine to a random object",
        "Get three strangers to point at the sky",
        "Photograph your reflection in something that isn't a mirror",
        "Find a plant that looks like a friend in the group",
        "Learn one word in a language you don't speak from a stranger",
        "Do your best runway walk across a crosswalk",
        "Find something shaped like a letter in your name",
        "Get a compliment from someone you've never met",
    ]

    static func write(count: Int, examples: [String], avoiding: [String]) -> [String] {
        let used = Set((examples + avoiding).map { $0.lowercased() })
        return Array(bank.filter { !used.contains($0.lowercased()) }.shuffled().prefix(count))
    }
}
