// Expo Push Notifications registration and foreground handling for Android (zero-cost)
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { db } from '../firebaseConfig';
import { doc, setDoc, serverTimestamp, arrayUnion } from 'firebase/firestore';

// Show notifications even when the app is in the foreground
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

// Ensure Android notification channel exists (required for Android 8+)
async function ensureAndroidChannel() {
  if (Device.osName !== 'Android') return;
  await Notifications.setNotificationChannelAsync('default', {
    name: 'Default',
    importance: Notifications.AndroidImportance.HIGH,
    sound: 'default',
    vibrationPattern: [0, 250, 250, 250],
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
  });
}

export async function registerForPushNotifications(currentUserUid) {
  try {
    if (!currentUserUid) return;

    // Skip remote push setup in Expo Go on Android (SDK 53+)
    if (Platform.OS === 'android' && Constants?.appOwnership === 'expo') {
      return;
    }

    await ensureAndroidChannel();

    // Only real devices can get push tokens
    if (!Device.isDevice) {
      return;
    }

    // Request permissions
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;
    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }
    if (finalStatus !== 'granted') {
      return;
    }

    // Determine projectId for SDK 53+
    const projectId =
      Constants?.easConfig?.projectId ||
      Constants?.expoConfig?.extra?.eas?.projectId ||
      process.env.EXPO_PROJECT_ID ||
      undefined;

    // Fetch Expo push token
    const { data: expoPushToken } = await Notifications.getExpoPushTokenAsync(
      projectId ? { projectId } : undefined
    );

    if (!expoPushToken) return;

    // Store token in Firestore under users/{uid}.expoPushTokens (array) using Web SDK
    await setDoc(
      doc(db, 'users', currentUserUid),
      {
        expoPushTokens: arrayUnion(expoPushToken),
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );
  } catch (e) {
    // Swallow errors to avoid crashing app; consider adding logging
  }
}