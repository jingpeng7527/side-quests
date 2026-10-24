import Foundation
import MultipeerConnectivity
import UIKit

enum WireMessage: Codable {
    case state(GameState)
    case action(GameAction)
}

struct NearbyLobby: Identifiable, Hashable {
    let peer: MCPeerID
    let code: String
    let hostName: String
    var id: MCPeerID { peer }
}

/// Peer-to-peer link between phones in the same room. The host advertises
/// its lobby; joiners browse and connect. Messages are JSON-encoded `WireMessage`s.
@MainActor
final class PeerTransport: NSObject, ObservableObject {
    static let serviceType = "sidequests"

    @Published private(set) var nearbyLobbies: [NearbyLobby] = []
    @Published private(set) var connectedPeers: [MCPeerID] = []

    var onMessage: ((WireMessage) -> Void)?
    var onPeerDropped: ((MCPeerID) -> Void)?

    private let peerID: MCPeerID
    nonisolated(unsafe) private let session: MCSession
    private var advertiser: MCNearbyServiceAdvertiser?
    private var browser: MCNearbyServiceBrowser?

    init(displayName: String) {
        peerID = MCPeerID(displayName: String(displayName.prefix(60)).isEmpty ? UIDevice.current.name : String(displayName.prefix(60)))
        session = MCSession(peer: peerID, securityIdentity: nil, encryptionPreference: .required)
        super.init()
        session.delegate = self
    }

    func host(code: String, hostName: String) {
        stop()
        let adv = MCNearbyServiceAdvertiser(peer: peerID, discoveryInfo: ["code": code, "host": hostName], serviceType: Self.serviceType)
        adv.delegate = self
        adv.startAdvertisingPeer()
        advertiser = adv
    }

    func browse() {
        stop()
        nearbyLobbies = []
        let b = MCNearbyServiceBrowser(peer: peerID, serviceType: Self.serviceType)
        b.delegate = self
        b.startBrowsingForPeers()
        browser = b
    }

    func join(_ lobby: NearbyLobby) {
        browser?.invitePeer(lobby.peer, to: session, withContext: nil, timeout: 15)
    }

    func stop() {
        advertiser?.stopAdvertisingPeer(); advertiser = nil
        browser?.stopBrowsingForPeers(); browser = nil
    }

    func disconnect() {
        stop()
        session.disconnect()
        connectedPeers = []
    }

    func send(_ message: WireMessage) {
        guard !session.connectedPeers.isEmpty,
              let data = try? JSONEncoder().encode(message) else { return }
        try? session.send(data, toPeers: session.connectedPeers, with: .reliable)
    }
}

extension PeerTransport: MCSessionDelegate {
    nonisolated func session(_ session: MCSession, peer peerID: MCPeerID, didChange state: MCSessionState) {
        let peers = session.connectedPeers
        Task { @MainActor in
            self.connectedPeers = peers
            if state == .notConnected { self.onPeerDropped?(peerID) }
        }
    }

    nonisolated func session(_ session: MCSession, didReceive data: Data, fromPeer peerID: MCPeerID) {
        guard let message = try? JSONDecoder().decode(WireMessage.self, from: data) else { return }
        Task { @MainActor in self.onMessage?(message) }
    }

    nonisolated func session(_ session: MCSession, didReceive stream: InputStream, withName streamName: String, fromPeer peerID: MCPeerID) {}
    nonisolated func session(_ session: MCSession, didStartReceivingResourceWithName resourceName: String, fromPeer peerID: MCPeerID, with progress: Progress) {}
    nonisolated func session(_ session: MCSession, didFinishReceivingResourceWithName resourceName: String, fromPeer peerID: MCPeerID, at localURL: URL?, withError error: Error?) {}
}

extension PeerTransport: MCNearbyServiceAdvertiserDelegate {
    nonisolated func advertiser(_ advertiser: MCNearbyServiceAdvertiser, didReceiveInvitationFromPeer peerID: MCPeerID, withContext context: Data?, invitationHandler: @escaping (Bool, MCSession?) -> Void) {
        // Anyone close enough to discover the lobby can join it.
        invitationHandler(true, self.session)
    }
}

extension PeerTransport: MCNearbyServiceBrowserDelegate {
    nonisolated func browser(_ browser: MCNearbyServiceBrowser, foundPeer peerID: MCPeerID, withDiscoveryInfo info: [String: String]?) {
        guard let code = info?["code"] else { return }
        let lobby = NearbyLobby(peer: peerID, code: code, hostName: info?["host"] ?? peerID.displayName)
        Task { @MainActor in
            if !self.nearbyLobbies.contains(where: { $0.peer == peerID }) { self.nearbyLobbies.append(lobby) }
        }
    }

    nonisolated func browser(_ browser: MCNearbyServiceBrowser, lostPeer peerID: MCPeerID) {
        Task { @MainActor in self.nearbyLobbies.removeAll { $0.peer == peerID } }
    }
}
