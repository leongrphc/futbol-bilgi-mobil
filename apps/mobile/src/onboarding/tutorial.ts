import AsyncStorage from "@react-native-async-storage/async-storage";

const TUTORIAL_KEY = "football-link:tutorial-complete-v1";

export async function isTutorialComplete(): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(TUTORIAL_KEY)) === "1";
  } catch {
    return false;
  }
}

export async function markTutorialComplete(): Promise<void> {
  await AsyncStorage.setItem(TUTORIAL_KEY, "1");
}

export async function resetTutorial(): Promise<void> {
  await AsyncStorage.removeItem(TUTORIAL_KEY);
}
