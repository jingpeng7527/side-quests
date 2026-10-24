import SwiftUI

@main
struct SideQuestsApp: App {
    @StateObject private var session = GameSession()

    var body: some Scene {
        WindowGroup {
            RootView()
                .environmentObject(session)
                .preferredColorScheme(.light)
                .tint(.signalRed)
                #if DEBUG
                .task {
                    session.seedDemoIfRequested()
                    session.startDummyRunIfRequested()
                }
                #endif
        }
    }
}

struct RootView: View {
    @EnvironmentObject var session: GameSession

    var body: some View {
        ZStack {
            Color.paper.ignoresSafeArea()
            Group {
                if let state = session.state {
                    switch state.phase {
                    case .lobby: LobbyRoomView()
                    case .writing: QuestsView()
                    case .review: ReviewView()
                    case .playing: InGameView()
                    case .ended: EndGameView()
                    case .verifying: VerificationView()
                    case .scoreboard: ScoreboardView()
                    }
                } else {
                    HomeView()
                }
            }
            .transition(.asymmetric(insertion: .move(edge: .trailing).combined(with: .opacity),
                                    removal: .move(edge: .leading).combined(with: .opacity)))
        }
        .animation(.snappy(duration: 0.35), value: session.state?.phase)
        .animation(.snappy(duration: 0.35), value: session.state == nil)
    }
}
