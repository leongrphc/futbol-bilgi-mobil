import { Platform } from "react-native";
import { Asset } from "expo-asset";
import {
  createAudioPlayer,
  setAudioModeAsync,
  setIsAudioActiveAsync,
  type AudioPlayer,
  type AudioSource,
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

const moduleSources: Record<SfxId, number> = {
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

const lobbyModule = require("../../assets/sfx/lobby_loop.m4a");
const suddenDeathBedModule = require("../../assets/sfx/sudden_death_bed.m4a");

const resolved = new Map<string, AudioSource>();
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
      // Android mute/vibrate still needs media playback for games.
      // iOS keeps hardware silent-switch respect.
      playsInSilentMode: Platform.OS === "android",
      interruptionMode: "duckOthers",
      shouldPlayInBackground: false,
      allowsRecording: false,
      shouldRouteThroughEarpiece: false,
    });
    configured = true;
  } catch (error) {
    warn("setAudioModeAsync failed — rebuild if expo-audio native module missing", error);
  }
}

/**
 * Android Expo Go often cannot play Metro `require()` URIs directly.
 * Force expo-asset download so ExoPlayer gets a real local file URI.
 */
async function resolveLocalSource(moduleId: number, key: string): Promise<AudioSource> {
  const cached = resolved.get(key);
  if (cached) return cached;

  const asset = Asset.fromModule(moduleId);
  try {
    if (!asset.localUri) await asset.downloadAsync();
  } catch (error) {
    warn(`asset download failed: ${key}`, error);
  }

  const uri = asset.localUri ?? asset.uri;
  if (!uri) throw new Error(`No URI for audio asset ${key}`);

  // Prefer file:// local path on device; keep assetId as fallback metadata.
  const source: AudioSource = {
    uri,
    assetId: moduleId,
  };
  resolved.set(key, source);
  return source;
}

function makePlayer(source: AudioSource, loop = false, volume = loop ? 0.75 : 1): AudioPlayer {
  const player = createAudioPlayer(source, {
    downloadFirst: false,
    updateInterval: 500,
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
  // Android sometimes reports ready state only after prepare; allow brief play attempt.
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
        // Last chance: try play even if isLoaded never flipped (some Android builds).
        resolve(true);
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

      // Resolve ALL assets to local URIs before creating players (critical on Android Expo Go).
      await Promise.all([
        ...Object.entries(moduleSources).map(async ([id, moduleId]) => {
          const source = await resolveLocalSource(moduleId, id);
          if (!players.has(id as SfxId)) {
            players.set(id as SfxId, makePlayer(source, false, 1));
          }
        }),
        (async () => {
          const source = await resolveLocalSource(lobbyModule, "lobby_loop");
          if (!lobbyPlayer) lobbyPlayer = makePlayer(source, true, 0.75);
        })(),
        (async () => {
          const source = await resolveLocalSource(suddenDeathBedModule, "sudden_death_bed");
          if (!suddenDeathBedPlayer) suddenDeathBedPlayer = makePlayer(source, true, 0.6);
        })(),
      ]);
    } catch (error) {
      ready = null;
      warn("audio player init failed", error);
      throw error;
    }
  })();
  return ready;
}

async function forcePlay(player: AudioPlayer, fromStart: boolean) {
  await waitForLoad(player, 6_000);
  try {
    player.muted = false;
    player.volume = Math.max(player.volume, fromStart ? 1 : player.volume);
    if (fromStart) {
      try {
        player.pause();
      } catch {
        // ignore
      }
      try {
        await player.seekTo(0);
      } catch {
        // some Android builds reject seek before first buffer; continue to play()
      }
    }
    player.play();
    return true;
  } catch (error) {
    warn("play failed", error);
    return false;
  }
}

async function rebuildSfx(id: SfxId): Promise<AudioPlayer | null> {
  const old = players.get(id);
  if (old) {
    try {
      old.pause();
      old.remove();
    } catch {
      // ignore
    }
  }
  try {
    const source = await resolveLocalSource(moduleSources[id], id);
    // bust cache if uri was bad
    resolved.delete(id);
    const fresh = await resolveLocalSource(moduleSources[id], id);
    const player = makePlayer(fresh ?? source, false, 1);
    players.set(id, player);
    const ok = await forcePlay(player, true);
    return ok ? player : null;
  } catch (error) {
    warn(`rebuild sfx failed: ${id}`, error);
    return null;
  }
}

export async function preloadSounds() {
  try {
    await ensurePlayers();
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
  const player = players.get(id);
  if (!player) {
    await rebuildSfx(id);
    return;
  }
  const ok = await forcePlay(player, true);
  if (!ok) await rebuildSfx(id);
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
        try {
          lobbyPlayer.remove();
        } catch {
          // ignore
        }
        resolved.delete("lobby_loop");
        const source = await resolveLocalSource(lobbyModule, "lobby_loop");
        lobbyPlayer = makePlayer(source, true, 0.75);
        await forcePlay(lobbyPlayer, true);
      }
    } else if (lobbyPlayer.playing) {
      lobbyPlayer.pause();
    }
  } catch (error) {
    warn("lobby music sync failed", error);
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

export async function restartLobbyMusic() {
  lobbyWanted = true;
  try {
    await ensureConfigured();
    await ensurePlayers();
    if (!lobbyPlayer) return;
    await forcePlay(lobbyPlayer, true);
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
        try {
          suddenDeathBedPlayer.remove();
        } catch {
          // ignore
        }
        resolved.delete("sudden_death_bed");
        const source = await resolveLocalSource(suddenDeathBedModule, "sudden_death_bed");
        suddenDeathBedPlayer = makePlayer(source, true, 0.6);
        await forcePlay(suddenDeathBedPlayer, true);
      }
    } else if (suddenDeathBedPlayer.playing) {
      suddenDeathBedPlayer.pause();
    }
  } catch (error) {
    warn("sudden death bed sync failed", error);
  }
}

export async function startSuddenDeathBed() {
  suddenDeathBedWanted = true;
  try {
    await ensurePlayers();
    if (suddenDeathBedPlayer) await forcePlay(suddenDeathBedPlayer, true);
  } catch {
    // ignore
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
