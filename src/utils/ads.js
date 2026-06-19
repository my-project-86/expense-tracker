// src/utils/ads.js
// Rewarded ads via expo-ads-admob. Requires a dev build or prebuilt Android app (won't work in Expo Go).
// import { AdMobRewarded, setTestDeviceIDAsync } from 'expo-ads-admob';

let initialized = false;

// export async function initMobileAdsIfAvailable() {
//   try {
//     if (!initialized) {
//       // Optional: mark this device as test
//       await setTestDeviceIDAsync('EMULATOR');
//       initialized = true;
//     }
//     return true;
//   } catch {
//     return false;
//   }
// }

// Shows rewarded ad. Returns { shown: boolean, rewarded: boolean }
// export async function showRewardedAd({ adUnitId } = {}) {
//   const unitId = adUnitId || 'ca-app-pub-3940256099942544/5224354917'; // Test rewarded unit ID
//   try {
//     await AdMobRewarded.setAdUnitID(unitId);
//   } catch {}

//   return new Promise(async (resolve) => {
//     let resolved = false;

//     const cleanup = () => {
//       try { AdMobRewarded.removeAllListeners?.(); } catch {}
//     };

//     const onReward = () => {
//       if (!resolved) {
//         resolved = true;
//         cleanup();
//         resolve({ shown: true, rewarded: true });
//       }
//     };

//     const onAdClosed = () => {
//       if (!resolved) {
//         resolved = true;
//         cleanup();
//         resolve({ shown: true, rewarded: false });
//       }
//     };

//     const onError = () => {
//       if (!resolved) {
//         resolved = true;
//         cleanup();
//         resolve({ shown: false, rewarded: false });
//       }
//     };

//     try {
//       AdMobRewarded.addEventListener('rewardedVideoUserDidEarnReward', onReward);
//       AdMobRewarded.addEventListener('rewardedVideoDidClose', onAdClosed);
//       AdMobRewarded.addEventListener('rewardedVideoDidFailToLoad', onError);
//       AdMobRewarded.addEventListener('rewardedVideoDidFailToPresent', onError);

//       await AdMobRewarded.requestAdAsync({ servePersonalizedAds: true });
//       await AdMobRewarded.showAdAsync();
//     } catch {
//       onError();
//     }
//   });
// }