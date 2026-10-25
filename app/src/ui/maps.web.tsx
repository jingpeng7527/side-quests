import type { Coordinate, QuestPlace } from "@side-quests/game";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { createElement, useEffect, useRef } from "react";
import { View, type ViewStyle } from "react-native";
import { serverUrl } from "../lib/config";
import { color } from "./theme";

// Web maps: Leaflet over OpenStreetMap tiles, rendered quiet — grayscale and
// warmed toward the app's paper tone — so the red route and pins carry the color,
// close to the calm native Apple/Google look. (Keyless tiles: CARTO's now need a key.)
// Tiles come through our own server (server/src/tiles.ts), which caches them and
// falls back to Esri when OSM refuses — phones asking OSM directly got blocked at
// random, leaving the map blank.

let styled = false;
function injectStyles() {
  if (styled || typeof document === "undefined") return;
  styled = true;
  const css = document.createElement("style");
  css.textContent = `
    /* isolation + mask: iOS Safari sometimes skips painting filtered, transformed
       tiles inside a rounded, clipped box; giving the map its own clipped layer fixes it. */
    .sq-map { background: ${color.paper}; font-family: inherit; isolation: isolate; -webkit-mask-image: -webkit-radial-gradient(white, black); }
    .sq-map .sq-tiles { filter: grayscale(1) sepia(0.16) contrast(0.88) brightness(1.08); }
    .sq-map .leaflet-control-attribution { font-size: 9px; background: rgba(255,250,246,0.8); }
    .sq-pin { display: flex; align-items: center; justify-content: center; }
  `;
  document.head.appendChild(css);
}

const flagIcon = L.divIcon({
  className: "sq-pin",
  iconSize: [32, 42],
  iconAnchor: [16, 42],
  html: `<svg width="32" height="42" viewBox="0 0 32 42"><rect x="2" y="2" width="28" height="28" rx="9" fill="${color.signalRed}"/><path d="M11 23V9h11l-2.5 4 2.5 4H13" stroke="${color.paperBright}" stroke-width="2.4" fill="none" stroke-linejoin="round"/><rect x="14.5" y="30" width="3" height="11" rx="1.5" fill="${color.signalRed}"/></svg>`,
});

const youIcon = L.divIcon({
  className: "sq-pin",
  iconSize: [22, 22],
  iconAnchor: [11, 11],
  html: `<div style="width:16px;height:16px;border-radius:8px;background:${color.signalRed};border:3px solid ${color.paperBright};box-shadow:0 0 0 2px ${color.signalRed}"></div>`,
});

const stepIcon = (n: number, last: boolean) =>
  L.divIcon({
    className: "sq-pin",
    iconSize: [26, 26],
    iconAnchor: [13, 13],
    html: `<div style="width:26px;height:26px;border-radius:13px;display:flex;align-items:center;justify-content:center;background:${last ? color.signalRed : color.paperBright};border:2.5px solid ${color.signalRed};color:${last ? color.paperBright : color.signalRed};font:700 12px ui-monospace,monospace">${n}</div>`,
  });

const ll = (c: Coordinate): L.LatLngTuple => [c.latitude, c.longitude];

/** A Leaflet map in a View. `draw` (re)paints overlays whenever `deps` change. */
function LeafletMap({
  style,
  center,
  zoom,
  draw,
  deps,
  onTap,
  onUserMove,
  centerKey,
}: {
  style?: ViewStyle;
  center: Coordinate;
  zoom: number;
  draw: (map: L.Map, layer: L.LayerGroup) => void;
  deps: unknown[];
  onTap?: (c: Coordinate) => void;
  onUserMove?: () => void;
  centerKey?: string;
}) {
  const el = useRef<HTMLDivElement | null>(null);
  const map = useRef<L.Map | null>(null);
  const layer = useRef<L.LayerGroup | null>(null);
  // The click handler is bound once; it reads the latest onTap through this ref.
  const tap = useRef(onTap);
  const moved = useRef(onUserMove);
  const paint = useRef(draw);
  const initialView = useRef({ centerKey, zoom });
  useEffect(() => {
    paint.current = draw;
  });
  useEffect(() => {
    tap.current = onTap;
  }, [onTap]);
  useEffect(() => {
    moved.current = onUserMove;
  }, [onUserMove]);

  useEffect(() => {
    injectStyles();
    if (!el.current || map.current) return;
    const m = L.map(el.current, { zoomControl: false, attributionControl: true, center: ll(center), zoom });
    const tiles = L.tileLayer(`${serverUrl()}/api/tiles/{z}/{x}/{y}.png`, {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> · Esri',
      maxZoom: 19,
      className: "sq-tiles",
    }).addTo(m);
    // A tile that fails (flaky mobile data) would otherwise stay a blank square for good.
    tiles.on("tileerror", ({ tile }: L.TileErrorEvent) => {
      const img = tile as HTMLImageElement & { retries?: number };
      img.retries = (img.retries ?? 0) + 1;
      if (img.retries > 3) return;
      const src = img.src.replace(/[?&]retry=\d+$/, "");
      setTimeout(() => {
        img.src = `${src}${src.includes("?") ? "&" : "?"}retry=${img.retries}`;
      }, 600 * img.retries);
    });
    m.on("click", (e: L.LeafletMouseEvent) => tap.current?.({ latitude: e.latlng.lat, longitude: e.latlng.lng }));
    m.on("dragstart zoomstart", () => moved.current?.());
    layer.current = L.layerGroup().addTo(m);
    map.current = m;
    // The View may still be sizing itself.
    const resize = setTimeout(() => m.invalidateSize(), 50);
    // Pin fields, search feedback and the phone keyboard change the map's size
    // after mount. Keep Leaflet's pixel-to-coordinate calculations in sync.
    // If it started at zero size (mid-entrance, or before the ScrollView laid out),
    // the first draw framed nothing: draw again once there's something to frame.
    let hadSize = m.getSize().x > 0 && m.getSize().y > 0;
    const observer =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(() => {
            m.invalidateSize({ animate: false });
            const size = m.getSize();
            if (hadSize || !size.x || !size.y) return;
            hadSize = true;
            layer.current?.clearLayers();
            if (layer.current) paint.current(m, layer.current);
          });
    observer?.observe(el.current);
    return () => {
      clearTimeout(resize);
      observer?.disconnect();
      // Stop any pan/zoom in flight first: removing a map mid-animation throws.
      m.stop();
      m.remove();
      map.current = null;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!map.current || centerKey === undefined) return;
    const previous = initialView.current;
    if (previous.centerKey === centerKey && previous.zoom === zoom) return;
    initialView.current = { centerKey, zoom };
    map.current.setView(ll(center), zoom, { animate: false });
  }, [centerKey, zoom]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!map.current || !layer.current) return;
    layer.current.clearLayers();
    draw(map.current, layer.current);
  }, deps); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <View style={[{ overflow: "hidden" }, style]}>
      {createElement("div", { ref: el, className: "sq-map", style: { width: "100%", height: "100%" } })}
    </View>
  );
}

export function PlaceFlag() {
  return createElement("div", { dangerouslySetInnerHTML: { __html: flagIcon.options.html as string } });
}

/** In game: the quest's spot, its radius, you, and the walk between. */
export function QuestMap({ place, me, route, arrived, style }: { place: QuestPlace; me: Coordinate | null; route: Coordinate[] | null; arrived: boolean; style?: ViewStyle }) {
  return (
    <LeafletMap
      style={style}
      center={place.coordinate}
      zoom={16}
      deps={[place.coordinate.latitude, place.coordinate.longitude, place.radius, me?.latitude, me?.longitude, route?.length, arrived]}
      draw={(map, layer) => {
        L.circle(ll(place.coordinate), { radius: place.radius, color: color.signalRed, weight: 2, fillColor: color.signalRed, fillOpacity: 0.12 }).addTo(layer);
        const line = arrived ? null : route ?? (me ? [me, place.coordinate] : null);
        if (line) {
          L.polyline(line.map(ll), { color: color.signalRed, weight: route ? 5 : 3, dashArray: route ? undefined : "6 8", lineCap: "round", lineJoin: "round" }).addTo(layer);
        }
        L.marker(ll(place.coordinate), { icon: flagIcon }).addTo(layer);
        if (me) L.marker(ll(me), { icon: youIcon }).addTo(layer);
        const pts = [place.coordinate, ...(me ? [me] : []), ...(route ?? [])].map(ll);
        if (pts.length > 1) map.fitBounds(L.latLngBounds(pts), { padding: [36, 36], maxZoom: 17, animate: false });
      }}
    />
  );
}

/** Game over: where each of your proofs was snapped, in order. */
export function RouteMap({ points, style }: { points: Coordinate[]; style?: ViewStyle }) {
  return (
    <LeafletMap
      style={style}
      center={points[0] ?? { latitude: 37.7749, longitude: -122.4194 }}
      zoom={15}
      deps={[points.length]}
      draw={(map, layer) => {
        if (points.length > 1) L.polyline(points.map(ll), { color: color.signalRed, weight: 4, lineCap: "round", lineJoin: "round" }).addTo(layer);
        points.forEach((p, i) => L.marker(ll(p), { icon: stepIcon(i + 1, i === points.length - 1) }).addTo(layer));
        if (points.length > 1) map.fitBounds(L.latLngBounds(points.map(ll)), { padding: [36, 36], maxZoom: 17, animate: false });
      }}
    />
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
  return (
    <LeafletMap
      style={style}
      center={center}
      zoom={zoom}
      onTap={onPick}
      onUserMove={onUserMove}
      centerKey={`${center.latitude},${center.longitude}`}
      deps={[pin?.latitude, pin?.longitude, radius, showUserLocation]}
      draw={(map, layer) => {
        if (showUserLocation) L.marker(ll(center), { icon: youIcon, interactive: false }).addTo(layer);
        if (!pin) return;
        L.circle(ll(pin), { radius, color: color.signalRed, weight: 2, fillColor: color.signalRed, fillOpacity: 0.14, interactive: false }).addTo(layer);
        L.marker(ll(pin), { icon: flagIcon, interactive: false }).addTo(layer);
        map.panTo(ll(pin), { animate: false });
      }}
    />
  );
}

/** Tap-to-pin works on the web map too now. */
export const mapsSupportPicking = true;
