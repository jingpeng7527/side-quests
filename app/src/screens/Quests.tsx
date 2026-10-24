import Feather from "@expo/vector-icons/Feather";
import { PLACE_RADIUS_OPTIONS, distance, formatDistance, readiness, type Coordinate, type GameState, type Quest, type QuestPlace } from "@side-quests/game";
import * as Location from "expo-location";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Modal, Pressable, ScrollView, TextInput, View } from "react-native";
import { searchPlaces, nameSpot, type PlaceHit } from "../lib/geo";
import { newId, useGame } from "../lib/session";
import { DevMenu } from "../ui/DevMenu";
import { HostAdvance, HostWaitingBar, ReadyToggle } from "../ui/flow";
import { Avatar, Body, Button, Card, Display, IconButton, Label, Screen, SectionLabel, Tag, color, font, radius, space, usePalette } from "../ui/kit";
import { PickerMap } from "../ui/maps";
import { DifficultyMeter, PointsStepper, RatingLine } from "../ui/Points";
import { GameSettingsSheet } from "./Lobby";

const MAX_QUEST = 100;

/** "3 of 4 done ● ● ● ○" */
function DoneDots({ state }: { state: GameState }) {
  const { ready, waiting } = readiness(state);
  const total = ready.length + waiting.length;
  return (
    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
      <Body medium>
        {ready.length} of {total} done
      </Body>
      <View style={{ flexDirection: "row", gap: 6 }} accessibilityElementsHidden>
        {Array.from({ length: Math.min(total, 10) }, (_, i) => (
          <View key={i} style={{ width: 18, height: 18, borderRadius: 9, backgroundColor: i < ready.length ? color.signalRed : "transparent", borderWidth: 2, borderColor: i < ready.length ? color.signalRed : color.paperLine }} />
        ))}
      </View>
    </View>
  );
}

/** One quest in a list: author avatar, text (or sealed), byline. */
function QuestCard({ quest, state, mine, onRemove }: { quest: Quest; state: GameState; mine: boolean; onRemove?: () => void }) {
  const author = state.players.find((p) => p.id === quest.authorId);
  return (
    <Card style={{ flexDirection: "row", alignItems: "center", gap: space.m, paddingVertical: 12 }}>
      {quest.source === "ai" ? (
        <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: color.inkBlack, alignItems: "center", justifyContent: "center" }}>
          <Feather name="zap" size={18} color={color.paperBright} />
        </View>
      ) : (
        <Avatar name={author?.name ?? "?"} bot={author?.isBot} />
      )}
      <View style={{ flex: 1, gap: 4 }}>
        {mine ? (
          <Body size={14}>{quest.text}</Body>
        ) : (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <Feather name="lock" size={13} color={color.stone} />
            <Body size={14} color={color.stone}>
              {"Sealed until it's dealt"}
            </Body>
          </View>
        )}
        {mine && quest.place && <PlaceChip place={quest.place} />}
        {mine && <RatingLine quest={quest} state={state} />}
        <Label size={10}>{quest.source === "ai" ? "AI" : author?.name ?? "—"}</Label>
      </View>
      {onRemove ? (
        <IconButton icon="x" label="Remove quest" onPress={onRemove} />
      ) : (
        <Feather name="check" size={20} color={color.signalRed} />
      )}
    </Card>
  );
}

/**
 * Everyone writes quests. Yours are visible; others' stay sealed so they can
 * surprise you.
 */
export function QuestsScreen() {
  const { state, me, isHost, send } = useGame();
  const [draft, setDraft] = useState("");
  const [draftPlace, setDraftPlace] = useState<QuestPlace | undefined>();
  const [picking, setPicking] = useState(false);
  const [editing, setEditing] = useState(false);
  const [focused, setFocused] = useState(false);

  const submitted = [...state.quests].reverse().filter((q) => q.source === "human");
  const ai = state.quests.filter((q) => q.source === "ai").length;

  const add = () => {
    const text = draft.trim();
    if (!text) return;
    send({ type: "addQuest", quest: { id: newId(), text, place: draftPlace, authorId: me.id, source: "human", included: true } });
    setDraft("");
    setDraftPlace(undefined);
  };

  // If the host moves on mid-sentence, keep what you were writing instead of dropping it.
  const pending = useRef({ draft, draftPlace });
  useEffect(() => {
    pending.current = { draft, draftPlace };
  }, [draft, draftPlace]);
  useEffect(
    () => () => {
      const { draft: text, draftPlace: place } = pending.current;
      if (text.trim()) send({ type: "addQuest", quest: { id: newId(), text: text.trim(), place, authorId: me.id, source: "human", included: true } });
    },
    [], // eslint-disable-line react-hooks/exhaustive-deps
  );

  return (
    <Screen
      title="Write quests"
      right={
        <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
          <DevMenu />
          {isHost && <IconButton icon="sliders" label="Game settings" onPress={() => setEditing(true)} />}
        </View>
      }
      footer={
        isHost ? (
          <HostAdvance title="Review deck" waitingVerb="writing" disabled={!state.quests.length && !state.settings.aiStarterCount} />
        ) : (
          <ReadyToggle label="I'm done" />
        )
      }
    >
      <ScrollView contentContainerStyle={{ paddingHorizontal: space.gutter, gap: space.l, paddingBottom: space.l }} keyboardDismissMode="interactive" keyboardShouldPersistTaps="handled">
        <DoneDots state={state} />

        {/* Composer */}
        <Card style={{ gap: space.s, borderColor: focused ? color.signalRed : color.paperLine }}>
          <TextInput
            value={draft}
            onChangeText={(t) => setDraft(t.slice(0, MAX_QUEST))}
            placeholder="Write a side quest…"
            placeholderTextColor={color.stone}
            multiline
            maxLength={MAX_QUEST}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            onSubmitEditing={add}
            submitBehavior="blurAndSubmit"
            returnKeyType="done"
            accessibilityLabel="New quest"
            style={{ fontFamily: font.body, fontSize: 16, lineHeight: 23, color: color.inkBlack, minHeight: 72, textAlignVertical: "top" }}
          />
          {draftPlace && <PlaceChip place={draftPlace} onRemove={() => setDraftPlace(undefined)} />}
          <View style={{ flexDirection: "row", alignItems: "center", gap: space.s }}>
            {!draftPlace && (
              <Pressable onPress={() => setPicking(true)} accessibilityRole="button" style={{ flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 6 }}>
                <Feather name="map-pin" size={15} color={color.signalRed} />
                <Label size={11} bold color={color.signalRed}>
                  Add a place
                </Label>
              </Pressable>
            )}
            <View style={{ flex: 1 }} />
            <Label size={11}>
              {draft.length}/{MAX_QUEST}
            </Label>
            <Button title="Add" size="md" icon="plus" disabled={!draft.trim()} onPress={add} style={{ paddingHorizontal: space.m, minHeight: 40 }} />
          </View>
        </Card>

        <View style={{ gap: space.s }}>
          <SectionLabel>Submitted quests ({submitted.length})</SectionLabel>
          {!submitted.length && <Body color={color.stone}>Nothing yet. Write the first one.</Body>}
          {submitted.map((q) => (
            <QuestCard key={q.id} quest={q} state={state} mine={q.authorId === me.id} onRemove={q.authorId === me.id ? () => send({ type: "removeQuest", questId: q.id }) : undefined} />
          ))}
        </View>

        <Card style={{ flexDirection: "row", alignItems: "center", gap: space.m, backgroundColor: color.paperRaised, borderColor: "transparent" }}>
          <Feather name="zap" size={20} color={color.signalRed} />
          <Body size={13} style={{ flex: 1 }}>
            {state.settings.aiStarterCount > 0
              ? `${state.aiMode === "ai" ? "AI" : "The offline deck"} adds ${Math.max(0, state.settings.aiStarterCount - ai)} more in your group's vibe${state.settings.aiRefill ? ", and tops up the deck mid-game" : ""}.`
              : "AI starter quests are off."}
          </Body>
        </Card>
      </ScrollView>
      <GameSettingsSheet visible={editing} onClose={() => setEditing(false)} />
      <PlacePicker
        visible={picking}
        onDone={(p) => {
          if (p) setDraftPlace(p);
          setPicking(false);
        }}
      />
    </Screen>
  );
}

/** "📍 HAYES VALLEY · 250 M" — shown wherever a quest has a place. */
export function PlaceChip({ place, onRemove }: { place: QuestPlace; onRemove?: () => void }) {
  const pal = usePalette();
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "flex-start", paddingHorizontal: 10, paddingVertical: 5, borderRadius: radius.pill, borderWidth: 1.5, borderColor: pal.accent, maxWidth: "100%" }}>
      <Feather name="map-pin" size={12} color={pal.accent} />
      <Label size={11} bold color={pal.accent} numberOfLines={1} style={{ flexShrink: 1 }}>
        {place.name}
      </Label>
      <Label size={11}>· {place.radius} m</Label>
      {onRemove && (
        <Pressable onPress={onRemove} accessibilityLabel="Remove place" hitSlop={10}>
          <Feather name="x" size={13} color={pal.accent} />
        </Pressable>
      )}
    </View>
  );
}

/** Pin a quest to a spot: search, tap the map, or use where you're standing. */
function PlacePicker({ visible, onDone }: { visible: boolean; onDone: (p: QuestPlace | undefined) => void }) {
  const { location: gameLocation } = useGame();
  const [pickerLocation, setPickerLocation] = useState<Coordinate | null>(gameLocation);
  const [locating, setLocating] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);
  const mapTouched = useRef(false);
  const [manualMapCenter, setManualMapCenter] = useState<Coordinate | null>(null);
  const [pin, setPin] = useState<Coordinate | null>(null);
  const [name, setName] = useState("");
  const named = useRef(false); // manual names survive map taps
  const nameRequest = useRef(0);
  const searchRequest = useRef(0);
  const [radiusM, setRadius] = useState(100);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PlaceHit[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  // A neutral world view keeps manual pinning available without implying that
  // San Francisco (the game demo location) is the player's current location.
  const currentLocation = pickerLocation ?? gameLocation;
  const worldCenter = { latitude: 0, longitude: 0 };
  const center = manualMapCenter ?? currentLocation ?? worldCenter;

  const keepMapPosition = () => {
    if (mapTouched.current) return;
    mapTouched.current = true;
    setManualMapCenter(currentLocation ?? worldCenter);
  };

  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    mapTouched.current = false;
    Promise.resolve().then(() => {
      if (!cancelled) {
        setLocationError(null);
        setLocating(true);
      }
    });

    const locate = async () => {
      try {
        const permission = await Location.requestForegroundPermissionsAsync();
        if (!permission.granted) {
          if (!cancelled) {
            setLocationError("Location permission is off. Search for a place or move the map to choose one.");
            setLocating(false);
          }
          return;
        }
        const servicesEnabled = await Location.hasServicesEnabledAsync();
        if (!servicesEnabled) throw new Error("Location services are off.");

        const current = Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced, mayShowUserSettingsDialog: false });
        const deadline = new Promise<null>((resolve) => {
          timeout = setTimeout(() => resolve(null), 12_000);
        });
        const fix = await Promise.race([current, deadline]);
        if (timeout) clearTimeout(timeout);

        const applyFix = (position: Location.LocationObject) => {
          if (cancelled) return;
          const coordinate = { latitude: position.coords.latitude, longitude: position.coords.longitude };
          setPickerLocation(coordinate);
          setLocationError(null);
          setLocating(false);
        };
        if (fix) {
          applyFix(fix);
        } else if (!cancelled) {
          setLocationError("Still looking for your location. Search or move the map to choose a place.");
          setLocating(false);
          // A slow GPS fix can still improve the map if the player hasn't moved it.
          void current.then(applyFix).catch(() => {});
        }
      } catch {
        if (!cancelled) {
          setLocationError("Couldn't find your location. Search or move the map to choose a place.");
          setLocating(false);
        }
      }
    };
    void locate();
    return () => {
      cancelled = true;
      if (timeout) clearTimeout(timeout);
    };
  }, [visible]);

  // Ignore replies belonging to an older pin, query, or closed picker.
  useEffect(() => () => {
    nameRequest.current++;
    searchRequest.current++;
  }, []);

  const drop = async (c: Coordinate, label?: string) => {
    keepMapPosition();
    const request = ++nameRequest.current;
    searchRequest.current++;
    setSearching(false);
    setSearchError(null);
    setPin({ latitude: c.latitude, longitude: c.longitude });
    setResults(null);
    if (label) {
      named.current = false;
      setName(label);
      return;
    }
    if (named.current) return;
    setName("Dropped pin");
    const spot = await nameSpot(c);
    if (spot && request === nameRequest.current && !named.current) setName(spot);
  };

  const search = async () => {
    if (!query.trim()) return;
    const request = ++searchRequest.current;
    setResults(null);
    setSearchError(null);
    setSearching(true);
    try {
      const hits = await searchPlaces(query.trim(), currentLocation);
      if (request !== searchRequest.current) return;
      setResults(hits);
      if (!hits.length) setSearchError("No match — try another name, or tap the map.");
    } catch {
      if (request !== searchRequest.current) return;
      setSearchError("Search isn't working right now — tap the map instead.");
    } finally {
      if (request === searchRequest.current) setSearching(false);
    }
  };

  const close = (p?: QuestPlace) => {
    nameRequest.current++;
    searchRequest.current++;
    setSearching(false);
    mapTouched.current = false;
    setManualMapCenter(null);
    onDone(p);
    setPin(null);
    setName("");
    named.current = false;
    setQuery("");
    setResults(null);
    setSearchError(null);
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => close()}>
      <Screen
        title="Set a place"
        left={{ icon: "x", onPress: () => close(), label: "Cancel" }}
        footer={
          <Button
            title={pin ? "Pin it here" : "Tap the map to drop a pin"}
            icon="map-pin"
            disabled={!pin}
            onPress={() => pin && close({ name: name.trim() || "Pinned spot", coordinate: pin, radius: radiusM })}
          />
        }
      >
        <View style={{ flex: 1, paddingHorizontal: space.gutter, gap: space.m }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: space.s, paddingHorizontal: space.m, backgroundColor: color.paperBright, borderRadius: radius.pill, borderWidth: 1.5, borderColor: color.paperLine }}>
            <Feather name="search" size={18} color={color.stone} />
            <TextInput
              value={query}
              onChangeText={(text) => {
                searchRequest.current++;
                setSearching(false);
                setResults(null);
                setSearchError(null);
                setQuery(text);
              }}
              onSubmitEditing={search}
              returnKeyType="search"
              placeholder="Search a café, park, street…"
              placeholderTextColor={color.stone}
              autoCorrect={false}
              accessibilityLabel="Search places"
              style={{ flex: 1, fontFamily: font.body, fontSize: 16, color: color.inkBlack, paddingVertical: 13 }}
            />
            {searching && <ActivityIndicator color={color.signalRed} />}
          </View>
          {searchError && <Body size={13} color={color.signalRed}>{searchError}</Body>}

          <View style={{ flex: 1, minHeight: 220, borderRadius: radius.card, overflow: "hidden", borderWidth: 2, borderColor: color.inkBlack }}>
            <PickerMap
              style={{ flex: 1 }}
              key={visible ? "open" : "closed"}
              center={center}
              zoom={currentLocation ? 15 : 2}
              pin={pin}
              radius={radiusM}
              showUserLocation={!!pickerLocation}
              onPick={(c) => void drop(c)}
              onUserMove={keepMapPosition}
            />
            {results && results.length > 0 && (
              <ScrollView style={{ position: "absolute", left: 8, right: 8, top: 8, maxHeight: 220, backgroundColor: color.paperBright, borderRadius: radius.field }} keyboardShouldPersistTaps="handled">
                {results.map((hit, i) => (
                  <Pressable key={i} onPress={() => void drop(hit, hit.name)} style={{ padding: space.m, borderTopWidth: i ? 1 : 0, borderColor: color.paperLine }}>
                    <Body size={14} medium numberOfLines={1}>
                      {hit.name}
                    </Body>
                    <Label size={10} numberOfLines={1}>
                      {[currentLocation ? formatDistance(distance(currentLocation, hit)) : null, hit.detail].filter(Boolean).join(" · ")}
                    </Label>
                  </Pressable>
                ))}
              </ScrollView>
            )}
          </View>

          <View style={{ flexDirection: "row", alignItems: "center", gap: space.s }}>
            <Label size={11} style={{ flex: 1 }}>
              Counts as there within
            </Label>
            {PLACE_RADIUS_OPTIONS.map((r) => (
              <Pressable
                key={r}
                onPress={() => setRadius(r)}
                accessibilityRole="button"
                accessibilityState={{ selected: radiusM === r }}
                style={{ minHeight: 36, paddingHorizontal: 12, justifyContent: "center", borderRadius: radius.pill, backgroundColor: radiusM === r ? color.signalRed : "transparent", borderWidth: 1.5, borderColor: radiusM === r ? color.signalRed : color.paperLine }}
              >
                <Label size={11} bold color={radiusM === r ? color.paperBright : color.inkBlack}>
                  {r} m
                </Label>
              </Pressable>
            ))}
          </View>

          {locating && (
            <View style={{ flexDirection: "row", alignItems: "center", gap: space.s }} accessibilityLiveRegion="polite">
              <ActivityIndicator color={color.signalRed} />
              <Body size={12} color={color.stone}>{currentLocation ? "Updating your location…" : "Finding your location…"}</Body>
            </View>
          )}
          {locationError && <Body size={12} color={color.stone} accessibilityLiveRegion="polite">{locationError}</Body>}
          {pin ? (
            <View style={{ gap: 4 }}>
              <TextInput
                value={name}
                onChangeText={(t) => {
                  setName(t);
                  named.current = true;
                  nameRequest.current++;
                }}
                placeholder="Name this spot"
                placeholderTextColor={color.stone}
                accessibilityLabel="Name this spot"
                style={{ fontFamily: font.bodyMedium, fontSize: 17, color: color.inkBlack, backgroundColor: color.paperBright, borderRadius: radius.field, paddingHorizontal: space.m, paddingVertical: 12 }}
              />
              {currentLocation && <Label size={10}>{formatDistance(distance(currentLocation, pin))} from you</Label>}
            </View>
          ) : (
            <Button title="Use my spot" kind="outline" icon="crosshair" size="md" disabled={!currentLocation} onPress={() => currentLocation && void drop(currentLocation, "Right here")} />
          )}
        </View>
      </Screen>
    </Modal>
  );
}

/** Host curates the final deck before dealing. */
export function ReviewScreen() {
  const { state, me, isHost, send } = useGame();
  const [adding, setAdding] = useState("");
  const included = state.quests.filter((q) => q.included).length;
  const scoring = state.settings.difficultyScoring !== false;

  return (
    <Screen
      title="Review deck"
      right={<DevMenu />}
      footer={isHost ? <HostAdvance title={`Deal · ${state.settings.durationMinutes}:00`} icon="play" disabled={!included} /> : <HostWaitingBar text="{host} is reviewing the deck" />}
    >
      {isHost ? (
        <ScrollView contentContainerStyle={{ paddingHorizontal: space.gutter, paddingBottom: space.l, gap: space.s }}>
          <SectionLabel right={<Label size={11}>{included} in play</Label>}>Deck ({state.quests.length})</SectionLabel>
          {scoring && (
            <Body size={12} color={color.stone}>
              {"Harder quests are worth more. Points are rated from time, nerve and effort — use − / + to overrule."}
            </Body>
          )}
          {state.quests.map((q) => {
            const author = state.players.find((p) => p.id === q.authorId);
            return (
              <Card key={q.id} style={{ gap: space.s, opacity: q.included ? 1 : 0.55, paddingVertical: 12 }}>
                <Pressable
                  onPress={() => send({ type: "toggleQuest", questId: q.id })}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: q.included }}
                  accessibilityLabel={`Include: ${q.text}`}
                  style={{ flexDirection: "row", gap: space.m, alignItems: "flex-start" }}
                >
                  <View style={{ width: 26, height: 26, borderRadius: 8, marginTop: 2, alignItems: "center", justifyContent: "center", backgroundColor: q.included ? color.signalRed : "transparent", borderWidth: 2, borderColor: q.included ? color.signalRed : color.stone }}>
                    {q.included && <Feather name="check" size={16} color={color.paperBright} />}
                  </View>
                  <View style={{ flex: 1, gap: 6 }}>
                    <Body size={14} style={{ textDecorationLine: q.included ? "none" : "line-through" }}>
                      {q.text}
                    </Body>
                    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.s, alignItems: "center" }}>
                      {q.source === "ai" ? <Tag text="AI" tone="ink" /> : <Label size={10}>{author?.name ?? "—"}</Label>}
                      {q.place && <PlaceChip place={q.place} />}
                    </View>
                  </View>
                </Pressable>
                {scoring && (
                  <View style={{ flexDirection: "row", alignItems: "center", gap: space.m, paddingLeft: 26 + space.m }}>
                    <View style={{ flex: 1, gap: 4 }}>
                      {q.difficulty && <DifficultyMeter difficulty={q.difficulty} />}
                      {q.difficulty?.why && q.difficulty.by !== "host" ? (
                        <Body size={11} color={color.stone}>
                          {q.difficulty.why}
                        </Body>
                      ) : null}
                    </View>
                    <PointsStepper quest={q} state={state} onChange={(points) => send({ type: "setQuestPoints", questId: q.id, points })} />
                  </View>
                )}
              </Card>
            );
          })}
          {state.aiWriting && (
            <View style={{ flexDirection: "row", alignItems: "center", gap: space.s, paddingVertical: space.m }}>
              <ActivityIndicator color={color.signalRed} />
              <Label size={11}>{state.aiMode === "ai" ? "AI is writing in your vibe…" : "Dealing from the offline deck…"}</Label>
            </View>
          )}
          <Card style={{ flexDirection: "row", alignItems: "center", gap: space.s, paddingVertical: 6 }}>
            <TextInput
              value={adding}
              onChangeText={setAdding}
              placeholder="Add another quest…"
              placeholderTextColor={color.stone}
              accessibilityLabel="Add another quest"
              onSubmitEditing={() => {
                if (adding.trim()) send({ type: "addQuest", quest: { id: newId(), text: adding.trim(), authorId: me.id, source: "human", included: true } });
                setAdding("");
              }}
              style={{ flex: 1, fontFamily: font.body, fontSize: 16, color: color.inkBlack, paddingVertical: 10 }}
            />
            <Feather name="corner-down-left" size={18} color={color.stone} />
          </Card>
        </ScrollView>
      ) : (
        <View style={{ paddingHorizontal: space.gutter, gap: space.m, marginTop: space.l }}>
          <Display size={160} color={color.signalRed}>
            {String(state.quests.length)}
          </Display>
          <Display size={40}>quests in the deck.</Display>
          <Body color={color.stone}>The host is giving it a once-over. Get your shoes on.</Body>
        </View>
      )}
    </Screen>
  );
}
