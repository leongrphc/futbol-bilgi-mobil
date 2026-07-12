import { Platform } from "react-native";
import {
  createAudioPlayer,
  setAudioModeAsync,
  setIsAudioActiveAsync,
  type AudioPlayer,
} from "expo-audio";
import { getAudioPrefsSync, loadAudioPrefs, subscribeAudioPrefs } from "./preferences";

export type SfxId =
  | "correct"
  | "wrong"
  | "tick"
  | "sudden_death"
  | "finish_win"
  | "finish_loss"
  | "emote"
  | "tab"
  | "whistle"
  | "match_found"
  | "lock";

const sources: Record<SfxId, number> = {
  correct: require("../../assets/sfx/correct.wav"),
  wrong: require("../../assets/sfx/wrong.wav"),
  tick: require("../../assets/sfx/tick.wav"),
  sudden_death: require("../../assets/sfx/sudden_death.wav"),
  finish_win: require("../../assets/sfx/finish_win.wav"),
  finish_loss: require("../../assets/sfx/finish_loss.wav"),
  emote: require("../../assets/sfx/emote.wav"),
  tab: require("../../assets/sfx/tab.wav"),
  whistle: require("../../assets/sfx/whistle.wav"),
  match_found: require("../../assets/sfx/match_found.wav"),
  lock: require("../../assets/sfx/lock.wav"),
};

// Compact AAC beds — large WAVs were slow to stage on Android.
const lobbySource = require("../../assets/sfx/lobby_loop.m4a");
const suddenDeathBedSource = require("../../assets/sfx/sudden_death_bed.m4a");

const players = new Map<SfxId, AudioPlayer>();
let lobbyPlayer: AudioPlayer | null = null;
let suddenDeathBedPlayer: AudioPlayer | null = null;
let configured = false;
let ready: Promise<void> | null = null;
let lobbyWanted = false;
let suddenDeathBedWanted = false;

function warn(message: string, error?: unknown) {
  console.warn(`[audio] ${message}`, error ?? "");
}

async function ensureConfigured() {
  if (configured) return;
  try {
    await setIsAudioActiveAsync(true);
    await setAudioModeAsync({
      // iOS: honor hardware silent switch (user preference).
      // Android: false also mutes when ringer is vibrate — games should still play media.
      playsInSilentMode: Platform.OS !== "ios" ? true : false,
      // Short SFX + beds should mix; exclusive focus can fail silently on some OEMs.
      interruptionMode: "mixWithOthers",
      shouldPlayInBackground: false,
      allowsRecording: false,
      shouldRouteThroughEarpiece: false,
    });
    configured = true;
  } catch (error) {
    warn("setAudioModeAsync failed — rebuild if expo-audio native module missing", error);
  }
}

function makePlayer(source: number, loop = false, volume = loop ? 0.7 : 1): AudioPlayer {
  // Local bundled assets: resolve synchronously. downloadFirst starts with null source
  // and races the first play() on Android.
  const player = createAudioPlayer(source, {
    downloadFirst: false,
    updateInterval: 1000,
    keepAudioSessionActive: true,
  });
  player.loop = loop;
  player.volume = volume;
  player.muted = false;
  return player;
}

function playerReady(player: AudioPlayer): boolean {
  if (player.isLoaded) return true;
  if (Number.isFinite(player.duration) && player.duration > 0) return true;
  return false;
}

function waitForLoad(player: AudioPlayer, timeoutMs = 6_000): Promise<boolean> {
  if (playerReady(player)) return Promise.resolve(true);
  return new Promise(resolve => {
    const started = Date.now();
    const timer = setInterval(() => {
      if (playerReady(player)) {
        clearInterval(timer);
        resolve(true);
        return;
      }
      if (Date.now() - started >= timeoutMs) {
        clearInterval(timer);
        resolve(false);
      }
    }, 40);
  });
}

async function ensurePlayers() {
  if (ready) return ready;
  ready = (async () => {
    try {
      await loadAudioPrefs();
      await ensureConfigured();
      for (const id of Object.keys(sources) as SfxId[]) {
        if (!players.has(id)) players.set(id, makePlayer(sources[id]));
      }
      if (!lobbyPlayer) lobbyPlayer = makePlayer(lobbySource, true, 0.7);
      if (!suddenDeathBedPlayer) suddenDeathBedPlayer = makePlayer(suddenDeathBedSource, true, 0.55);
    } catch (error) {
      ready = null;
      warn("audio player init failed", error);
      throw error;
    }
  })();
  return ready;
}

async function forcePlay(player: AudioPlayer, fromStart: boolean) {
  const loaded = await waitForLoad(player, 6_000);
  if (!loaded) return false;
  try {
    player.muted = false;
    if (fromStart) {
      player.pause();
      await player.seekTo(0);
    }
    player.play();
    return true;
  } catch (error) {
    warn("play failed", error);
    return false;
  }
}

async function recreateAndPlay(
  current: AudioPlayer | null,
  source: number,
  loop: boolean,
  volume: number,
  fromStart: boolean,
): Promise<AudioPlayer | null> {
  if (current) {
    try {
      current.pause();
      current.remove();
    } catch {
      // ignore
    }
  }
  const next = makePlayer(source, loop, volume);
  const ok = await forcePlay(next, fromStart);
  if (!ok) {
    try {
      next.remove();
    } catch {
      // ignore
    }
    return null;
  }
  return next;
}

export async function preloadSounds() {
  try {
    await ensurePlayers();
    if (lobbyPlayer) void waitForLoad(lobbyPlayer, 8_000);
    if (suddenDeathBedPlayer) void waitForLoad(suddenDeathBedPlayer, 8_000);
  } catch {
    // keep UI running without audio
  }
}

export async function playSfx(id: SfxId) {
  try {
    await ensureConfigured();
    await ensurePlayers();
  } catch {
    return;
  }
  if (!getAudioPrefsSync().sfxEnabled) return;
  let player = players.get(id);
  if (!player) return;
  const ok = await forcePlay(player, true);
  if (!ok) {
    const rebuilt = await recreateAndPlay(player, sources[id], false, 1, true);
    if (rebuilt) players.set(id, rebuilt);
  }
}

async function syncLobbyMusic() {
  try {
    await ensureConfigured();
    await ensurePlayers();
  } catch {
    return;
  }
  if (!lobbyPlayer) return;
  const enabled = lobbyWanted && getAudioPrefsSync().musicEnabled;
  try {
    if (enabled) {
      const ok = await forcePlay(lobbyPlayer, false);
      if (!ok) {
        lobbyPlayer = await recreateAndPlay(lobbyPlayer, lobbySource, true, 0.7, true);
        if (!lobbyPlayer) warn("lobby music failed to start on Android/iOS");
      }
    } else if (lobbyPlayer.playing) {
      lobbyPlayer.pause();
    }
  } catch (error) {
    warn("lobby music sync failed", error);
  }
}

/** Keep bed playing across tabs; call once from tabs shell. */
export async function startLobbyMusic() {
  lobbyWanted = true;
  await syncLobbyMusic();
}

/** Pause bed (match / leave tabs). Position kept for resume. */
export async function stopLobbyMusic() {
  lobbyWanted = false;
  await syncLobbyMusic();
}

/** Hard restart from 0 — only if user explicitly restarts music later. */
export async function restartLobbyMusic() {
  lobbyWanted = true;
  try {
    await ensureConfigured();
    await ensurePlayers();
    if (!lobbyPlayer) return;
    const ok = await forcePlay(lobbyPlayer, true);
    if (!ok) {
      lobbyPlayer = await recreateAndPlay(lobbyPlayer, lobbySource, true, 0.7, true);
    }
  } catch (error) {
    warn("lobby music restart failed", error);
  }
}

async function syncSuddenDeathBed() {
  try {
    await ensureConfigured();
    await ensurePlayers();
  } catch {
    return;
  }
  if (!suddenDeathBedPlayer) return;
  const enabled = suddenDeathBedWanted && getAudioPrefsSync().sfxEnabled;
  try {
    if (enabled) {
      const fromStart = suddenDeathBedPlayer.currentTime <= 0.05;
      const ok = await forcePlay(suddenDeathBedPlayer, fromStart);
      if (!ok) {
        suddenDeathBedPlayer = await recreateAndPlay(
          suddenDeathBedPlayer,
          suddenDeathBedSource,
          true,
          0.55,
          true,
        );
        if (!suddenDeathBedPlayer) warn("sudden death bed failed to start");
      }
    } else if (suddenDeathBedPlayer.playing) {
      suddenDeathBedPlayer.pause();
    }
  } catch (error) {
    warn("sudden death bed sync failed", error);
  }
}

/** Loop Mysterious bass pulse for the whole sudden-death stretch. */
export async function startSuddenDeathBed() {
  suddenDeathBedWanted = true;
  try {
    await ensurePlayers();
    if (suddenDeathBedPlayer) {
      await forcePlay(suddenDeathBedPlayer, true);
    }
  } catch {
    // ensurePlayers already warned
  }
  await syncSuddenDeathBed();
}

export async function stopSuddenDeathBed() {
  suddenDeathBedWanted = false;
  try {
    await ensurePlayers();
    if (suddenDeathBedPlayer) {
      suddenDeathBedPlayer.pause();
      await suddenDeathBedPlayer.seekTo(0);
    }
  } catch {
    // ignore
  }
  await syncSuddenDeathBed();
}

subscribeAudioPrefs(() => {
  void syncLobbyMusic();
  void syncSuddenDeathBed();
});
