import React, { useEffect, useState, useContext } from "react";
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { PaperProvider } from 'react-native-paper';
import 'react-native-gesture-handler';
import { StatusBar, View, ActivityIndicator, ScrollView, Platform, Image, Text as RNText } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import * as SecureStore from 'expo-secure-store';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from "./src/firebaseConfig";
import * as SplashScreen from 'expo-splash-screen';
import * as NavigationBar from 'expo-navigation-bar';
// import messaging from '@react-native-firebase/messaging';
// import notifee, { AndroidImportance } from '@notifee/react-native';

// Keep the native splash screen visible while we load resources/auth
// SplashScreen.preventAutoHideAsync().catch(() => {});

// Screens
import Login from './src/containers/Login/Login';
import AddExpense from './src/containers/Expense/AddExpense';
import GroupDetails from './src/containers/Groups/GroupDetail';
import Signup from './src/containers/Login/SignUp/SignUp';
import CreateGroup from './src/containers/Groups/CreateGroup';
import GroupSettings from './src/containers/Groups/GroupSettings';
// Main tabs are loaded lazily via require in Stack.Screen for faster startup
import { ThemeProvider, ThemeContext } from './src/context/ThemeContext';
import ExpenseDetails from "./src/containers/Expense/ExpenseDetails";
import AllExpenses from "./src/containers/Expense/AllExpenses";
import { registerForPushNotifications } from './src/utils/notifications';

const Stack = createStackNavigator();

export default function App() {
  return (
    <ThemeProvider>
      <AppContent />
    </ThemeProvider>
  );
}

function AppContent() {
  const [isLoggedIn, setIsLoggedIn] = useState('');
  const [currentUser, setCurrentUser] = useState(null);
  const { paperTheme: theme } = useContext(ThemeContext);

  async function getToken() {
    if (Platform.OS === 'web') {
      return "";
    }
    const token = await SecureStore.getItemAsync('userToken');
    return token || "";
  }

  // 🔹 Auth listener
  useEffect(() => {
    let isMounted = true;
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!isMounted) return;

      if (user) {
        try {
          const newToken = await user.getIdToken(true);
          await SecureStore.setItemAsync('userToken', newToken);
          setIsLoggedIn("SignedIn");
          setCurrentUser(user);
        } catch (e) {
          await SecureStore.deleteItemAsync('userToken');
          setIsLoggedIn("SignedOut");
          setCurrentUser(null);
        }
      } else {
        try {
          await SecureStore.deleteItemAsync('userToken');
        } catch {}
        setIsLoggedIn("SignedOut");
        setCurrentUser(null);
      }
    });

    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, []);

  // 🔹 Register device for push notifications (non-blocking)
  useEffect(() => {
    if (currentUser?.uid) {
      const withTimeout = (p, ms = 3000) =>
        Promise.race([p, new Promise((resolve) => setTimeout(resolve, ms))]);
      withTimeout(registerForPushNotifications(currentUser.uid)).catch(() => {});
    }
  }, [currentUser]);

  // 🔹 Handle background messages
  // useEffect(() => {
  //   messaging().setBackgroundMessageHandler(async remoteMessage => {
  //     await notifee.createChannel({
  //       id: 'default',
  //       name: 'Default',
  //       importance: AndroidImportance.HIGH,
  //     });

  //     await notifee.displayNotification({
  //       title: remoteMessage.notification?.title || remoteMessage.data.title,
  //       body: remoteMessage.notification?.body || remoteMessage.data.body,
  //       android: { channelId: 'default' },
  //     });
  //   });
  // }, []);

  // 🔹 Hide native splash once auth state is known
  // useEffect(() => {
  //   if (isLoggedIn !== '') {
  //     SplashScreen.hideAsync().catch(() => {});
  //   }
  // }, [isLoggedIn]);

  // 🔹 Sync Android system navigation bar color with theme to avoid black bar/fab on launch
  useEffect(() => {
    if (Platform.OS === 'android') {
      // Match the tab bar background to the system nav bar
      // Using surface to align with tabBarStyle background
      const bg = theme.colors?.surface || theme.colors?.background;
      const style = theme.dark ? 'light' : 'dark'; // icons color
      NavigationBar.setBackgroundColorAsync("transparent").catch(() => {});
      NavigationBar.setButtonStyleAsync(style).catch(() => {});
      // optional: translucent can cause blending; keep it solid to avoid black
      NavigationBar.setBehaviorAsync('overlay-swipe').catch(() => {});
    }
  }, [theme.dark, theme.colors?.surface, theme.colors?.background]);

  // 🔹 Keep native splash visible while checking auth, but render an in-app splash matching theme
  if (isLoggedIn === '') {
    const bg = theme.colors?.background;
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: bg }}>
        <StatusBar
        backgroundColor={theme.colors.background}
        barStyle={theme.dark ? 'light-content' : 'dark-content'}
        translucent
      />
        <Image
          source={require('./assets/icon.png')}
          style={{ width: 120, height: 120, marginBottom: 16, borderRadius: 20 }}
          resizeMode="contain"
        />
        <RNText style={{ color: theme.colors?.onBackground || theme.colors?.text, fontSize: 22, fontWeight: 700 }}>
          Squad Split
        </RNText>
      </View>
    );
  }

  // 🔹 Main App Navigation
  return (
    <SafeAreaProvider>
      <StatusBar
        backgroundColor={theme.colors.background}
        barStyle={theme.dark ? 'light-content' : 'dark-content'}
        translucent
      />
      <PaperProvider theme={theme}>
        <NavigationContainer theme={theme}>
          <Stack.Navigator
            initialRouteName={isLoggedIn === "SignedIn" ? "Main" : "Login"}
            screenOptions={{ headerShown: false, contentStyle: { paddingTop: 0 }, detachPreviousScreen: true }}
          >
            <Stack.Screen name="Main" component={require('./src/components/Navigator/MainTabNavigator').default} />
            <Stack.Screen name="AddExpense" component={AddExpense} />
            <Stack.Screen name="Group Details" component={GroupDetails} />
            <Stack.Screen name="Breakdown" component={require('./src/containers/Dashboard/BreakdownScreen').default} />
            <Stack.Screen name="Group Settings" component={GroupSettings} />
            <Stack.Screen name="CreateGroup" component={CreateGroup} />
            <Stack.Screen name="ExpenseDetails" component={ExpenseDetails} />
            <Stack.Screen name="Login" component={Login} />
            <Stack.Screen name="SignUp" component={Signup} />
            <Stack.Screen name="AllExpenses" component={AllExpenses} />
          </Stack.Navigator>
        </NavigationContainer>
      </PaperProvider>
    </SafeAreaProvider>
  );
}
