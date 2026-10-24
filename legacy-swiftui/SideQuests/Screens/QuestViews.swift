import SwiftUI

/// Everyone writes quests. Yours are visible; others' stay sealed so they
/// can surprise you; the AI section previews how many it'll add.
struct QuestsView: View {
    @EnvironmentObject var session: GameSession
    @State private var draft = ""
    @State private var draftPlace: QuestPlace?
    @State private var pickingPlace = false
    @State private var showSettings = false
    @FocusState private var focused: Bool

    var body: some View {
        let state = session.state!
        let mine = state.quests.filter { $0.authorID == session.me.id }
        let shared = state.quests.filter { $0.source == .human && $0.authorID != session.me.id }

        Screen(index: "02", title: "Write quests", trailing: "\(state.quests.count) total") {
            ScrollView {
                VStack(alignment: .leading, spacing: Space.xl) {
                    // YOURS
                    VStack(alignment: .leading, spacing: Space.m) {
                        SectionHead(title: "Yours", count: mine.count)
                        HStack(alignment: .bottom, spacing: Space.s) {
                            TextField("", text: $draft, prompt: Text("Get a stranger to…").foregroundStyle(Color.stone.opacity(0.6)), axis: .vertical)
                                .font(.display(30))
                                .lineLimit(1...4)
                                .focused($focused)
                                .submitLabel(.done)
                                .onSubmit(add)
                            Button { pickingPlace = true } label: {
                                Image(systemName: draftPlace == nil ? "mappin.and.ellipse" : "mappin")
                                    .font(.system(size: 18, weight: .heavy))
                                    .frame(width: 48, height: 48)
                                    .foregroundStyle(draftPlace == nil ? Color.inkBlack : Color.paperBright)
                                    .background(draftPlace == nil ? Color.clear : Color.inkBlack)
                                    .overlay(Rectangle().strokeBorder(Color.inkBlack, lineWidth: 2))
                            }
                            .accessibilityLabel(draftPlace == nil ? "Set a place" : "Change place")
                            Button(action: add) {
                                Image(systemName: "plus")
                                    .font(.system(size: 20, weight: .heavy))
                                    .frame(width: 48, height: 48)
                                    .background(Color.signalRed)
                                    .foregroundStyle(Color.paperBright)
                            }
                            .disabled(draft.trimmingCharacters(in: .whitespaces).isEmpty)
                            .accessibilityLabel("Add quest")
                        }
                        Hairline(emphasized: focused)
                        if let place = draftPlace {
                            PlaceChip(place: place) { draftPlace = nil }
                        } else {
                            Text("Tap the pin to make it happen somewhere specific.")
                                .font(.system(size: 13)).foregroundStyle(Color.stone)
                        }
                        ForEach(mine) { q in
                            HStack(alignment: .top) {
                                VStack(alignment: .leading, spacing: 6) {
                                    Text(q.text).font(.system(size: 17, weight: .medium))
                                    if let place = q.place { PlaceChip(place: place) }
                                }
                                Spacer()
                                Button { session.send(.removeQuest(q.id)) } label: {
                                    Image(systemName: "xmark").font(.system(size: 13, weight: .bold)).foregroundStyle(Color.stone)
                                }
                                .accessibilityLabel("Remove quest")
                            }
                            .padding(.vertical, Space.xs)
                        }
                    }

                    // SHARED
                    VStack(alignment: .leading, spacing: Space.m) {
                        SectionHead(title: "Shared", count: shared.count)
                        let authors = state.players.filter { $0.id != session.me.id }
                        if authors.isEmpty {
                            Text("Nobody else here yet.").foregroundStyle(Color.stone)
                        }
                        ForEach(authors) { p in
                            let n = shared.filter { $0.authorID == p.id }.count
                            HStack(spacing: Space.m) {
                                Avatar(name: p.name, size: 28)
                                Text(p.name).font(.system(size: 17, weight: .semibold))
                                Spacer()
                                SealedStack(count: n)
                            }
                        }
                        Text("Sealed — you'll only see these if you're dealt one.")
                            .font(.system(size: 13)).foregroundStyle(Color.stone)
                    }

                    // AI
                    VStack(alignment: .leading, spacing: Space.m) {
                        SectionHead(title: "AI", count: state.settings.aiStarterCount)
                        Text(state.settings.aiRefill
                             ? "Claude reads the vibe of your quests and adds \(state.settings.aiStarterCount) to the deck — plus more whenever it runs dry mid-game."
                             : "Claude adds \(state.settings.aiStarterCount) quests in your vibe. Mid-game refills are off.")
                            .font(.system(size: 15)).foregroundStyle(Color.stone)
                        if session.isHost {
                            Stepper(value: Binding(
                                get: { state.settings.aiStarterCount },
                                set: { var s = state.settings; s.aiStarterCount = $0; session.send(.updateSettings(s)) }
                            ), in: 0...10) {
                                Text("Starter quests").font(.label(12)).tracking(1.5).foregroundStyle(Color.inkBlack)
                            }
                        }
                    }
                }
                .padding(.horizontal, Space.gutter)
                .padding(.bottom, Space.l)
            }
            .scrollDismissesKeyboard(.interactively)
        } footer: {
            if session.isHost {
                SettingsSummary(settings: state.settings, editable: true) { showSettings = true }
                HStack(spacing: Space.s) {
                    Button("Review deck") {
                        session.send(.setPhase(.review))
                        session.generateStarterQuests()
                    }
                    .buttonStyle(.slab)
                    .disabled(state.quests.isEmpty && state.settings.aiStarterCount == 0)
                }
            } else {
                WaitingBar(text: "Host reviews when ready")
            }
        }
        .sheet(isPresented: $showSettings) { GameSettingsView().presentationDetents([.large]) }
        #if DEBUG
        .onAppear { if CommandLine.arguments.contains("-showPlacePicker") { pickingPlace = true } }
        #endif
        .sheet(isPresented: $pickingPlace) {
            PlacePickerView(start: session.location.current) { place in
                if let place { draftPlace = place }
                pickingPlace = false
            }
            .interactiveDismissDisabled()
        }
    }

    private func add() {
        let text = draft.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty else { return }
        session.send(.addQuest(Quest(text: text, place: draftPlace, authorID: session.me.id, source: .human)))
        draft = ""
        draftPlace = nil
    }
}

struct SectionHead: View {
    let title: String
    let count: Int
    var body: some View {
        HStack(alignment: .firstTextBaseline) {
            Text(title.uppercased()).font(.display(44))
            Text(String(format: "%02d", count)).font(.numerals(14)).foregroundStyle(Color.signalRed)
            Spacer()
        }
    }
}

/// A fanned stack of face-down cards.
struct SealedStack: View {
    let count: Int
    var body: some View {
        ZStack {
            ForEach(0..<min(count, 4), id: \.self) { i in
                Rectangle()
                    .fill(Color.paperRaised)
                    .overlay(Rectangle().strokeBorder(Color.paperLine))
                    .frame(width: 22, height: 30)
                    .rotationEffect(.degrees(Double(i) * 7 - 7))
                    .offset(x: CGFloat(i) * 5)
            }
            if count == 0 { Text("—").foregroundStyle(Color.stone) }
        }
        .frame(width: 52, height: 34)
        .overlay(alignment: .trailing) {
            if count > 0 { Text("\(count)").font(.numerals(12)).foregroundStyle(Color.signalRed).offset(x: 14) }
        }
        .accessibilityLabel("\(count) sealed quests")
    }
}

struct GameSettingsView: View {
    @EnvironmentObject var session: GameSession
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        let s = session.state?.settings ?? GameSettings()
        let update: (GameSettings) -> Void = { session.send(.updateSettings($0)) }

        Screen(index: "⚙", title: "Game settings") {
            VStack(alignment: .leading, spacing: Space.l) {
                VStack(alignment: .leading, spacing: Space.s) {
                    Text("TIME").font(.label(11)).tracking(1.5).foregroundStyle(Color.stone)
                    HStack(spacing: 0) {
                        ForEach(GameSettings.durationOptions, id: \.self) { m in
                            Button { var n = s; n.durationMinutes = m; update(n) } label: {
                                Text("\(m)").font(.display(30))
                                    .frame(maxWidth: .infinity, minHeight: 56)
                                    .foregroundStyle(s.durationMinutes == m ? Color.paperBright : Color.inkBlack)
                                    .background(s.durationMinutes == m ? Color.signalRed : Color.clear)
                                    .overlay(Rectangle().strokeBorder(Color.paperLine))
                            }
                        }
                    }
                    Text("MINUTES").font(.label(10)).tracking(1.5).foregroundStyle(Color.stone)
                }
                Hairline()
                Toggle(isOn: Binding(get: { s.allowSkips }, set: { var n = s; n.allowSkips = $0; update(n) })) {
                    Text("Skips allowed").font(.display(28))
                }
                if s.allowSkips {
                    Stepper(value: Binding(get: { s.maxSkips }, set: { var n = s; n.maxSkips = $0; update(n) }), in: 1...10) {
                        HStack { Text("Skips per player").font(.system(size: 17)); Spacer(); Text("\(s.maxSkips)").font(.numerals(17)) }
                    }
                }
                Hairline()
                Toggle(isOn: Binding(get: { s.aiRefill }, set: { var n = s; n.aiRefill = $0; update(n) })) {
                    VStack(alignment: .leading, spacing: 2) {
                        Text("AI refills").font(.display(28))
                        Text("Write new quests when the deck runs dry").font(.system(size: 13)).foregroundStyle(Color.stone)
                    }
                }
            }
            .padding(.horizontal, Space.gutter)
        } footer: {
            Button("Done") { dismiss() }.buttonStyle(.slab)
        }
        .presentationBackground(Color.paper)
    }
}

/// Host curates the final deck before dealing.
struct ReviewView: View {
    @EnvironmentObject var session: GameSession
    @State private var adding = ""

    var body: some View {
        let state = session.state!
        let included = state.quests.filter(\.included).count

        Screen(index: "03", title: "Review deck", trailing: "\(included) in play") {
            if session.isHost {
                List {
                    ForEach(state.quests) { q in
                        Button { session.send(.toggleQuest(q.id)) } label: {
                            HStack(alignment: .top, spacing: Space.m) {
                                Image(systemName: q.included ? "checkmark.square.fill" : "square")
                                    .font(.system(size: 22))
                                    .foregroundStyle(q.included ? Color.signalRed : Color.stone)
                                VStack(alignment: .leading, spacing: 6) {
                                    Text(q.text)
                                        .font(.system(size: 17, weight: .medium))
                                        .foregroundStyle(q.included ? Color.inkBlack : Color.stone)
                                        .strikethrough(!q.included, color: .stone)
                                    if let place = q.place { PlaceChip(place: place) }
                                    HStack(spacing: 6) {
                                        if q.source == .ai { Tag(text: "AI", filled: true) }
                                        else { Tag(text: state.player(q.authorID ?? UUID())?.name ?? "—") }
                                    }
                                }
                            }
                            .padding(.vertical, 6)
                        }
                        .listRowBackground(Color.paper)
                        .listRowSeparatorTint(Color.paperLine)
                    }
                    if state.aiWriting {
                        HStack(spacing: Space.s) {
                            ProgressView().tint(.signalRed)
                            Text("CLAUDE IS WRITING IN YOUR VIBE…").font(.label(11)).tracking(1.5).foregroundStyle(Color.stone)
                        }
                        .listRowBackground(Color.paper)
                    }
                    HStack {
                        TextField("", text: $adding, prompt: Text("+ Add another").foregroundStyle(Color.stone))
                            .font(.system(size: 17, weight: .medium))
                            .onSubmit {
                                session.send(.addQuest(Quest(text: adding, authorID: session.me.id, source: .human)))
                                adding = ""
                            }
                        Button("More AI") { session.requestAIQuests(count: 3) }
                            .font(.label(11)).tracking(1.5)
                            .disabled(state.aiWriting)
                    }
                    .listRowBackground(Color.paper)
                }
                .listStyle(.plain)
                .scrollContentBackground(.hidden)
            } else {
                VStack(alignment: .leading, spacing: Space.m) {
                    Text("\(state.quests.count)")
                        .font(.display(160)).foregroundStyle(Color.signalRed)
                    Text("quests in the deck. The host is giving it a once-over.")
                        .font(.display(34))
                }
                .padding(.horizontal, Space.gutter)
            }
        } footer: {
            if session.isHost {
                Button("Deal · \(state.settings.durationMinutes):00") { session.send(.startGame) }
                    .buttonStyle(.slab)
                    .disabled(included == 0)
            } else {
                WaitingBar(text: "Get ready")
            }
        }
    }
}
