import { Platform } from "react-native";
import { Audio, type AVPlaybackSource } from "expo-av";
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
let ready: Promise<void> | null = null;
let lobbyWanted = false;
let suddenDeathBedWanted = false;
let lobbyPositionMs = 0;

function warn(message: string, error?: unknown) {
  console.warn(`[audio] ${message}`, error ?? "");
}

async function ensureConfigured() {
  if (configured) return;
  try {
    // expo-av is reliable on Android Expo Go; expo-audio was silent there.
    await Audio.setAudioModeAsync({
      allowsRecordingIOS: false,
      playsInSilentModeIOS: false,
      playThroughEarpieceAndroid: false,
      staysActiveInBackground: false,
      shouldDuckAndroid: true,
      interruptionModeIOS: 1, // DuckOthers
      interruptionModeAndroid: 1, // DuckOthers
    });
    configured = true;
  } catch (error) {
    warn("Audio.setAudioModeAsync failed", error);
  }
}

async function loadSound(
  source: AVPlaybackSource,
  opts: { loop?: boolean; volume?: number } = {},
): Promise<Audio.Sound> {
  const { sound } = await Audio.Sound.createAsync(
    source,
    {
      shouldPlay: false,
      isLooping: opts.loop ?? false,
      volume: opts.volume ?? 1,
      progressUpdateIntervalMillis: 500,
    },
    undefined,
    true,
  );
  return sound;
}

async function ensurePlayers() {
  if (ready) return ready;
  ready = (async () => {
    try {
      await loadAudioPrefs();
      await ensureConfigured();

      await Promise.all(
        (Object.keys(sfxModules) as SfxId[]).map(async id => {
          if (sfxSounds.has(id)) return;
          try {
            const sound = await loadSound(sfxModules[id], { volume: 1 });
            sfxSounds.set(id, sound);
          } catch (error) {
            warn(`load sfx failed: ${id}`, error);
          }
        }),
      );

      if (!lobbySound) {
        try {
          lobbySound = await loadSound(lobbyModule, { loop: true, volume: 0.75 });
        } catch (error) {
          warn("load lobby music failed", error);
        }
      }

      if (!suddenDeathBedSound) {
        try {
          suddenDeathBedSound = await loadSound(suddenDeathBedModule, { loop: true, volume: 0.6 });
        } catch (error) {
          warn("load sudden death bed failed", error);
        }
      }
    } catch (error) {
      ready = null;
      warn("audio init failed", error);
      throw error;
    }
  })();
  return ready;
}

async function replaySfx(id: SfxId) {
  let sound = sfxSounds.get(id);
  if (!sound) {
    try {
      sound = await loadSound(sfxModules[id], { volume: 1 });
      sfxSounds.set(id, sound);
    } catch (error) {
      warn(`create sfx failed: ${id}`, error);
      return;
    }
  }
  try {
    const status = await sound.getStatusAsync();
    if (!status.isLoaded) {
      await sound.loadAsync(sfxModules[id], { shouldPlay: false, volume: 1 }, true);
    }
    await sound.setPositionAsync(0);
    await sound.playAsync();
  } catch (error) {
    // Recreate once — Android Expo Go can drop native handles after reload.
    try {
      await sound.unloadAsync();
    } catch {
      // ignore
    }
    try {
      const next = await loadSound(sfxModules[id], { volume: 1 });
      sfxSounds.set(id, next);
      await next.playAsync();
    } catch (retryError) {
      warn(`play sfx failed: ${id}`, retryError);
    }
  }
}

export async function preloadSounds() {
  try {
    await ensurePlayers();
  } catch {
    // UI continues without audio
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
  await replaySfx(id);
}

async function syncLobbyMusic() {
  try {
    await ensureConfigured();
    await ensurePlayers();
  } catch {
    return;
  }
  if (!lobbySound) return;
  const enabled = lobbyWanted && getAudioPrefsSync().musicEnabled;
  try {
    const status = await lobbySound.getStatusAsync();
    if (enabled) {
      if (!status.isLoaded) {
        await lobbySound.loadAsync(lobbyModule, { shouldPlay: false, isLooping: true, volume: 0.75 }, true);
      }
      // Resume mid-track when returning from match; keep position across tabs.
      if (status.isLoaded && !status.isPlaying) {
        const pos = Math.max(0, lobbyPositionMs);
        try {
          await lobbySound.setPositionAsync(pos);
        } catch {
          // ignore seek errors
        }
        await lobbySound.playAsync();
      } else if (status.isLoaded && status.isPlaying) {
        // already going
      } else {
        await lobbySound.playAsync();
      }
    } else if (status.isLoaded && status.isPlaying) {
      lobbyPositionMs = status.positionMillis ?? lobbyPositionMs;
      await lobbySound.pauseAsync();
    } else if (status.isLoaded) {
      lobbyPositionMs = status.positionMillis ?? lobbyPositionMs;
    }
  } catch (error) {
    warn("lobby music sync failed", error);
    try {
      await lobbySound?.unloadAsync();
    } catch {
      // ignore
    }
    try {
      lobbySound = await loadSound(lobbyModule, { loop: true, volume: 0.75 });
      if (lobbyWanted && getAudioPrefsSync().musicEnabled) {
        await lobbySound.setPositionAsync(Math.max(0, lobbyPositionMs));
        await lobbySound.playAsync();
      }
    } catch (retryError) {
      warn("lobby music recreate failed", retryError);
    }
  }
}

export async function startLobbyMusic() {
  lobbyWanted = true;
  await syncLobbyMusic();
}

export async function stopLobbyMusic() {
  lobbyWanted = false;
  // Capture position before pause so match return can resume.
  try {
    if (lobbySound) {
      const status = await lobbySound.getStatusAsync();
      if (status.isLoaded) lobbyPositionMs = status.positionMillis ?? lobbyPositionMs;
    }
  } catch {
    // ignore
  }
  await syncLobbyMusic();
}

export async function restartLobbyMusic() {
  lobbyWanted = true;
  lobbyPositionMs = 0;
  try {
    await ensureConfigured();
    await ensurePlayers();
    if (!lobbySound) return;
    await lobbySound.setPositionAsync(0);
    if (getAudioPrefsSync().musicEnabled) await lobbySound.playAsync();
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
  if (!suddenDeathBedSound) return;
  const enabled = suddenDeathBedWanted && getAudioPrefsSync().sfxEnabled;
  try {
    const status = await suddenDeathBedSound.getStatusAsync();
    if (enabled) {
      if (!status.isLoaded) {
        await suddenDeathBedSound.loadAsync(
          suddenDeathBedModule,
          { shouldPlay: false, isLooping: true, volume: 0.6 },
          true,
        );
      }
      if (status.isLoaded && (status.positionMillis ?? 0) <= 50) {
        await suddenDeathBedSound.setPositionAsync(0);
      }
      if (!(status.isLoaded && status.isPlaying)) {
        await suddenDeathBedSound.playAsync();
      }
    } else if (status.isLoaded && status.isPlaying) {
      await suddenDeathBedSound.pauseAsync();
    }
  } catch (error) {
    warn("sudden death bed sync failed", error);
  }
}

export async function startSuddenDeathBed() {
  suddenDeathBedWanted = true;
  try {
    await ensurePlayers();
    if (suddenDeathBedSound) {
      try {
        await suddenDeathBedSound.setPositionAsync(0);
      } catch {
        // ignore
      }
    }
  } catch {
    // ignore
  }
  await syncSuddenDeathBed();
}

export async function stopSuddenDeathBed() {
  suddenDeathBedWanted = false;
  try {
    await ensurePlayers();
    if (suddenDeathBedSound) {
      const status = await suddenDeathBedSound.getStatusAsync();
      if (status.isLoaded) {
        await suddenDeathBedSound.pauseAsync();
        await suddenDeathBedSound.setPositionAsync(0);
      }
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

// Avoid unused Platform warning if tree-shaken oddly in some builds.
void Platform.OS;
