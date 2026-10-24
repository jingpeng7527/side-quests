import type { Coordinate, QuestPlace } from "@side-quests/game";
import { useEffect, useRef } from "react";
import { Platform, Text, View, type ViewStyle } from "react-native";
import MapView, { Circle, Marker, Polyline, type LatLng, type MapViewProps } from "react-native-maps";
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

/** Fits the camera to every point once the map is ready. */
function useFit(map: React.RefObject<MapView | null>, points: Coordinate[], key: string) {
  useEffect(() => {
    if (!points.length) return;
    const t = setTimeout(
      () => map.current?.fitToCoordinates(points.map(ll), { edgePadding: { top: 50, right: 50, bottom: 50, left: 50 }, animated: false }),
      300,
    );
    return () => clearTimeout(t);
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
}

/** In game: the quest's spot, its radius, you, and the walk between. */
export function QuestMap({ place, me, route, arrived, style }: { place: QuestPlace; me: Coordinate | null; route: Coordinate[] | null; arrived: boolean; style?: ViewStyle }) {
  const map = useRef<MapView>(null);
  const line = arrived ? null : route ?? (me ? [me, place.coordinate] : null);
  useFit(map, [place.coordinate, ...(me ? [me] : [])], `${place.name}-${!!me}-${!!route}`);
  return (
    <MapView
      ref={map}
      style={style}
      {...quiet}
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
      <Marker coordinate={ll(place.coordinate)} anchor={{ x: 0.5, y: 1 }} tracksViewChanges={Platform.OS === "android"}>
        <PlaceFlag />
      </Marker>
    </MapView>
  );
}

/** Game over: where each of your proofs was snapped, in order. */
export function RouteMap({ points, style }: { points: Coordinate[]; style?: ViewStyle }) {
  const map = useRef<MapView>(null);
  useFit(map, points, String(points.length));
  return (
    <MapView ref={map} style={style} {...quiet}>
      {points.length > 1 && <Polyline coordinates={points.map(ll)} strokeColor={color.signalRed} strokeWidth={4} lineCap="round" lineJoin="round" />}
      {points.map((p, i) => (
        <Marker key={i} coordinate={ll(p)} anchor={{ x: 0.5, y: 0.5 }} tracksViewChanges={Platform.OS === "android"}>
          <StepPin n={i + 1} last={i === points.length - 1} />
        </Marker>
      ))}
    </MapView>
  );
}

/** Place picker: tap to drop a pin; shows the radius. */
export function PickerMap({
  center,
  pin,
  radius,
  onPick,
  style,
}: {
  center: Coordinate;
  pin: Coordinate | null;
  radius: number;
  onPick: (c: Coordinate) => void;
  style?: ViewStyle;
}) {
  const map = useRef<MapView>(null);
  useEffect(() => {
    if (pin) map.current?.animateCamera({ center: ll(pin) }, { duration: 300 });
  }, [pin?.latitude, pin?.longitude]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <MapView
      ref={map}
      style={style}
      {...quiet}
      showsUserLocation
      initialRegion={{ ...ll(center), latitudeDelta: 0.016, longitudeDelta: 0.016 }}
      onPress={(e) => onPick(e.nativeEvent.coordinate)}
    >
      {pin && (
        <>
          <Circle center={ll(pin)} radius={radius} fillColor="rgba(217,36,28,0.15)" strokeColor={color.signalRed} strokeWidth={2} />
          <Marker coordinate={ll(pin)} anchor={{ x: 0.5, y: 1 }} tracksViewChanges={Platform.OS === "android"}>
            <PlaceFlag />
          </Marker>
        </>
      )}
    </MapView>
  );
}

export const mapsSupportPicking = true;
