import type { Phase } from "@side-quests/game";
import { useLocalSearchParams } from "expo-router";
import { useEffect, useRef } from "react";
import { useSession } from "../lib/session";
import { HomeScreen } from "../screens/Home";
import { InGameScreen } from "../screens/InGame";
import { LobbyScreen } from "../screens/Lobby";
import { QuestsScreen, ReviewScreen } from "../screens/Quests";
import { EndGameScreen, ScoreboardScreen, VerifyScreen } from "../screens/Results";

const SCREENS: Record<Phase, () => React.JSX.Element> = {
  lobby: LobbyScreen,
  writing: QuestsScreen,
  review: ReviewScreen,
  playing: InGameScreen,
  ended: EndGameScreen,
  verifying: VerifyScreen,
  scoreboard: ScoreboardScreen,
};

export default function Index() {
  const { state } = useSession();
  useDemoLink();
  if (!state) return <HomeScreen />;
  const PhaseScreen = SCREENS[state.phase];
  return <PhaseScreen />;
}

/**
 * Dev: open `…/?demo=<phase>[&place=1]` to land in a seeded game at that
 * phase (you + three bots), `?create=1` for an empty lobby, or `?join=CODE`
 * to join one — add `&name=…` to pick a name. Handy for screenshots and for
 * driving simulators from the command line.
 */
function useDemoLink() {
  const { demo, place, join, create, name } = useLocalSearchParams<{ demo?: Phase; place?: string; join?: string; create?: string; name?: string }>();
  const { me, setName, state, createLobby, joinLobby, dev } = useSession();
  const started = useRef(false);
  const seeded = useRef(false);

  useEffect(() => {
    if (started.current || !me.id || (!demo && !join && !create)) return;
    started.current = true;
    if (name || !me.name) setName(name ?? "Ryan");
    // Let the name land before introducing ourselves to the server.
    setTimeout(() => void (join ? joinLobby(join) : createLobby()), 50);
  }, [me.id, demo, join, create]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!demo || seeded.current || state?.phase !== "lobby") return;
    seeded.current = true;
    dev({ op: "seed", phase: demo, placeQuest: place === "1" });
  }, [state?.phase]); // eslint-disable-line react-hooks/exhaustive-deps
}
