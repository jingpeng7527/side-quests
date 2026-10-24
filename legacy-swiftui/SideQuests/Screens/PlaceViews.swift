import SwiftUI
import MapKit

extension Coordinate {
    init(_ c: CLLocationCoordinate2D) { self.init(latitude: c.latitude, longitude: c.longitude) }
    var cl: CLLocationCoordinate2D { CLLocationCoordinate2D(latitude: latitude, longitude: longitude) }
}

extension MKMapItem {
    static func at(_ c: Coordinate) -> MKMapItem {
        if #available(iOS 26.0, *) {
            return MKMapItem(location: CLLocation(latitude: c.latitude, longitude: c.longitude), address: nil)
        }
        return MKMapItem(placemark: MKPlacemark(coordinate: c.cl))
    }
    var coordinate: Coordinate {
        if #available(iOS 26.0, *) { return Coordinate(location.coordinate) }
        return Coordinate(placemark.coordinate)
    }
}

enum Distance {
    /// "650 M", "1.2 KM"
    static func label(_ meters: Double) -> String {
        meters < 1000 ? "\(Int((meters / 10).rounded() * 10)) M" : String(format: "%.1f KM", meters / 1000)
    }
}

/// "⌖ Dolores Park · 100 M" — shown wherever a quest has a place.
struct PlaceChip: View {
    let place: QuestPlace
    var onRemove: (() -> Void)? = nil
    @Environment(\.palette) private var pal

    var body: some View {
        HStack(spacing: 6) {
            Image(systemName: "mappin").font(.system(size: 11, weight: .heavy))
            Text(place.name.uppercased()).lineLimit(1)
            Text("· \(Int(place.radius)) M").foregroundStyle(pal.muted)
            if let onRemove {
                Button(action: onRemove) { Image(systemName: "xmark").font(.system(size: 10, weight: .heavy)) }
                    .accessibilityLabel("Remove place")
            }
        }
        .font(.label(11))
        .tracking(1)
        .foregroundStyle(pal.accent)
        .padding(.horizontal, 8).padding(.vertical, 5)
        .overlay(Rectangle().strokeBorder(pal.accent, lineWidth: 1.5))
    }
}

/// Pin a quest to a spot: search, tap the map, or use where you're standing.
struct PlacePickerView: View {
    let start: Coordinate?
    let onDone: (QuestPlace?) -> Void

    @State private var position: MapCameraPosition
    @State private var pin: Coordinate?
    @State private var name = ""
    @State private var radius: Double = 100
    @State private var query = ""
    @State private var results: [MKMapItem] = []
    @State private var visibleRegion: MKCoordinateRegion?

    init(start: Coordinate?, onDone: @escaping (QuestPlace?) -> Void) {
        self.start = start
        self.onDone = onDone
        let center = start?.cl ?? CLLocationCoordinate2D(latitude: 37.7749, longitude: -122.4194)
        _position = State(initialValue: .region(MKCoordinateRegion(center: center, latitudinalMeters: 1600, longitudinalMeters: 1600)))
    }

    var body: some View {
        Screen(index: "⌖", title: "Set a place") {
            VStack(alignment: .leading, spacing: Space.m) {
                HStack(spacing: Space.s) {
                    Image(systemName: "magnifyingglass").foregroundStyle(Color.stone)
                    TextField("", text: $query, prompt: Text("Search a spot nearby").foregroundStyle(Color.stone))
                        .font(.system(size: 17, weight: .medium))
                        .submitLabel(.search)
                        .onSubmit(search)
                        .autocorrectionDisabled()
                }
                .padding(Space.m)
                .background(Color.paperRaised)
                .padding(.horizontal, Space.gutter)

                ZStack(alignment: .top) {
                    MapReader { proxy in
                        Map(position: $position) {
                            UserAnnotation()
                            if let pin {
                                MapCircle(center: pin.cl, radius: radius)
                                    .foregroundStyle(Color.signalRed.opacity(0.15))
                                    .stroke(Color.signalRed, lineWidth: 2)
                                Annotation("", coordinate: pin.cl, anchor: .bottom) { PlaceFlag() }
                            }
                        }
                        .mapStyle(.standard(elevation: .flat, pointsOfInterest: .including([.cafe, .park, .restaurant, .museum, .store])))
                        .onMapCameraChange { visibleRegion = $0.region }
                        .onTapGesture { point in
                            if let c = proxy.convert(point, from: .local) {
                                drop(Coordinate(c), name: name.isEmpty || results.isEmpty ? "Dropped pin" : name)
                            }
                        }
                    }

                    if !results.isEmpty {
                        VStack(spacing: 0) {
                            ForEach(results.prefix(5), id: \.self) { item in
                                Button {
                                    drop(item.coordinate, name: item.name ?? "Pinned spot")
                                    position = .region(MKCoordinateRegion(center: item.coordinate.cl, latitudinalMeters: 700, longitudinalMeters: 700))
                                    results = []
                                } label: {
                                    HStack {
                                        Text(item.name ?? "Unnamed").font(.system(size: 15, weight: .semibold))
                                        Spacer()
                                        if let start {
                                            Text(Distance.label(start.distance(to: item.coordinate)))
                                                .font(.label(11)).foregroundStyle(Color.stone)
                                        }
                                    }
                                    .padding(.horizontal, Space.m).padding(.vertical, 12)
                                }
                                .foregroundStyle(Color.inkBlack)
                                Hairline()
                            }
                        }
                        .background(Color.paper)
                        .padding(Space.s)
                    }
                }
                .overlay(Rectangle().strokeBorder(Color.inkBlack, lineWidth: 2))
                .padding(.horizontal, Space.gutter)

                VStack(alignment: .leading, spacing: Space.s) {
                    HStack {
                        FieldLabel("Counts as there within")
                        Spacer()
                        Button("USE MY SPOT") { if let start { drop(start, name: "Right here") } }
                            .font(.label(11)).tracking(1.2)
                            .disabled(start == nil)
                    }
                    HStack(spacing: 0) {
                        ForEach(QuestPlace.radiusOptions, id: \.self) { r in
                            Button { radius = r } label: {
                                Text("\(Int(r)) M").font(.display(22))
                                    .frame(maxWidth: .infinity, minHeight: 44)
                                    .foregroundStyle(radius == r ? Color.paperBright : Color.inkBlack)
                                    .background(radius == r ? Color.signalRed : .clear)
                                    .overlay(Rectangle().strokeBorder(Color.paperLine))
                            }
                        }
                    }
                    if pin != nil {
                        TextField("", text: $name, prompt: Text("Name this spot").foregroundStyle(Color.stone))
                            .font(.display(28))
                        Hairline(emphasized: true)
                    }
                }
                .padding(.horizontal, Space.gutter)
            }
        } footer: {
            Button(pin == nil ? "Tap the map to drop a pin" : "Pin it here") {
                guard let pin else { return }
                onDone(QuestPlace(name: name.trimmingCharacters(in: .whitespaces).isEmpty ? "Pinned spot" : name, coordinate: pin, radius: radius))
            }
            .buttonStyle(.slab)
            .disabled(pin == nil)
            Button("Cancel") { onDone(nil) }.buttonStyle(.slabQuiet)
        }
        .presentationBackground(Color.paper)
    }

    private func drop(_ c: Coordinate, name newName: String) {
        withAnimation(.snappy) { pin = c }
        name = newName
    }

    private func search() {
        let request = MKLocalSearch.Request()
        request.naturalLanguageQuery = query
        if let region = visibleRegion { request.region = region }
        Task {
            let response = try? await MKLocalSearch(request: request).start()
            results = response?.mapItems ?? []
        }
    }
}

/// The red flag marker used for quest places.
struct PlaceFlag: View {
    var body: some View {
        VStack(spacing: 0) {
            Image(systemName: "flag.fill")
                .font(.system(size: 14, weight: .heavy))
                .foregroundStyle(Color.paperBright)
                .frame(width: 30, height: 30)
                .background(Color.signalRed)
            Rectangle().fill(Color.signalRed).frame(width: 3, height: 10)
        }
    }
}

/// In-game: where the quest is, the walk there, and whether you've arrived.
struct QuestMapCard: View {
    let place: QuestPlace
    @ObservedObject var location: LocationProvider

    @State private var route: MKRoute?
    @State private var routePath: [CLLocationCoordinate2D]?
    @State private var position: MapCameraPosition = .automatic

    private var distance: Double? { location.current.map { $0.distance(to: place.coordinate) } }
    private var arrived: Bool { (distance ?? .infinity) <= place.radius }

    var body: some View {
        VStack(spacing: 0) {
            HStack(spacing: Space.s) {
                Image(systemName: "mappin").font(.system(size: 13, weight: .heavy))
                Text(place.name.uppercased()).font(.label(12)).tracking(1.2).lineLimit(1)
                Spacer()
                if arrived {
                    Text("YOU'RE HERE").font(.label(12)).tracking(1.2)
                } else if let d = distance {
                    let walk = route.map { " · \(Int(($0.expectedTravelTime / 60).rounded(.up))) MIN" } ?? ""
                    Text(Distance.label(route?.distance ?? d) + walk).font(.label(12)).tracking(1.2)
                }
            }
            .foregroundStyle(arrived ? Color.paperBright : Color.inkBlack)
            .padding(.horizontal, 12).padding(.vertical, 10)
            .background(arrived ? Color.inkBlack : Color.paperBright)

            Map(position: $position) {
                UserAnnotation()
                MapCircle(center: place.coordinate.cl, radius: place.radius)
                    .foregroundStyle(Color.signalRed.opacity(0.14))
                    .stroke(Color.signalRed, lineWidth: 2)
                // One line that upgrades from "as the crow flies" (dashed) to the walking route.
                if !arrived, let path = routePath ?? location.current.map({ [$0.cl, place.coordinate.cl] }) {
                    MapPolyline(coordinates: path)
                        .stroke(Color.signalRed, style: routePath == nil
                                ? StrokeStyle(lineWidth: 3, dash: [6, 6])
                                : StrokeStyle(lineWidth: 5, lineCap: .round, lineJoin: .round))
                }
                Annotation("", coordinate: place.coordinate.cl, anchor: .bottom) { PlaceFlag() }
            }
            .mapStyle(.standard(elevation: .flat, pointsOfInterest: .excludingAll))
            .mapControls { }
            .environment(\.colorScheme, .light)
            .overlay(alignment: .bottomTrailing) {
                Button(action: openInMaps) {
                    Label("Directions", systemImage: "arrow.triangle.turn.up.right.diamond.fill")
                        .font(.label(11)).tracking(1)
                        .padding(.horizontal, 10).padding(.vertical, 8)
                        .foregroundStyle(Color.paperBright)
                        .background(Color.signalRed)
                }
                .padding(Space.s)
            }
        }
        .overlay(Rectangle().strokeBorder(Color.paperBright, lineWidth: 3))
        .task(id: RouteKey(place: place, hasFix: location.current != nil)) { await loadRoute() }
    }

    private struct RouteKey: Equatable { let place: QuestPlace; let hasFix: Bool }

    private func loadRoute() async {
        route = nil
        routePath = nil
        position = .automatic
        guard let here = location.current else { return }
        let request = MKDirections.Request()
        request.source = .at(here)
        request.destination = .at(place.coordinate)
        request.transportType = .walking
        if let r = try? await MKDirections(request: request).calculate().routes.first {
            var coords = [CLLocationCoordinate2D](repeating: kCLLocationCoordinate2DInvalid, count: r.polyline.pointCount)
            r.polyline.getCoordinates(&coords, range: NSRange(location: 0, length: coords.count))
            route = r
            routePath = coords
            position = .automatic
        }
    }

    private func openInMaps() {
        let item = MKMapItem.at(place.coordinate)
        item.name = place.name
        item.openInMaps(launchOptions: [MKLaunchOptionsDirectionsModeKey: MKLaunchOptionsDirectionsModeWalking])
    }
}
