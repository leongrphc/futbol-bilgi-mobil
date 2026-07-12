import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from "expo-audio";
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

// Compact AAC beds — large WAVs timed out on Android before isLoaded.
const lobbySource = require("../../assets/sfx/lobby_loop.m4a");
const suddenDeathBedSource = require("../../assets/sfx/sudden_death_bed.m4a");

const players = new Map<SfxId, AudioPlayer>();
let lobbyPlayer: AudioPlayer | null = null;
let suddenDeathBedPlayer: AudioPlayer | null = null;
let configured = false;
let ready: Promise<void> | null = null;
let lobbyWanted = false;
let suddenDeathBedWanted = false;
let warnedOnce = false;

function warnOnce(message: string, error?: unknown) {
  if (warnedOnce) return;
  warnedOnce = true;
  console.warn(`[audio] ${message}`, error ?? "");
}

function warn(message: string, error?: unknown) {
  console.warn(`[audio] ${message}`, error ?? "");
}

async function ensureConfigured() {
  if (configured) return;
  try {
    await setAudioModeAsync({
      // Respect hardware silent / Android ringer mute (user preference).
      playsInSilentMode: false,
      // Request focus so Android actually routes short UI sounds.
      interruptionMode: "duckOthers",
      shouldPlayInBackground: false,
      allowsRecording: false,
      shouldRouteThroughEarpiece: false,
    });
    configured = true;
  } catch (error) {
    warnOnce("setAudioModeAsync failed — rebuild app if expo-audio native module missing", error);
  }
}

function makePlayer(source: number, loop = false, volume = loop ? 0.55 : 1): AudioPlayer {
  // downloadFirst helps local require() assets resolve to a playable URI on device.
  const player = createAudioPlayer(source, { downloadFirst: true, updateInterval: 1000 });
  player.loop = loop;
  player.volume = volume;
  return player;
}

function playerReady(player: AudioPlayer): boolean {
  // isLoaded can lag on Android; duration/currentTime becoming finite is enough to play.
  if (player.isLoaded) return true;
  if (Number.isFinite(player.duration) && player.duration > 0) return true;
  return false;
}

function waitForLoad(player: AudioPlayer, timeoutMs = 8_000): Promise<boolean> {
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
    }, 50);
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
      if (!lobbyPlayer) lobbyPlayer = makePlayer(lobbySource, true, 0.55);
      if (!suddenDeathBedPlayer) suddenDeathBedPlayer = makePlayer(suddenDeathBedSource, true, 0.48);
    } catch (error) {
      ready = null;
      warnOnce("audio player init failed", error);
      throw error;
    }
  })();
  return ready;
}

async function replay(player: AudioPlayer) {
  const loaded = await waitForLoad(player, 4_000);
  if (!loaded) {
    warn("audio asset still not loaded — check metro asset + native rebuild");
    return;
  }
  try {
    player.pause();
    await player.seekTo(0);
    player.play();
  } catch (error) {
    warn("play failed", error);
  }
}

export async function preloadSounds() {
  try {
    await ensurePlayers();
    // Warm beds in background so first lobby focus is ready on Android.
    if (lobbyPlayer) void waitForLoad(lobbyPlayer, 10_000);
    if (suddenDeathBedPlayer) void waitForLoad(suddenDeathBedPlayer, 10_000);
  } catch {
    // keep UI running without audio
  }
}

export async function playSfx(id: SfxId) {
  try {
    await ensurePlayers();
  } catch {
    return;
  }
  if (!getAudioPrefsSync().sfxEnabled) return;
  const player = players.get(id);
  if (!player) return;
  await replay(player);
}

async function syncLobbyMusic() {
  try {
    await ensurePlayers();
  } catch {
    return;
  }
  if (!lobbyPlayer) return;
  const enabled = lobbyWanted && getAudioPrefsSync().musicEnabled;
  try {
    if (enabled) {
      const loaded = await waitForLoad(lobbyPlayer, 10_000);
      if (!loaded) {
        // Retry path: recreate player once if first load hung on Android.
        try {
          lobbyPlayer.remove();
        } catch {
          // ignore
        }
        lobbyPlayer = makePlayer(lobbySource, true, 0.55);
        const retried = await waitForLoad(lobbyPlayer, 10_000);
        if (!retried) {
          warn("lobby music asset not loaded");
          return;
        }
      }
      // Resume from current position — never force seek(0) on tab return.
      if (!lobbyPlayer.playing) lobbyPlayer.play();
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
    await ensurePlayers();
    if (!lobbyPlayer) return;
    const loaded = await waitForLoad(lobbyPlayer, 10_000);
    if (!loaded) return;
    lobbyPlayer.pause();
    await lobbyPlayer.seekTo(0);
    if (getAudioPrefsSync().musicEnabled) lobbyPlayer.play();
  } catch (error) {
    warn("lobby music restart failed", error);
  }
}

async function syncSuddenDeathBed() {
  try {
    await ensurePlayers();
  } catch {
    return;
  }
  if (!suddenDeathBedPlayer) return;
  // Match atmosphere: follow SFX mute so "match sounds off" also kills the bed.
  const enabled = suddenDeathBedWanted && getAudioPrefsSync().sfxEnabled;
  try {
    if (enabled) {
      const loaded = await waitForLoad(suddenDeathBedPlayer, 10_000);
      if (!loaded) {
        try {
          suddenDeathBedPlayer.remove();
        } catch {
          // ignore
        }
        suddenDeathBedPlayer = makePlayer(suddenDeathBedSource, true, 0.48);
        const retried = await waitForLoad(suddenDeathBedPlayer, 10_000);
        if (!retried) {
          warn("sudden death bed not loaded");
          return;
        }
      }
      if (!suddenDeathBedPlayer.playing) {
        // Fresh SD stretch always from the top once; resume mid-loop if already running.
        if (suddenDeathBedPlayer.currentTime <= 0.05) {
          await suddenDeathBedPlayer.seekTo(0);
        }
        suddenDeathBedPlayer.play();
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
    if (suddenDeathBedPlayer && !suddenDeathBedPlayer.playing) {
      await suddenDeathBedPlayer.seekTo(0);
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
