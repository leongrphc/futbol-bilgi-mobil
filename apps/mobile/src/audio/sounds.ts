import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from "expo-audio";
import { getAudioPrefsSync, loadAudioPrefs, subscribeAudioPrefs } from "./preferences";

export type SfxId = "correct" | "wrong" | "tick" | "sudden_death" | "finish" | "emote";

const sources: Record<SfxId, number> = {
  correct: require("../../assets/sfx/correct.wav"),
  wrong: require("../../assets/sfx/wrong.wav"),
  tick: require("../../assets/sfx/tick.wav"),
  sudden_death: require("../../assets/sfx/sudden_death.wav"),
  finish: require("../../assets/sfx/finish.wav"),
  emote: require("../../assets/sfx/emote.wav"),
};

const lobbySource = require("../../assets/sfx/lobby_loop.wav");

const players = new Map<SfxId, AudioPlayer>();
let lobbyPlayer: AudioPlayer | null = null;
let configured = false;
let ready: Promise<void> | null = null;
let lobbyWanted = false;

async function ensureConfigured() {
  if (configured) return;
  configured = true;
  try {
    await setAudioModeAsync({
      playsInSilentMode: false,
      interruptionMode: "mixWithOthers",
      shouldPlayInBackground: false,
      allowsRecording: false,
      shouldRouteThroughEarpiece: false,
    });
  } catch {
    // audio mode best-effort
  }
}

function makePlayer(source: number, loop = false): AudioPlayer {
  const player = createAudioPlayer(source);
  player.loop = loop;
  player.volume = loop ? 0.22 : 0.85;
  return player;
}

async function ensurePlayers() {
  if (ready) return ready;
  ready = (async () => {
    await loadAudioPrefs();
    await ensureConfigured();
    for (const id of Object.keys(sources) as SfxId[]) {
      if (!players.has(id)) players.set(id, makePlayer(sources[id]));
    }
    if (!lobbyPlayer) lobbyPlayer = makePlayer(lobbySource, true);
  })();
  return ready;
}

async function replay(player: AudioPlayer) {
  try {
    player.pause();
    await player.seekTo(0);
    player.play();
  } catch {
    // ignore transient audio errors
  }
}

export async function preloadSounds() {
  await ensurePlayers();
}

export async function playSfx(id: SfxId) {
  await ensurePlayers();
  if (!getAudioPrefsSync().sfxEnabled) return;
  const player = players.get(id);
  if (!player) return;
  await replay(player);
}

async function syncLobbyMusic() {
  await ensurePlayers();
  if (!lobbyPlayer) return;
  const enabled = lobbyWanted && getAudioPrefsSync().musicEnabled;
  try {
    if (enabled) {
      if (!lobbyPlayer.playing) {
        await lobbyPlayer.seekTo(0);
        lobbyPlayer.play();
      }
    } else if (lobbyPlayer.playing) {
      lobbyPlayer.pause();
    }
  } catch {
    // ignore
  }
}

export async function startLobbyMusic() {
  lobbyWanted = true;
  await syncLobbyMusic();
}

export async function stopLobbyMusic() {
  lobbyWanted = false;
  await syncLobbyMusic();
}

subscribeAudioPrefs(() => {
  void syncLobbyMusic();
});
