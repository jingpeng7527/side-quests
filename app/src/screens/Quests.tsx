import { DEFAULT_LOCATION, PLACE_RADIUS_OPTIONS, distance, formatDistance, type Coordinate, type QuestPlace } from "@side-quests/game";
import * as Location from "expo-location";
import { useState } from "react";
import { Modal, Platform, Pressable, ScrollView, TextInput, View } from "react-native";
import { newId, useGame } from "../lib/session";
import { DevMenu } from "../ui/DevMenu";
import { Avatar, Body, Display, Hairline, Label, Screen, SlabButton, Tag, WaitingBar, color, font, space, usePalette } from "../ui/kit";
import { PickerMap, mapsSupportPicking } from "../ui/maps";
import { GameSettingsSheet, SettingsSummary, Stepper } from "./Lobby";

/**
 * Everyone writes quests. Yours are visible; others' stay sealed so they can
 * surprise you; the AI section previews how many it'll add.
 */
export function QuestsScreen() {
  const { state, me, isHost, send } = useGame();
  const [draft, setDraft] = useState("");
  const [draftPlace, setDraftPlace] = useState<QuestPlace | undefined>();
  const [picking, setPicking] = useState(false);
  const [editing, setEditing] = useState(false);
  const [focused, setFocused] = useState(false);

  const mine = state.quests.filter((q) => q.authorId === me.id);
  const shared = state.quests.filter((q) => q.source === "human" && q.authorId !== me.id);
  const others = state.players.filter((p) => p.id !== me.id);

  const add = () => {
    const text = draft.trim();
    if (!text) return;
    send({ type: "addQuest", quest: { id: newId(), text, place: draftPlace, authorId: me.id, source: "human", included: true } });
    setDraft("");
    setDraftPlace(undefined);
  };

  return (
    <Screen
      index="02"
      title="Write quests"
      trailing={`${state.quests.length} total`}
      accessory={<DevMenu />}
      footer={
        isHost ? (
          <>
            <SettingsSummary settings={state.settings} editable onEdit={() => setEditing(true)} />
            <SlabButton
              title="Review deck"
              disabled={!state.quests.length && !state.settings.aiStarterCount}
              onPress={() => send({ type: "setPhase", phase: "review" })}
            />
          </>
        ) : (
          <WaitingBar text="Host reviews when ready" />
        )
      }
    >
      <ScrollView contentContainerStyle={{ paddingHorizontal: space.gutter, gap: space.xl, paddingBottom: space.l }} keyboardDismissMode="interactive">
        {/* YOURS */}
        <View style={{ gap: space.m }}>
          <SectionHead title="Yours" count={mine.length} />
          <View style={{ flexDirection: "row", alignItems: "flex-end", gap: space.s }}>
            <TextInput
              value={draft}
              onChangeText={setDraft}
              placeholder="Get a stranger to…"
              placeholderTextColor="rgba(107,100,94,0.6)"
              multiline
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
              onSubmitEditing={add}
              submitBehavior="blurAndSubmit"
              returnKeyType="done"
              style={{ flex: 1, fontFamily: font.display, fontSize: 30, color: color.inkBlack, paddingVertical: 4 }}
            />
            <IconSlab glyph="⌖" active={!!draftPlace} label={draftPlace ? "Change place" : "Set a place"} onPress={() => setPicking(true)} />
            <IconSlab glyph="+" filled label="Add quest" disabled={!draft.trim()} onPress={add} />
          </View>
          <Hairline emphasized={focused} />
          {draftPlace ? (
            <PlaceChip place={draftPlace} onRemove={() => setDraftPlace(undefined)} />
          ) : (
            <Body size={13} color={color.stone}>
              Tap ⌖ to make it happen somewhere specific.
            </Body>
          )}
          {mine.map((q) => (
            <View key={q.id} style={{ flexDirection: "row", gap: space.s }}>
              <View style={{ flex: 1, gap: 6 }}>
                <Body>{q.text}</Body>
                {q.place && <PlaceChip place={q.place} />}
              </View>
              <Pressable onPress={() => send({ type: "removeQuest", questId: q.id })} accessibilityLabel="Remove quest" hitSlop={10}>
                <Label size={14}>✕</Label>
              </Pressable>
            </View>
          ))}
        </View>

        {/* SHARED */}
        <View style={{ gap: space.m }}>
          <SectionHead title="Shared" count={shared.length} />
          {!others.length && <Body color={color.stone}>Nobody else here yet.</Body>}
          {others.map((p) => (
            <View key={p.id} style={{ flexDirection: "row", alignItems: "center", gap: space.m }}>
              <Avatar name={p.name} size={28} />
              <Body weight="600" style={{ flex: 1 }}>
                {p.name}
              </Body>
              <SealedStack count={shared.filter((q) => q.authorId === p.id).length} />
            </View>
          ))}
          <Body size={13} color={color.stone}>
            {"Sealed — you'll only see these if you're dealt one."}
          </Body>
        </View>

        {/* AI */}
        <View style={{ gap: space.m }}>
          <SectionHead title="AI" count={state.settings.aiStarterCount} />
          <Body size={15} color={color.stone}>
            {state.settings.aiRefill
              ? `${state.aiMode === "claude" ? "Claude" : "The offline deck"} reads the vibe of your quests and adds ${state.settings.aiStarterCount} — plus more whenever the deck runs dry mid-game.`
              : `Adds ${state.settings.aiStarterCount} quests in your vibe. Mid-game refills are off.`}
          </Body>
          {isHost && (
            <Stepper
              label="Starter quests"
              value={state.settings.aiStarterCount}
              min={0}
              max={10}
              onChange={(v) => send({ type: "updateSettings", settings: { ...state.settings, aiStarterCount: v } })}
            />
          )}
        </View>
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

function IconSlab({ glyph, label, onPress, filled, active, disabled }: { glyph: string; label: string; onPress: () => void; filled?: boolean; active?: boolean; disabled?: boolean }) {
  const bg = filled ? color.signalRed : active ? color.inkBlack : "transparent";
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityLabel={label}
      style={{ width: 48, height: 48, alignItems: "center", justifyContent: "center", backgroundColor: bg, borderWidth: 2, borderColor: filled ? color.signalRed : color.inkBlack, opacity: disabled ? 0.4 : 1 }}
    >
      <Display size={30} color={filled || active ? color.paperBright : color.inkBlack} style={{ lineHeight: 34 }}>
        {glyph}
      </Display>
    </Pressable>
  );
}

export function SectionHead({ title, count }: { title: string; count: number }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "baseline", gap: space.s }}>
      <Display size={48}>{title}</Display>
      <Label color={color.signalRed} style={{ fontFamily: font.monoBold }}>
        {String(count).padStart(2, "0")}
      </Label>
    </View>
  );
}

/** A fanned stack of face-down cards. */
function SealedStack({ count }: { count: number }) {
  return (
    <View style={{ width: 64, height: 34, flexDirection: "row", alignItems: "center" }} accessibilityLabel={`${count} sealed quests`}>
      {count === 0 && <Label>—</Label>}
      {Array.from({ length: Math.min(count, 4) }, (_, i) => (
        <View
          key={i}
          style={{
            position: "absolute",
            left: i * 5,
            width: 22,
            height: 30,
            backgroundColor: color.paperRaised,
            borderWidth: 1,
            borderColor: color.paperLine,
            transform: [{ rotate: `${i * 7 - 7}deg` }],
          }}
        />
      ))}
      {count > 0 && (
        <Label color={color.signalRed} style={{ position: "absolute", right: 0 }}>
          {count}
        </Label>
      )}
    </View>
  );
}

/** "⌖ HAYES VALLEY · 250 M" — shown wherever a quest has a place. */
export function PlaceChip({ place, onRemove }: { place: QuestPlace; onRemove?: () => void }) {
  const pal = usePalette();
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "flex-start", paddingHorizontal: 8, paddingVertical: 5, borderWidth: 1.5, borderColor: pal.accent }}>
      <Label size={11} color={pal.accent} numberOfLines={1}>
        ⌖ {place.name} <Label size={11}>· {place.radius} m</Label>
      </Label>
      {onRemove && (
        <Pressable onPress={onRemove} accessibilityLabel="Remove place" hitSlop={10}>
          <Label size={11} color={pal.accent}>
            ✕
          </Label>
        </Pressable>
      )}
    </View>
  );
}

/** Pin a quest to a spot: search, tap the map, or use where you're standing. */
function PlacePicker({ visible, onDone }: { visible: boolean; onDone: (p: QuestPlace | undefined) => void }) {
  const { location } = useGame();
  const [pin, setPin] = useState<Coordinate | null>(null);
  const [name, setName] = useState("");
  const [radius, setRadius] = useState(100);
  const [query, setQuery] = useState("");
  const [searchError, setSearchError] = useState<string | null>(null);
  const center = location ?? DEFAULT_LOCATION;

  const drop = (c: Coordinate, label: string) => {
    setPin(c);
    setName(label);
  };

  const search = async () => {
    setSearchError(null);
    try {
      const hits = await Location.geocodeAsync(query);
      if (!hits.length) return setSearchError("No match — try a street or landmark, or tap the map.");
      // Prefer the closest hit to the player.
      const best = hits.sort((a, b) => distance(center, a) - distance(center, b))[0];
      drop({ latitude: best.latitude, longitude: best.longitude }, query.trim());
    } catch {
      setSearchError("Search isn't available here — tap the map instead.");
    }
  };

  const close = (p?: QuestPlace) => {
    onDone(p);
    setPin(null);
    setName("");
    setQuery("");
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => close()}>
      <Screen
        index="⌖"
        title="Set a place"
        footer={
          <>
            <SlabButton
              title={pin ? "Pin it here" : mapsSupportPicking ? "Tap the map to drop a pin" : "Use my spot to pin it"}
              disabled={!pin}
              onPress={() => pin && close({ name: name.trim() || "Pinned spot", coordinate: pin, radius })}
            />
            <SlabButton title="Cancel" kind="quiet" onPress={() => close()} />
          </>
        }
      >
        <View style={{ flex: 1, paddingHorizontal: space.gutter, gap: space.m }}>
          {Platform.OS !== "web" && (
            <View style={{ flexDirection: "row", alignItems: "center", gap: space.s, paddingHorizontal: space.m, backgroundColor: color.paperRaised }}>
              <Label>⌕</Label>
              <TextInput
                value={query}
                onChangeText={setQuery}
                onSubmitEditing={search}
                returnKeyType="search"
                placeholder="Search a street or landmark"
                placeholderTextColor={color.stone}
                autoCorrect={false}
                style={{ flex: 1, fontSize: 17, fontWeight: "500", color: color.inkBlack, paddingVertical: 14 }}
              />
            </View>
          )}
          {searchError && <Body size={13} color={color.signalRed}>{searchError}</Body>}
          <View style={{ flex: 1, minHeight: 220, borderWidth: 2, borderColor: color.inkBlack }}>
            <PickerMap style={{ flex: 1 }} center={center} pin={pin} radius={radius} onPick={(c) => drop(c, name || "Dropped pin")} />
          </View>
          <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
            <Label size={11}>Counts as there within</Label>
            <Pressable disabled={!location} onPress={() => location && drop(location, "Right here")}>
              <Label size={11} color={color.signalRed}>
                Use my spot
              </Label>
            </Pressable>
          </View>
          <View style={{ flexDirection: "row" }}>
            {PLACE_RADIUS_OPTIONS.map((r) => (
              <Pressable
                key={r}
                onPress={() => setRadius(r)}
                style={{ flex: 1, minHeight: 44, alignItems: "center", justifyContent: "center", backgroundColor: radius === r ? color.signalRed : "transparent", borderWidth: 1, borderColor: color.paperLine }}
              >
                <Display size={22} color={radius === r ? color.paperBright : color.inkBlack}>
                  {r} m
                </Display>
              </Pressable>
            ))}
          </View>
          {pin && (
            <View style={{ gap: 4 }}>
              <TextInput
                value={name}
                onChangeText={setName}
                placeholder="Name this spot"
                placeholderTextColor={color.stone}
                style={{ fontFamily: font.display, fontSize: 28, color: color.inkBlack, paddingVertical: 2 }}
              />
              <Hairline emphasized />
              {location && <Label size={10}>{formatDistance(distance(location, pin))} from you</Label>}
            </View>
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

  return (
    <Screen
      index="03"
      title="Review deck"
      trailing={`${included} in play`}
      accessory={<DevMenu />}
      footer={
        isHost ? (
          <SlabButton title={`Deal · ${state.settings.durationMinutes}:00`} disabled={!included} onPress={() => send({ type: "startGame" })} />
        ) : (
          <WaitingBar text="Get ready" />
        )
      }
    >
      {isHost ? (
        <ScrollView contentContainerStyle={{ paddingHorizontal: space.gutter, paddingBottom: space.l }}>
          {state.quests.map((q) => (
            <View key={q.id}>
              <Pressable onPress={() => send({ type: "toggleQuest", questId: q.id })} style={{ flexDirection: "row", gap: space.m, paddingVertical: 12 }}>
                <View style={{ width: 22, height: 22, marginTop: 2, backgroundColor: q.included ? color.signalRed : "transparent", borderWidth: 2, borderColor: q.included ? color.signalRed : color.stone, alignItems: "center", justifyContent: "center" }}>
                  {q.included && <Label size={12} color={color.paperBright} style={{ fontFamily: font.monoBold, letterSpacing: 0 }}>✓</Label>}
                </View>
                <View style={{ flex: 1, gap: 6 }}>
                  <Body color={q.included ? color.inkBlack : color.stone} style={{ textDecorationLine: q.included ? "none" : "line-through" }}>
                    {q.text}
                  </Body>
                  {q.place && <PlaceChip place={q.place} />}
                  {q.source === "ai" ? <Tag text="AI" filled /> : <Tag text={state.players.find((p) => p.id === q.authorId)?.name ?? "—"} />}
                </View>
              </Pressable>
              <Hairline style={{ marginLeft: 38 }} />
            </View>
          ))}
          {state.aiWriting && (
            <Label size={11} style={{ paddingVertical: space.m }}>
              {state.aiMode === "claude" ? "Claude is writing in your vibe…" : "Dealing from the offline deck…"}
            </Label>
          )}
          <View style={{ flexDirection: "row", alignItems: "center", gap: space.m, paddingVertical: space.m }}>
            <TextInput
              value={adding}
              onChangeText={setAdding}
              placeholder="+ Add another"
              placeholderTextColor={color.stone}
              onSubmitEditing={() => {
                if (adding.trim()) send({ type: "addQuest", quest: { id: newId(), text: adding, authorId: me.id, source: "human", included: true } });
                setAdding("");
              }}
              style={{ flex: 1, fontSize: 17, fontWeight: "500", color: color.inkBlack }}
            />
          </View>
        </ScrollView>
      ) : (
        <View style={{ paddingHorizontal: space.gutter, gap: space.m }}>
          <Display size={160} color={color.signalRed}>
            {String(state.quests.length)}
          </Display>
          <Display size={34}>quests in the deck. The host is giving it a once-over.</Display>
        </View>
      )}
    </Screen>
  );
}
