import type { Coordinate, QuestPlace } from "@side-quests/game";
import { useCallback, useEffect, useRef, useState } from "react";
import { Platform, Text, View, type ViewStyle } from "react-native";
import MapView, { Circle, Marker, Polyline, type LatLng, type MapViewProps, type Region } from "react-native-maps";
import { color, font } from "./theme";

const ll = (c: Coordinate): LatLng => ({ latitude: c.latitude, longitude: c.longitude });

/** Shared map chrome: no POI clutter (Android needs a style for that), no stock buttons. */
const quiet: MapViewProps = {
  showsPointsOfInterests: false,
  showsMyLocationButton: false,
  toolbarEnabled: false,
  customMapStyle: [{ featureType: "poi", stylers: [{ visibility: "off" }] }],
};

/** The red flag used for quest places. */
export function PlaceFlag() {
  return (
    <View style={{ alignItems: "center" }}>
      <View style={{ width: 30, height: 30, borderRadius: 10, backgroundColor: color.signalRed, alignItems: "center", justifyContent: "center" }}>
        <Text style={{ color: color.paperBright, fontFamily: font.monoBold, fontSize: 14 }}>⚑</Text>
      </View>
      <View style={{ width: 3, height: 10, borderRadius: 1.5, backgroundColor: color.signalRed }} />
    </View>
  );
}

/** A numbered square pin for the route map. */
function StepPin({ n, last }: { n: number; last: boolean }) {
  return (
    <View
      style={{
        width: 26,
        height: 26,
        borderRadius: 13,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: last ? color.signalRed : color.paperBright,
        borderWidth: 2,
        borderColor: color.signalRed,
      }}
    >
      <Text style={{ fontFamily: font.monoBold, fontSize: 11, color: last ? color.paperBright : color.signalRed }}>{n}</Text>
    </View>
  );
}

/** A region that shows every point with some margin — never zoomed in past street level. */
function regionFor(points: Coordinate[]): Region {
  const lats = points.map((p) => p.latitude);
  const lngs = points.map((p) => p.longitude);
  const [minLat, maxLat, minLng, maxLng] = [Math.min(...lats), Math.max(...lats), Math.min(...lngs), Math.max(...lngs)];
  return {
    latitude: (minLat + maxLat) / 2,
    longitude: (minLng + maxLng) / 2,
    latitudeDelta: Math.max(0.006, (maxLat - minLat) * 1.6),
    longitudeDelta: Math.max(0.006, (maxLng - minLng) * 1.6),
  };
}

/**
 * Frames every point. The map starts on `regionFor(points)` so it's right even
 * if nothing else runs; once the map says it's ready (and whenever the points
 * change after that) it fits them properly. Fitting on a timer instead raced
 * Apple Maps' first load on iPhones: called too early, the fit was dropped and
 * the end-of-game map sat on a default region with none of the route on it.
 */
function useFit(map: React.RefObject<MapView | null>, points: Coordinate[], key: string) {
  const ready = useRef(false);
  const fit = useCallback(() => {
    if (!ready.current || !points.length) return;
    if (points.length === 1) map.current?.animateToRegion(regionFor(points), 0);
    else map.current?.fitToCoordinates(points.map(ll), { edgePadding: { top: 50, right: 50, bottom: 50, left: 50 }, animated: false });
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(fit, [fit]);
  const onMapReady = useCallback(() => {
    ready.current = true;
    fit();
  }, [fit]);
  return onMapReady;
}

/**
 * Custom marker views are snapshotted into an image on iOS. Snapshotting with
 * tracksViewChanges off from the start can catch the view before it has laid
 * out, leaving an invisible pin; track for a moment, then stop (it's costly).
 */
function useTracksViewChanges(key: string) {
  // Tracking stops once this key has had its moment; a new key tracks again.
  const [settled, setSettled] = useState<string | null>(null);
  useEffect(() => {
    if (Platform.OS === "android") return;
    const t = setTimeout(() => setSettled(key), 800);
    return () => clearTimeout(t);
  }, [key]);
  return Platform.OS === "android" || settled !== key;
}

/** In game: the quest's spot, its radius, you, and the walk between. */
export function QuestMap({ place, me, route, arrived, style }: { place: QuestPlace; me: Coordinate | null; route: Coordinate[] | null; arrived: boolean; style?: ViewStyle }) {
  const map = useRef<MapView>(null);
  const line = arrived ? null : route ?? (me ? [me, place.coordinate] : null);
  const onMapReady = useFit(map, [place.coordinate, ...(me ? [me] : [])], `${place.name}-${!!me}-${!!route}`);
  const tracks = useTracksViewChanges(place.name);
  return (
    <MapView
      ref={map}
      style={style}
      {...quiet}
      onMapReady={onMapReady}
      showsUserLocation
      initialRegion={{ ...ll(place.coordinate), latitudeDelta: 0.012, longitudeDelta: 0.012 }}
    >
      <Circle center={ll(place.coordinate)} radius={place.radius} fillColor="rgba(217,36,28,0.14)" strokeColor={color.signalRed} strokeWidth={2} />
      {line && (
        <Polyline
          // Keyed so Android drops the dash pattern when the walking route replaces the straight line.
          key={route ? "route" : "crow"}
          coordinates={line.map(ll)}
          strokeColor={color.signalRed}
          strokeWidth={route ? 5 : 3}
          lineDashPattern={route ? undefined : [6, 6]}
          lineCap="round"
          lineJoin="round"
        />
      )}
      <Marker coordinate={ll(place.coordinate)} anchor={{ x: 0.5, y: 1 }} tracksViewChanges={tracks}>
        <PlaceFlag />
      </Marker>
    </MapView>
  );
}

/** Game over: where each of your proofs was snapped, in order. */
export function RouteMap({ points, style }: { points: Coordinate[]; style?: ViewStyle }) {
  const map = useRef<MapView>(null);
  const key = points.map((p) => `${p.latitude},${p.longitude}`).join(";");
  const onMapReady = useFit(map, points, key);
  const tracks = useTracksViewChanges(key);
  return (
    <MapView ref={map} style={style} {...quiet} initialRegion={points.length ? regionFor(points) : undefined} onMapReady={onMapReady}>
      {points.length > 1 && <Polyline coordinates={points.map(ll)} strokeColor={color.signalRed} strokeWidth={4} lineCap="round" lineJoin="round" />}
      {points.map((p, i) => (
        <Marker key={i} coordinate={ll(p)} anchor={{ x: 0.5, y: 0.5 }} tracksViewChanges={tracks}>
          <StepPin n={i + 1} last={i === points.length - 1} />
        </Marker>
      ))}
    </MapView>
  );
}

/** Place picker: tap to drop a pin; shows the radius. */
export function PickerMap({
  center,
  zoom = 15,
  pin,
  radius,
  onPick,
  onUserMove,
  showUserLocation = true,
  style,
}: {
  center: Coordinate;
  zoom?: number;
  pin: Coordinate | null;
  radius: number;
  onPick: (c: Coordinate) => void;
  onUserMove?: () => void;
  showUserLocation?: boolean;
  style?: ViewStyle;
}) {
  const map = useRef<MapView>(null);
  const centerKey = `${center.latitude},${center.longitude}`;
  const previousCenter = useRef(centerKey);
  useEffect(() => {
    if (pin) map.current?.animateCamera({ center: ll(pin) }, { duration: 300 });
  }, [pin?.latitude, pin?.longitude]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (previousCenter.current === centerKey || pin) return;
    previousCenter.current = centerKey;
    map.current?.animateToRegion({ ...ll(center), latitudeDelta: zoom === 2 ? 120 : 0.016, longitudeDelta: zoom === 2 ? 240 : 0.016 }, 450);
  }, [centerKey, pin, zoom]); // eslint-disable-line react-hooks/exhaustive-deps
  const tracks = useTracksViewChanges(pin ? `${pin.latitude},${pin.longitude}` : "");
  return (
    <MapView
      ref={map}
      style={style}
      {...quiet}
      showsUserLocation={showUserLocation}
      initialRegion={{ ...ll(center), latitudeDelta: zoom === 2 ? 120 : 0.016, longitudeDelta: zoom === 2 ? 240 : 0.016 }}
      onPanDrag={onUserMove}
      onPress={(e) => onPick(e.nativeEvent.coordinate)}
    >
      {pin && (
        <>
          <Circle center={ll(pin)} radius={radius} fillColor="rgba(217,36,28,0.15)" strokeColor={color.signalRed} strokeWidth={2} />
          <Marker coordinate={ll(pin)} anchor={{ x: 0.5, y: 1 }} tracksViewChanges={tracks}>
            <PlaceFlag />
          </Marker>
        </>
      )}
    </MapView>
  );
}

export const mapsSupportPicking = true;
