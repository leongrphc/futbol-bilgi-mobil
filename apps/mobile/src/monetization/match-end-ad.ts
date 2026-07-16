import Constants, { ExecutionEnvironment } from "expo-constants";
import { Platform } from "react-native";
import { getMonetizationStatus } from "./entitlements";

let loaded = false;
let loading: Promise<void> | null = null;
let ad: import("react-native-google-mobile-ads").InterstitialAd | null = null;
let unsubscribers: (() => void)[] = [];

const nativeAdsAvailable =
  Platform.OS !== "web" &&
  Constants.executionEnvironment !== ExecutionEnvironment.StoreClient;

function clearListeners() {
  unsubscribers.forEach(unsubscribe => unsubscribe());
  unsubscribers = [];
}

export async function preloadMatchEndAd(): Promise<void> {
  if (!nativeAdsAvailable || loaded || loading) return loading ?? Promise.resolve();
  loading = (async () => {
    const status = await getMonetizationStatus();
    if (status.adsRemoved) return;

    const ads = await import("react-native-google-mobile-ads");
    await ads.default().setRequestConfiguration({
      maxAdContentRating: ads.MaxAdContentRating.PG,
      testDeviceIdentifiers: ["EMULATOR"],
    });
    await ads.default().initialize();

    clearListeners();
    ad = ads.InterstitialAd.createForAdRequest(ads.TestIds.INTERSTITIAL, {
      requestNonPersonalizedAdsOnly: true,
    });
    unsubscribers.push(
      ad.addAdEventListener(ads.AdEventType.LOADED, () => { loaded = true; }),
      ad.addAdEventListener(ads.AdEventType.ERROR, () => { loaded = false; }),
      ad.addAdEventListener(ads.AdEventType.CLOSED, () => { loaded = false; }),
    );
    ad.load();
  })().catch(() => {
    loaded = false;
    ad = null;
  }).finally(() => {
    loading = null;
  });
  return loading;
}

export async function showMatchEndAd(): Promise<"shown" | "skipped"> {
  const status = await getMonetizationStatus();
  if (status.adsRemoved) return "skipped";
  await preloadMatchEndAd();
  if (!loaded || !ad) return "skipped";
  try {
    await ad.show();
    return "shown";
  } catch {
    loaded = false;
    return "skipped";
  }
}
