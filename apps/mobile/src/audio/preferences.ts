import AsyncStorage from "@react-native-async-storage/async-storage";

const SFX_KEY = "football-link:sfx-enabled-v1";
const MUSIC_KEY = "football-link:music-enabled-v1";

export type AudioPrefs = {
  sfxEnabled: boolean;
  musicEnabled: boolean;
};

const listeners = new Set<(prefs: AudioPrefs) => void>();
let cache: AudioPrefs = { sfxEnabled: true, musicEnabled: true };
let loaded = false;

function notify() {
  for (const listener of listeners) listener(cache);
}

export function getAudioPrefsSync(): AudioPrefs {
  return cache;
}

export async function loadAudioPrefs(): Promise<AudioPrefs> {
  if (loaded) return cache;
  try {
    const [sfx, music] = await Promise.all([
      AsyncStorage.getItem(SFX_KEY),
      AsyncStorage.getItem(MUSIC_KEY),
    ]);
    cache = {
      sfxEnabled: sfx !== "0",
      musicEnabled: music !== "0",
    };
  } catch {
    cache = { sfxEnabled: true, musicEnabled: true };
  }
  loaded = true;
  notify();
  return cache;
}

export async function setSfxEnabled(enabled: boolean): Promise<AudioPrefs> {
  cache = { ...cache, sfxEnabled: enabled };
  loaded = true;
  notify();
  try {
    await AsyncStorage.setItem(SFX_KEY, enabled ? "1" : "0");
  } catch {
    // keep in-memory preference
  }
  return cache;
}

export async function setMusicEnabled(enabled: boolean): Promise<AudioPrefs> {
  cache = { ...cache, musicEnabled: enabled };
  loaded = true;
  notify();
  try {
    await AsyncStorage.setItem(MUSIC_KEY, enabled ? "1" : "0");
  } catch {
    // keep in-memory preference
  }
  return cache;
}

export function subscribeAudioPrefs(listener: (prefs: AudioPrefs) => void): () => void {
  listeners.add(listener);
  listener(cache);
  return () => {
    listeners.delete(listener);
  };
}
