import type { Coordinate, QuestPlace } from "@side-quests/game";
import { createElement } from "react";
import { Text, View, type ViewStyle } from "react-native";
import { color, font } from "./theme";

// react-native-maps has no web implementation. On web, show an embedded
// OpenStreetMap view centered on the relevant spot instead — enough to
// orient a player who joined from a browser.

function OsmEmbed({ center, spanDeg, marker, style }: { center: Coordinate; spanDeg: number; marker?: Coordinate; style?: ViewStyle }) {
  const bbox = [center.longitude - spanDeg, center.latitude - spanDeg * 0.7, center.longitude + spanDeg, center.latitude + spanDeg * 0.7].join(",");
  const m = marker ? `&marker=${marker.latitude},${marker.longitude}` : "";
  return (
    <View style={[{ overflow: "hidden", backgroundColor: color.paperRaised }, style]}>
      {createElement("iframe", {
        src: `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik${m}`,
        style: { border: 0, width: "100%", height: "100%" },
        title: "Map",
      })}
    </View>
  );
}

export function PlaceFlag() {
  return (
    <View style={{ width: 28, height: 28, backgroundColor: color.signalRed, alignItems: "center", justifyContent: "center" }}>
      <Text style={{ color: color.paperBright, fontFamily: font.monoBold }}>⚑</Text>
    </View>
  );
}

export function QuestMap({ place, style }: { place: QuestPlace; me: Coordinate | null; route: Coordinate[] | null; arrived: boolean; style?: ViewStyle }) {
  return <OsmEmbed center={place.coordinate} spanDeg={0.006} marker={place.coordinate} style={style} />;
}

export function RouteMap({ points, style }: { points: Coordinate[]; style?: ViewStyle }) {
  if (!points.length) return <View style={[{ backgroundColor: color.paperRaised }, style]} />;
  const lat = points.reduce((a, p) => a + p.latitude, 0) / points.length;
  const lng = points.reduce((a, p) => a + p.longitude, 0) / points.length;
  return <OsmEmbed center={{ latitude: lat, longitude: lng }} spanDeg={0.01} marker={points[points.length - 1]} style={style} />;
}

export function PickerMap({ center, pin, style }: { center: Coordinate; pin: Coordinate | null; radius: number; onPick: (c: Coordinate) => void; style?: ViewStyle }) {
  return <OsmEmbed center={pin ?? center} spanDeg={0.008} marker={pin ?? undefined} style={style} />;
}

/** The web map is view-only; the picker offers "use my spot" instead of tap-to-pin. */
export const mapsSupportPicking = false;
