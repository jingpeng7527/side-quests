import SwiftUI

struct HomeView: View {
    @EnvironmentObject var session: GameSession
    @State private var name = ""
    @State private var showJoin = false
    @State private var showSettings = false
    @FocusState private var nameFocused: Bool

    private var trimmed: String { name.trimmingCharacters(in: .whitespaces) }

    var body: some View {
        Screen(index: "00", title: "Side Quests", tone: .signal, art: .home) {
            VStack(alignment: .leading, spacing: 0) {
                Spacer(minLength: Space.l)
                // Wordmark: white over the red field, the second word in ink.
                VStack(alignment: .leading, spacing: -34) {
                    Text("SIDE").foregroundStyle(Color.paperBright)
                    Text("QUESTS").foregroundStyle(Color.inkBlack)
                }
                .font(.display(140))
                .minimumScaleFactor(0.5)
                .lineLimit(1)

                Text("Write dares for your friends. Get dealt theirs. Prove it with a photo before the clock runs out.")
                    .font(.system(size: 17, weight: .medium))
                    .lineSpacing(3)
                    .frame(maxWidth: 300, alignment: .leading)
                    .padding(.top, Space.m)

                Spacer()

                VStack(alignment: .leading, spacing: Space.s) {
                    FieldLabel("Your name")
                    TextField("", text: $name, prompt: Text("Who's playing?").foregroundStyle(Color.paperBright.opacity(0.55)))
                        .font(.display(44))
                        .textInputAutocapitalization(.words)
                        .autocorrectionDisabled()
                        .focused($nameFocused)
                        .submitLabel(.done)
                    Hairline(emphasized: nameFocused)
                }
            }
            .padding(.horizontal, Space.gutter)
        } footer: {
            Button("Create lobby") {
                session.setName(trimmed)
                session.createLobby()
            }
            .buttonStyle(.slab)
            .disabled(trimmed.isEmpty)

            Button("Join nearby") {
                session.setName(trimmed)
                showJoin = true
            }
            .buttonStyle(.slabOutline)
            .disabled(trimmed.isEmpty)

            Button { showSettings = true } label: {
                Text("AI SETTINGS").font(.label(12)).tracking(1.5)
            }
            .padding(.top, Space.xs)
        }
        .onAppear { name = session.me.name }
        .sheet(isPresented: $showJoin) { JoinNearbyView() }
        .sheet(isPresented: $showSettings) { AISettingsView() }
    }
}

struct AISettingsView: View {
    @Environment(\.dismiss) private var dismiss
    @AppStorage(QuestGenerator.apiKeyDefaultsKey) private var apiKey = ""

    var body: some View {
        Screen(index: "AI", title: "Quest writer") {
            VStack(alignment: .leading, spacing: Space.m) {
                Text("When the deck runs dry, Claude writes new quests in your group's vibe.")
                    .font(.display(34))
                Text("Paste an Anthropic API key to turn it on. Without one, a built-in quest deck fills the gap.")
                    .font(.system(size: 15))
                    .foregroundStyle(Palette.paper.muted)
                SecureField("", text: $apiKey, prompt: Text("sk-ant-…").foregroundStyle(Palette.paper.muted))
                    .font(.label(15))
                    .padding(Space.m)
                    .background(Palette.paper.raised)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                HStack(spacing: Space.s) {
                    Rectangle().fill(QuestGenerator.apiKey == nil ? Palette.paper.muted : Color.signalRed).frame(width: 8, height: 8)
                    FieldLabel(QuestGenerator.apiKey == nil ? "Offline deck" : "Claude connected")
                }
            }
            .padding(.horizontal, Space.gutter)
        } footer: {
            Button("Done") { dismiss() }.buttonStyle(.slab)
        }
        .presentationBackground(Color.paper)
    }
}
