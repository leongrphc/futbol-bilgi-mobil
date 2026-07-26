import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import { registerPushToken, unregisterPushToken } from "./api";

const PUSH_TOKEN_KEY = "football-link:expo-push-token";
const PUSH_OPT_IN_KEY = "football-link:push-opt-in";

export type PushRegistrationResult = "ENABLED" | "DENIED" | "UNAVAILABLE";

async function projectId(): Promise<string | null> {
  return Constants.expoConfig?.extra?.eas?.projectId
    ?? Constants.easConfig?.projectId
    ?? null;
}

async function configureAndroidChannel(): Promise<void> {
  if (Platform.OS !== "android") return;
  await Notifications.setNotificationChannelAsync("social", {
    name: "Arkadaşlar ve maç davetleri",
    importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 250, 180, 250],
    lightColor: "#59D5A6",
    sound: "default",
  });
}

async function obtainAndRegisterToken(locale: "tr" | "en", requestPermission: boolean): Promise<PushRegistrationResult> {
  if (Platform.OS === "web" || !Device.isDevice) return "UNAVAILABLE";
  await configureAndroidChannel();

  let permissions = await Notifications.getPermissionsAsync();
  if (permissions.status !== "granted" && requestPermission) permissions = await Notifications.requestPermissionsAsync();
  if (permissions.status !== "granted") return "DENIED";

  const easProjectId = await projectId();
  if (!easProjectId) return "UNAVAILABLE";
  const token = (await Notifications.getExpoPushTokenAsync({ projectId: easProjectId })).data;
  await registerPushToken(token, Platform.OS === "ios" ? "IOS" : "ANDROID", locale);
  await AsyncStorage.multiSet([[PUSH_TOKEN_KEY, token], [PUSH_OPT_IN_KEY, "1"]]);
  return "ENABLED";
}

export async function enablePushNotifications(locale: "tr" | "en"): Promise<PushRegistrationResult> {
  try {
    return await obtainAndRegisterToken(locale, true);
  } catch {
    return "UNAVAILABLE";
  }
}

export async function refreshPushRegistration(locale: "tr" | "en"): Promise<void> {
  if (await AsyncStorage.getItem(PUSH_OPT_IN_KEY) !== "1") return;
  await obtainAndRegisterToken(locale, false);
}

export async function isPushEnabled(): Promise<boolean> {
  return await AsyncStorage.getItem(PUSH_OPT_IN_KEY) === "1";
}

export async function unregisterCurrentPushToken(): Promise<void> {
  const token = await AsyncStorage.getItem(PUSH_TOKEN_KEY);
  if (token) await unregisterPushToken(token);
  await AsyncStorage.multiRemove([PUSH_TOKEN_KEY, PUSH_OPT_IN_KEY]);
}
