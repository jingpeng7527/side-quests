import SwiftUI
import PhotosUI

struct InGameView: View {
    @EnvironmentObject var session: GameSession
    @State private var capturing = false
    @State private var stamp = false

    var body: some View {
        let state = session.state!
        let done = state.submissions.filter { $0.playerID == session.me.id }.count

        Screen(index: "04", title: "In game", trailing: "\(done) done", tone: .signal, art: .inGame) {
            VStack(alignment: .leading, spacing: 0) {
                let place = session.myQuest?.place
                TimelineView(.periodic(from: .now, by: 1)) { ctx in
                    CountdownView(remaining: max(0, (state.endsAt ?? ctx.date).timeIntervalSince(ctx.date)),
                                  total: TimeInterval(state.settings.durationMinutes * 60),
                                  compact: place != nil)
                }
                .padding(.horizontal, Space.gutter)

                Spacer(minLength: place == nil ? Space.l : Space.m)

                // The signature moment: the quest, set as big as it'll go.
                ZStack(alignment: .topLeading) {
                    if let quest = session.myQuest {
                        VStack(alignment: .leading, spacing: Space.m) {
                            HStack(spacing: Space.s) {
                                Tag(text: "Your quest", filled: true)
                                if quest.source == .ai { Tag(text: "AI-written") }
                            }
                            Text(quest.text.uppercased())
                                .font(.display(quest.place == nil ? 72 : 52))
                                .minimumScaleFactor(0.4)
                            if let place = quest.place {
                                QuestMapCard(place: place, location: session.location)
                                    .frame(maxHeight: 300)
                                    .layoutPriority(-1)
                            }
                        }
                        .id(quest.id)
                        .transition(.asymmetric(
                            insertion: .move(edge: .bottom).combined(with: .opacity),
                            removal: .move(edge: .top).combined(with: .opacity)))
                    } else {
                        VStack(alignment: .leading, spacing: Space.m) {
                            ProgressView().tint(.paperBright)
                            Text("DECK'S DRY.").font(.display(72))
                            Text(state.aiWriting ? "Claude is writing fresh quests in your group's vibe…" : "Waiting on new quests…")
                                .font(.system(size: 17, weight: .medium))
                        }
                    }
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
                .padding(.horizontal, Space.gutter)
                .animation(.spring(response: 0.5, dampingFraction: 0.85), value: session.myQuest?.id)
                .overlay {
                    if stamp { CompleteStamp().transition(.scale(scale: 1.6).combined(with: .opacity)) }
                }
            }
        } footer: {
            HStack(spacing: Space.s) {
                Button("Skip · \(session.mySkipsLeft)") { session.send(.skip(session.me.id)) }
                    .buttonStyle(.slabOutline)
                    .frame(width: 128)
                    .disabled(session.mySkipsLeft == 0 || session.myQuest == nil)
                Button { capturing = true } label: {
                    Label("Snap proof", systemImage: "camera.fill").labelStyle(.titleAndIcon)
                }
                .buttonStyle(.slab)
                .disabled(session.myQuest == nil)
            }
        }
        .sensoryFeedback(.success, trigger: done)
        .fullScreenCover(isPresented: $capturing) {
            ProofCaptureView(questText: session.myQuest?.text ?? "", playerName: session.me.name) { image in
                capturing = false
                guard let image else { return }
                session.submitProof(image)
                withAnimation(.spring(response: 0.3, dampingFraction: 0.6)) { stamp = true }
                Task {
                    try? await Task.sleep(for: .seconds(1.2))
                    withAnimation(.easeOut(duration: 0.3)) { stamp = false }
                }
            }
        }
    }
}

struct CountdownView: View {
    let remaining: TimeInterval
    let total: TimeInterval
    var compact = false

    var body: some View {
        let urgent = remaining < 60
        VStack(alignment: .leading, spacing: Space.s) {
            Text(String(format: "%d:%02d", Int(remaining) / 60, Int(remaining) % 60))
                .font(.display(compact ? 88 : 132).monospacedDigit())
                .foregroundStyle(urgent ? Color.inkBlack : Color.paperBright)
                .contentTransition(.numericText(countsDown: true))
                .animation(.snappy, value: Int(remaining))
            GeometryReader { geo in
                ZStack(alignment: .leading) {
                    Rectangle().fill(Color.deepRed)
                    Rectangle().fill(urgent ? Color.inkBlack : Color.paperBright)
                        .frame(width: geo.size.width * (total > 0 ? remaining / total : 0))
                }
            }
            .frame(height: 4)
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(Int(remaining) / 60) minutes \(Int(remaining) % 60) seconds left")
    }
}

/// Ink stamp slammed onto the red field.
struct CompleteStamp: View {
    var body: some View {
        VStack(spacing: -18) {
            Text("QUEST")
            Text("COMPLETE")
        }
        .font(.display(76))
        .foregroundStyle(Color.paperBright)
        .padding(.horizontal, Space.l).padding(.vertical, Space.m)
        .background(Color.inkBlack)
        .rotationEffect(.degrees(-7))
    }
}

/// Real camera on device. The simulator has no camera, so it offers a
/// generated stand-in photo or the photo library instead.
struct ProofCaptureView: View {
    let questText: String
    let playerName: String
    let onDone: (UIImage?) -> Void
    @State private var pick: PhotosPickerItem?
    @State private var preview: UIImage?

    var body: some View {
        if UIImagePickerController.isSourceTypeAvailable(.camera) {
            CameraPicker(onDone: onDone).ignoresSafeArea()
        } else {
            Screen(index: "◉", title: "Proof", trailing: "No camera") {
                VStack(spacing: Space.m) {
                    if let preview {
                        Image(uiImage: preview).resizable().scaledToFit()
                    }
                    Text("No camera on this device — use a stand-in shot or pick from your library.")
                        .font(.system(size: 15)).foregroundStyle(Color.stone)
                }
                .padding(.horizontal, Space.gutter)
            } footer: {
                Button("Use this shot") { onDone(preview) }.buttonStyle(.slab)
                PhotosPicker(selection: $pick, matching: .images) {
                    Text("Choose from library").frame(maxWidth: .infinity)
                }
                .buttonStyle(.slabOutline)
                Button("Cancel") { onDone(nil) }.buttonStyle(.slabQuiet)
            }
            .onAppear { preview = ProofArt.render(quest: questText, by: playerName) }
            .onChange(of: pick) { _, item in
                Task {
                    if let data = try? await item?.loadTransferable(type: Data.self), let img = UIImage(data: data) {
                        preview = img
                    }
                }
            }
        }
    }
}

struct CameraPicker: UIViewControllerRepresentable {
    let onDone: (UIImage?) -> Void

    func makeUIViewController(context: Context) -> UIImagePickerController {
        let picker = UIImagePickerController()
        picker.sourceType = .camera
        picker.delegate = context.coordinator
        return picker
    }
    func updateUIViewController(_ uiViewController: UIImagePickerController, context: Context) {}
    func makeCoordinator() -> Coordinator { Coordinator(onDone: onDone) }

    final class Coordinator: NSObject, UIImagePickerControllerDelegate, UINavigationControllerDelegate {
        let onDone: (UIImage?) -> Void
        init(onDone: @escaping (UIImage?) -> Void) { self.onDone = onDone }
        func imagePickerController(_ picker: UIImagePickerController, didFinishPickingMediaWithInfo info: [UIImagePickerController.InfoKey: Any]) {
            onDone(info[.originalImage] as? UIImage)
        }
        func imagePickerControllerDidCancel(_ picker: UIImagePickerController) { onDone(nil) }
    }
}
