import { Audio, type AVPlaybackSource, type AVPlaybackStatus } from "expo-av";
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

const sfxModules: Record<SfxId, number> = {
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

const sfxSounds = new Map<SfxId, Audio.Sound>();
let lobbySound: Audio.Sound | null = null;
let suddenDeathBedSound: Audio.Sound | null = null;
let configured = false;
let lobbyWanted = false;
let suddenDeathBedWanted = false;
let lobbyPositionMs = 0;

/** Serialize every native audio call — Android throws "Player does not exist" on races. */
let queue: Promise<void> = Promise.resolve();
function runExclusive<T>(fn: () => Promise<T>): Promise<T> {
  const next = queue.then(fn, fn);
  queue = next.then(
    () => undefined,
    () => undefined,
  );
  return next;
}

function warn(message: string, error?: unknown) {
  console.warn(`[audio] ${message}`, error ?? "");
}

function isMissingPlayerError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? "");
  return /player does not exist/i.test(message);
}

async function safeUnload(sound: Audio.Sound | null | undefined) {
  if (!sound) return;
  try {
    await sound.unloadAsync();
  } catch {
    // already gone
  }
}

async function ensureConfigured() {
  if (configured) return;
  try {
    await Audio.setAudioModeAsync({
      allowsRecordingIOS: false,
      playsInSilentModeIOS: false,
      playThroughEarpieceAndroid: false,
      staysActiveInBackground: false,
      shouldDuckAndroid: true,
      interruptionModeIOS: 1,
      interruptionModeAndroid: 1,
    });
    configured = true;
  } catch (error) {
    warn("Audio.setAudioModeAsync failed", error);
  }
}

async function createSound(
  source: AVPlaybackSource,
  opts: { loop?: boolean; volume?: number } = {},
): Promise<Audio.Sound> {
  const { sound } = await Audio.Sound.createAsync(
    source,
    {
      shouldPlay: false,
      isLooping: !!opts.loop,
      volume: opts.volume ?? 1,
      progressUpdateIntervalMillis: 500,
    },
    undefined,
    true,
  );
  return sound;
}

async function getStatus(sound: Audio.Sound): Promise<AVPlaybackStatus | null> {
  try {
    return await sound.getStatusAsync();
  } catch (error) {
    if (isMissingPlayerError(error)) return null;
    throw error;
  }
}

async function playFrom(
  sound: Audio.Sound,
  positionMs: number | null,
): Promise<void> {
  if (positionMs != null) {
    try {
      await sound.setPositionAsync(Math.max(0, positionMs));
    } catch {
      // ignore seek failures and still try play
    }
  }
  await sound.playAsync();
}

async function ensureSfx(id: SfxId): Promise<Audio.Sound> {
  const existing = sfxSounds.get(id);
  if (existing) {
    const status = await getStatus(existing);
    if (status?.isLoaded) return existing;
    await safeUnload(existing);
    sfxSounds.delete(id);
  }
  const sound = await createSound(sfxModules[id], { volume: 1 });
  sfxSounds.set(id, sound);
  return sound;
}

async function ensureLobbySound(): Promise<Audio.Sound> {
  if (lobbySound) {
    const status = await getStatus(lobbySound);
    if (status?.isLoaded) return lobbySound;
    await safeUnload(lobbySound);
    lobbySound = null;
  }
  lobbySound = await createSound(lobbyModule, { loop: true, volume: 0.75 });
  return lobbySound;
}

async function ensureSuddenDeathBedSound(): Promise<Audio.Sound> {
  if (suddenDeathBedSound) {
    const status = await getStatus(suddenDeathBedSound);
    if (status?.isLoaded) return suddenDeathBedSound;
    await safeUnload(suddenDeathBedSound);
    suddenDeathBedSound = null;
  }
  suddenDeathBedSound = await createSound(suddenDeathBedModule, { loop: true, volume: 0.6 });
  return suddenDeathBedSound;
}

async function replaySfx(id: SfxId) {
  await ensureConfigured();
  try {
    const sound = await ensureSfx(id);
    await playFrom(sound, 0);
  } catch (error) {
    if (isMissingPlayerError(error)) {
      sfxSounds.delete(id);
      try {
        const sound = await ensureSfx(id);
        await playFrom(sound, 0);
        return;
      } catch (retryError) {
        warn(`play sfx failed: ${id}`, retryError);
        return;
      }
    }
    warn(`play sfx failed: ${id}`, error);
  }
}

async function syncLobbyMusic() {
  await loadAudioPrefs();
  await ensureConfigured();
  const enabled = lobbyWanted && getAudioPrefsSync().musicEnabled;

  try {
    if (!enabled) {
      if (!lobbySound) return;
      const status = await getStatus(lobbySound);
      if (status?.isLoaded) {
        lobbyPositionMs = status.positionMillis ?? lobbyPositionMs;
        if (status.isPlaying) await lobbySound.pauseAsync();
      } else {
        await safeUnload(lobbySound);
        lobbySound = null;
      }
      return;
    }

    const sound = await ensureLobbySound();
    const status = await getStatus(sound);
    if (!status?.isLoaded) {
      await safeUnload(sound);
      lobbySound = null;
      const rebuilt = await ensureLobbySound();
      await playFrom(rebuilt, lobbyPositionMs);
      return;
    }
    if (status.isPlaying) return;
    await playFrom(sound, lobbyPositionMs);
  } catch (error) {
    warn("lobby music sync failed", error);
    await safeUnload(lobbySound);
    lobbySound = null;
    if (!(lobbyWanted && getAudioPrefsSync().musicEnabled)) return;
    try {
      const rebuilt = await ensureLobbySound();
      await playFrom(rebuilt, lobbyPositionMs);
    } catch (retryError) {
      warn("lobby music recreate failed", retryError);
    }
  }
}

async function syncSuddenDeathBed() {
  await ensureConfigured();
  const enabled = suddenDeathBedWanted && getAudioPrefsSync().sfxEnabled;

  try {
    if (!enabled) {
      if (!suddenDeathBedSound) return;
      const status = await getStatus(suddenDeathBedSound);
      if (status?.isLoaded) {
        if (status.isPlaying) await suddenDeathBedSound.pauseAsync();
        try {
          await suddenDeathBedSound.setPositionAsync(0);
        } catch {
          // ignore
        }
      } else {
        await safeUnload(suddenDeathBedSound);
        suddenDeathBedSound = null;
      }
      return;
    }

    const sound = await ensureSuddenDeathBedSound();
    const status = await getStatus(sound);
    if (!status?.isLoaded) {
      await safeUnload(sound);
      suddenDeathBedSound = null;
      const rebuilt = await ensureSuddenDeathBedSound();
      await playFrom(rebuilt, 0);
      return;
    }
    if (status.isPlaying) return;
    const fromStart = (status.positionMillis ?? 0) <= 50;
    await playFrom(sound, fromStart ? 0 : null);
  } catch (error) {
    warn("sudden death bed sync failed", error);
    await safeUnload(suddenDeathBedSound);
    suddenDeathBedSound = null;
  }
}

export async function preloadSounds() {
  // Warm audio mode only. Sounds load lazily on first use (avoids Android player races).
  await runExclusive(async () => {
    await loadAudioPrefs();
    await ensureConfigured();
  });
}

export async function playSfx(id: SfxId) {
  if (!getAudioPrefsSync().sfxEnabled) {
    // Prefs may not be loaded yet on cold start.
    await runExclusive(async () => {
      await loadAudioPrefs();
    });
    if (!getAudioPrefsSync().sfxEnabled) return;
  }
  await runExclusive(() => replaySfx(id));
}

export async function startLobbyMusic() {
  lobbyWanted = true;
  await runExclusive(() => syncLobbyMusic());
}

export async function stopLobbyMusic() {
  lobbyWanted = false;
  await runExclusive(async () => {
    if (lobbySound) {
      const status = await getStatus(lobbySound);
      if (status?.isLoaded) lobbyPositionMs = status.positionMillis ?? lobbyPositionMs;
    }
    await syncLobbyMusic();
  });
}

export async function restartLobbyMusic() {
  lobbyWanted = true;
  lobbyPositionMs = 0;
  await runExclusive(() => syncLobbyMusic());
}

export async function startSuddenDeathBed() {
  suddenDeathBedWanted = true;
  await runExclusive(async () => {
    if (suddenDeathBedSound) {
      const status = await getStatus(suddenDeathBedSound);
      if (status?.isLoaded) {
        try {
          await suddenDeathBedSound.setPositionAsync(0);
        } catch {
          // ignore
        }
      }
    }
    await syncSuddenDeathBed();
  });
}

export async function stopSuddenDeathBed() {
  suddenDeathBedWanted = false;
  await runExclusive(() => syncSuddenDeathBed());
}

// Keep prefs changes serialized with the same queue.
subscribeAudioPrefs(() => {
  void runExclusive(async () => {
    await syncLobbyMusic();
    await syncSuddenDeathBed();
  });
});
