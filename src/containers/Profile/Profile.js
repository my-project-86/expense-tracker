// src/screens/ProfileScreen.js
import React, { useState, useEffect, useContext } from 'react';
import { View, StyleSheet, ScrollView, Alert, Platform, ActivityIndicator, KeyboardAvoidingView } from 'react-native';
import { Text, useTheme, Card, List, Button, Avatar, Divider, Switch, SegmentedButtons, Modal, Portal, TextInput } from 'react-native-paper'; // Import SegmentedButtons, Modal, Portal, TextInput
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import { useNavigation } from '@react-navigation/native';

// React Hook Form imports
import { useForm } from 'react-hook-form';
import { yupResolver } from '@hookform/resolvers/yup';
import * as yup from 'yup';

// Firebase imports
import { auth, db } from '../../firebaseConfig'; // Ensure correct path to your firebaseConfig.js
import { signOut, updateProfile, updateEmail, updatePassword, EmailAuthProvider, reauthenticateWithCredential } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { updateDoc } from "firebase/firestore";
import * as SecureStore from 'expo-secure-store';

// Import ThemeContext
import { ThemeContext } from '../../context/ThemeContext'; // Ensure correct path to your ThemeContext.js
import CustomTextInput from '../../components/react-hook-form/CustomTextInput'; // Adjust path if needed
import { getUserCoins, ensureUserDoc } from '../../utils/coins';

export default function ProfileScreen() {
  const theme = useTheme();
  const navigation = useNavigation();
  const { themePreference, setThemePreference } = useContext(ThemeContext);

  // State to hold user data
  const [userData, setUserData] = useState(null);
  const [userDataUpdated, setUserDataUpdated] = useState(false); // Track if user data has been updated
  const [loading, setLoading] = useState(true);
  const [isNotificationsEnabled, setIsNotificationsEnabled] = useState(true); // Example setting

  // Modal visibility states
  const [showEditNameModal, setShowEditNameModal] = useState(false);
  const [showChangePasswordModal, setShowChangePasswordModal] = useState(false);
  const [showUpdateEmailModal, setShowUpdateEmailModal] = useState(false);

  // Loading state for form submissions (to disable buttons and show indicators)
  const [formSubmitting, setFormSubmitting] = useState(false);

  const [passwordVisible, setPasswordVisible] = useState(false);
  const [resetPasswordVisible, setResetPasswordVisible] = useState(false);
  const [currentPasswordVisible, setCurrentPasswordVisible] = useState(false);
  const [confirmNewPasswordVisible, setConfirmNewPasswordVisible] = useState(false);

  // Coins and ad modal state
  const [coins, setCoinsState] = useState(0);
  const [showAdModal, setShowAdModal] = useState(false);
  const [adWatching, setAdWatching] = useState(false);

  // Hardcoded mock data for demonstration purposes (fallback if Firebase user data is not found)
  const mockUserData = {
    uid: 'mock_user_id_123',
    displayName: 'Guest User',
    email: 'guest@example.com',
    phoneNumber: 'N/A',
  };

  // --- Firebase User Data Fetching ---
  // This useEffect fetches the current user's profile data from Firebase Auth and Firestore.
  useEffect(() => {
    const fetchUserData = async () => {
      const currentUser = auth?.currentUser; // Get the currently authenticated user
      if (currentUser) {
        try {
          // Ensure coin field exists
          await ensureUserDoc(currentUser.uid);

          // Get basic info directly from Firebase Authentication
          const authDisplayName = currentUser.displayName;
          const authEmail = currentUser.email;
          const authPhoneNumber = currentUser.phoneNumber;

          // Attempt to get additional user details from Cloud Firestore
          const userDocRef = doc(db, 'users', currentUser.uid);
          const userDocSnap = await getDoc(userDocRef);

          if (userDocSnap.exists()) {
            const firestoreData = userDocSnap.data();
            // Combine data from Auth and Firestore
            setUserData({
              uid: currentUser.uid,
              displayName: authDisplayName || firestoreData.displayName || 'User',
              email: authEmail || firestoreData.email || 'N/A',
              phoneNumber: authPhoneNumber || firestoreData.phoneNumber || 'N/A',
            });
            setCoinsState(Number(firestoreData.coins || 0));
          } else {
            // If user document doesn't exist in Firestore, use only Auth data
            setUserData({
              uid: currentUser.uid,
              displayName: authDisplayName || 'User',
              email: authEmail || 'N/A',
              phoneNumber: authPhoneNumber || 'N/A',
            });
            setCoinsState(await getUserCoins(currentUser.uid));
          }
        } catch (error) {
          Alert.alert('Error', 'Failed to load profile data.');
          setUserData(mockUserData); // Fallback to mock data on error
        } finally {
          setLoading(false); // Stop loading regardless of success or failure
        }
      } else {
        // If no user is currently logged in, use mock data
        setUserData(mockUserData);
        setLoading(false);
      }
    };

    fetchUserData(); // Call the fetch function on component mount

    // Set up an authentication state listener to react to login/logout events
    const unsubscribe = auth?.onAuthStateChanged(user => {
      if (!user) {
        // If user logs out, switch to mock data
        setUserData(mockUserData);
        setLoading(false);
      } else if (!userData) {
        // If user logs in and userData is not yet set, refetch
        fetchUserData();
      }
    });

    return unsubscribe; // Clean up the listener when the component unmounts
  }, [auth?.currentUser, userDataUpdated]); // Re-run this effect if the current authenticated user changes

  // --- Logout Handler ---
  const handleLogout = async () => {
    try {
      await signOut(auth); // Sign out from Firebase Authentication
      try { await SecureStore.deleteItemAsync('userToken'); } catch {}
      Alert.alert('Logged Out', 'You have been successfully signed out.');
      navigation.replace('Login'); // Navigate to the Login screen
    } catch (error) {
      Alert.alert("Logout Failed", "Something went wrong while signing out.");
    }
  };

  // --- Logout Confirmation Handler ---
  const confirmLogout = () => {
    Alert.alert(
      'Confirm Logout',
      'Are you sure you want to log out?',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Log Out', style: 'destructive', onPress: () => handleLogout() },
      ],
      { cancelable: true }
    );
  };

  // --- Edit Display Name Form (React Hook Form) ---
  // Define validation schema for the display name form
  const nameSchema = yup.object().shape({
    displayName: yup.string().required('Display name is required').min(3, 'Display name must be at least 3 characters'),
  });

  // Initialize useForm for the display name form
  const {
    control: nameControl,
    handleSubmit: handleNameSubmit,
    reset: resetNameForm // Function to reset the form fields
  } = useForm({
    resolver: yupResolver(nameSchema),
    mode: "onChange", // Apply Yup validation
    defaultValues: {
      displayName: userData?.displayName || '', // Pre-fill with current display name
    },
  });

  // Reset name form defaults when userData changes (e.g., on initial load)
  useEffect(() => {
    if (userData) {
      resetNameForm({ displayName: userData.displayName });
    }
  }, [userData, resetNameForm]); // Depend on userData and resetNameForm

  // Function to handle display name update submission
  const onEditName = async (data) => {
    setFormSubmitting(true); // Set loading state
    try {
      const currentUser = auth.currentUser;
      if (currentUser) {
        // 1. Update Firebase Auth profile
        await updateProfile(currentUser, { displayName: data.displayName });

        // 2. Update Firestore user document
        const userDocRef = doc(db, "users", currentUser.uid);
        await updateDoc(userDocRef, { displayName: data.displayName });
        setUserDataUpdated(!userDataUpdated); // Toggle userDataUpdated to trigger re-fetch if needed
        Alert.alert('Success', 'Display name updated successfully!');
        setShowEditNameModal(false); // Close the modal
      } else {
        Alert.alert('Error', 'No user logged in.');
      }
    } catch (error) {
      Alert.alert('Error', error.message || 'Failed to update display name.');
    } finally {
      setFormSubmitting(false); // Reset loading state
    }
  };

  // --- Change Password Form (React Hook Form) ---
  // Define validation schema for the password change form
  const passwordSchema = yup.object().shape({
    currentPassword: yup.string().required('Current password is required'),
    newPassword: yup.string().required('New password is required').min(6, 'New password must be at least 6 characters'),
    confirmNewPassword: yup.string()
      .oneOf([yup.ref('newPassword'), null], 'Passwords must match') // Validate password confirmation
      .required('Confirm new password is required'),
  });

  // Initialize useForm for the password change form
  const {
    control: passwordControl,
    handleSubmit: handlePasswordSubmit,
    reset: resetPasswordForm
  } = useForm({
    resolver: yupResolver(passwordSchema),
    mode: "onChange",
    defaultValues: {
      currentPassword: '',
      newPassword: '',
      confirmNewPassword: '',
    },
  });

  // Function to handle password change submission
  const onChangePassword = async (data) => {
    setFormSubmitting(true);
    try {
      const currentUser = auth.currentUser;
      if (currentUser && currentUser.email) { // Ensure user and email exist for re-authentication
        // Re-authenticate user with their current password for security
        const credential = EmailAuthProvider.credential(currentUser.email, data.currentPassword);
        await reauthenticateWithCredential(currentUser, credential);

        await updatePassword(currentUser, data.newPassword); // Update password in Firebase Auth
        Alert.alert('Success', 'Password updated successfully!');
        setShowChangePasswordModal(false); // Close modal
        resetPasswordForm(); // Clear form fields
      } else if (!currentUser) {
        Alert.alert('Error', 'No user logged in.');
      } else {
        Alert.alert('Error', 'Email not found for re-authentication. Please try logging in again.');
      }
    } catch (error) {
      let errorMessage = 'Failed to change password.';
      if (error.code === 'auth/wrong-password') {
        errorMessage = 'Incorrect current password.';
      } else if (error.code === 'auth/requires-recent-login') {
        errorMessage = 'Please log in again to change your password.';
      } else if (error.code === 'auth/weak-password') {
        errorMessage = 'New password is too weak.';
      }
      Alert.alert('Error', errorMessage);
    } finally {
      setFormSubmitting(false);
    }
  };

  // --- Update Email Form (React Hook Form) ---
  // Define validation schema for the email update form
  const emailSchema = yup.object().shape({
    newEmail: yup.string().email('Invalid email').required('New email is required'),
    password: yup.string().required('Password is required for verification'),
  });

  // Initialize useForm for the email update form
  const {
    control: emailControl,
    handleSubmit: handleEmailSubmit,
    reset: resetEmailForm
  } = useForm({
    resolver: yupResolver(emailSchema),
    mode: "onChange",
    defaultValues: {
      newEmail: userData?.email || '',
      password: '',
    },
  });

  // Reset email form defaults when userData changes
  useEffect(() => {
    if (userData) {
      resetEmailForm({ newEmail: userData.email, password: '' });
    }
  }, [userData, resetEmailForm]);

  // Function to handle email update submission
  const onUpdateEmail = async (data) => {
    setFormSubmitting(true);
    try {
      const currentUser = auth.currentUser;
      if (currentUser && currentUser.email) {
        // Re-authenticate user with their current password for security
        const credential = EmailAuthProvider.credential(currentUser.email, data.password);
        await reauthenticateWithCredential(currentUser, credential);

        await updateEmail(currentUser, data.newEmail); // Update email in Firebase Auth
        setUserData(prev => ({ ...prev, email: data.newEmail })); // Update local state
        setShowUpdateEmailModal(false); // Close modal
        resetEmailForm(); // Clear form fields
      } else if (!currentUser) {
        Alert.alert('Error', 'No user logged in.');
      } else {
        Alert.alert('Error', 'Current email not found for re-authentication. Please try logging in again.');
      }
    } catch (error) {
      let errorMessage = 'Failed to update email.';
      if (error.code === 'auth/wrong-password') {
        errorMessage = 'Incorrect password for verification.';
      } else if (error.code === 'auth/requires-recent-login') {
        errorMessage = 'Please log in again to update your email.';
      } else if (error.code === 'auth/email-already-in-use') {
        errorMessage = 'This email is already in use by another account.';
      } else if (error.code === 'auth/invalid-email') {
        errorMessage = 'The new email address is invalid.';
      }
      Alert.alert('Error', errorMessage);
    } finally {
      setFormSubmitting(false);
    }
  };


  // --- Loading State Display ---
  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: theme.colors.background }}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
      </View>
    );
  }

  // --- No User Data Fallback (e.g., if mock data also fails or unexpected state) ---
  if (!userData) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: theme.colors.background }]}>
        <Text style={{ color: theme.colors.error }}>An unexpected error occurred. Profile data is unavailable.</Text>
        <Button mode="contained" onPress={() => navigation.replace('Login')} style={{ marginTop: 20 }}>
          Go to Login
        </Button>
      </View>
    );
  }

  // const handleWatchAd = async () => {
  //   let didReward = false;
  //   try {
  //     const { showRewardedAd, initMobileAdsIfAvailable } = await import('../../utils/ads');
  //     const ok = await initMobileAdsIfAvailable();
  //     if (ok) {
  //       const result = await showRewardedAd({});
  //       if (result.rewarded) {
  //         didReward = true;
  //         const newBalance = await addCoins(10);
  //         setCoinsState(newBalance);
  //         Alert.alert('Thank you!', 'You earned 10 coins.');
  //         return;
  //       }
  //       Alert.alert('Ad closed', 'No reward this time.');
  //       return;
  //     }
  //   } catch {}

  //   // Fallback simulation: only reward if user lets timer finish
  //   setShowAdModal(true);
  //   setAdWatching(true);
  //   const start = Date.now();
  //   const minMs = 6000;
  //   setTimeout(async () => {
  //     setAdWatching(false);
  //     setShowAdModal(false);
  //     // Only credit if at least minMs elapsed and not already rewarded via real ads
  //     if (!didReward && Date.now() - start >= minMs - 50) {
  //       try {
  //         const newBalance = await addCoins(10);
  //         setCoinsState(newBalance);
  //         Alert.alert('Thank you!', 'You earned 10 coins.');
  //       } catch (e) {
  //         Alert.alert('Error', 'Failed to credit coins.');
  //       }
  //     }
  //   }, minMs);
  // };

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <ScrollView style={[{ backgroundColor: theme.colors.background, padding: 10, paddingTop: 20 }]} showsVerticalScrollIndicator={false} showsHorizontalScrollIndicator={false}>
        {/* Profile Info Card */}
        <Card style={[styles.card, { backgroundColor: theme.colors.surface, padding: 15 }]}>
          <Card.Content style={[styles.profileInfoContent, { margin: -15, paddingTop: 30 }]}>
            <Avatar.Text
              size={80}
              label={userData.displayName ? userData.displayName.charAt(0).toUpperCase() : 'U'} // Ensure uppercase
              style={{ backgroundColor: theme.colors.avatar }}
              color={theme.colors.onPrimary}
            />
            <View style={styles.profileTextContainer}>
              <Text style={[styles.profileName, { color: theme.colors.text }]}>
                {userData.displayName}
              </Text>
              <Text
                numberOfLines={2}
                ellipsizeMode="tail"
                allowFontScaling={false}
                style={[styles.profileDetail, { color: theme.colors.placeholder }]}>
                {userData.email}
              </Text>
              {userData.phoneNumber !== 'N/A' && (
                <Text style={[styles.profileDetail, { color: theme.colors.placeholder }]}>
                  {userData.phoneNumber}
                </Text>
              )}
            </View>
            <Button
              mode="text"
              onPress={() => {
                resetNameForm({ displayName: userData.displayName }); // Pre-fill form with current name
                setShowEditNameModal(true); // Open the modal
              }}
              labelStyle={{ color: theme.colors.primary }}
            >
              Edit
            </Button>
          </Card.Content>
        </Card>

        {/* Account Settings */}
        <Card style={[styles.card, { backgroundColor: theme.colors.surface }]}>
          <Card.Title
            title="Account Settings"
            titleStyle={[styles.cardSectionTitle, { color: theme.colors.text }]}
            left={(props) => <MaterialCommunityIcons name="account-cog-outline" size={24} color={theme.colors.icon} />}
          />
          <Divider />
          <View style={styles.quickActionButtonContainer}>
            <List.Section>
              <List.Item
                title="Change Password"
                left={(props) => <MaterialCommunityIcons name="lock-reset" size={20} color={theme.colors.icon} />}
                onPress={() => {
                  resetPasswordForm(); // Clear form on open
                  setShowChangePasswordModal(true); // Open the modal
                }}
                titleStyle={{ color: theme.colors.text }}
                style={styles.listItem}
              />
              <List.Item
                title="Update Email"
                left={(props) => <MaterialCommunityIcons name="email-edit-outline" size={20} color={theme.colors.icon} />}
                onPress={() => {
                  resetEmailForm({ newEmail: userData.email, password: '' }); // Pre-fill email, clear password
                  setShowUpdateEmailModal(true); // Open the modal
                }}
                titleStyle={{ color: theme.colors.text }}
                style={styles.listItem}
              />
            </List.Section>
          </View>
        </Card>

        {/* Coins & Rewards */}
        {/* <Card style={[styles.card, { backgroundColor: theme.colors.surface }]}>
          <Card.Title
            title="Coins & Rewards"
            titleStyle={[styles.cardSectionTitle, { color: theme.colors.text }]}
            left={(props) => <MaterialCommunityIcons name="currency-usd" size={24} color={theme.colors.primary} />}
          />
          <Divider />
          <Card.Content>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <Text style={{ color: theme.colors.text, fontSize: 16 }}>Your Coins</Text>
              <Text style={{ color: theme.colors.primary, fontSize: 20, fontWeight: 'bold' }}>{coins}</Text>
            </View>
            <Button
              mode="contained"
              style={{ marginTop: 12, backgroundColor: theme.colors.primary }}
              icon="play-circle-outline"
              onPress={handleWatchAd}
            >
              Watch Ad (+10 coins)
            </Button>
          </Card.Content>
        </Card> */}

        {/* App Settings */}
        <Card style={[styles.card, { backgroundColor: theme.colors.surface }]}>
          <Card.Title
            title="App Settings"
            titleStyle={[styles.cardSectionTitle, { color: theme.colors.text }]}
            left={(props) => <MaterialCommunityIcons name="cog-outline" size={24} color={theme.colors.icon} />}
          />
          <Divider />
          <View style={styles.quickActionButtonContainer}>
            <List.Section>
              <List.Item
                title="Notifications"
                left={(props) => <MaterialCommunityIcons style={{ verticalAlign: 'middle' }} name="bell-outline" size={20} color={theme.colors.icon} />}
                right={(props) => (
                  <Switch
                    value={isNotificationsEnabled}
                    onValueChange={() => setIsNotificationsEnabled(!isNotificationsEnabled)}
                    color={theme.colors.primary}
                  />
                )}
                titleStyle={{ color: theme.colors.text }}
                style={styles.listItem}
              />
              <List.Item
                title="Theme"
                left={(props) => <MaterialCommunityIcons name="palette" size={20} color={theme.colors.icon} />}
                titleStyle={{ color: theme.colors.text }}
                style={styles.listItem}
              />
              {/* SegmentedButtons for Theme Selection */}
              <View style={styles.themeSelectorContainer}>
                <SegmentedButtons
                  value={themePreference}
                  onValueChange={setThemePreference} // This function comes from ThemeContext
                  buttons={[
                    {
                      value: 'system',
                      label: 'System Default',
                      icon: 'cellphone', // Using 'cellphone' as a mobile icon
                      checkedColor: theme.colors.onPrimary, // Text color when checked
                      uncheckedColor: theme.colors.text, // Text color when unchecked
                    },
                    {
                      value: 'dark',
                      label: 'Dark Mode',
                      icon: 'power-sleep', // Using 'power-sleep' for dark mode alternative
                      checkedColor: theme.colors.onPrimary,
                      uncheckedColor: theme.colors.text,
                    },
                    { // Optional: Add a 'light' mode button if you want explicit light mode
                      value: 'light',
                      label: 'Light Mode',
                      icon: 'lightbulb-on-outline', // Using 'lightbulb-on-outline' for light mode alternative
                      checkedColor: theme.colors.onPrimary,
                      uncheckedColor: theme.colors.text,
                    },
                  ]}
                  style={styles.segmentedButtons}
                  density="small" // Adjust density as needed
                  theme={{
                    colors: {
                      secondaryContainer: theme.colors.primary, // Background of selected button
                      onSecondaryContainer: theme.colors.onPrimary, // Text/icon color of selected button
                      outline: theme.colors.primary, // Border color of the buttons
                    }
                  }}
                />
              </View>
            </List.Section>
          </View>
        </Card>

        {/* Support & Legal */}
        <Card style={[styles.card, { backgroundColor: theme.colors.surface }]}>
          <Card.Title
            title="Support & Legal"
            titleStyle={[styles.cardSectionTitle, { color: theme.colors.text }]}
            left={(props) => <MaterialCommunityIcons name="information-outline" size={24} color={theme.colors.icon} />}
          />
          <Divider />
          <View style={styles.quickActionButtonContainer}>
            <List.Section>
              <List.Item
                title="Help & FAQ"
                left={(props) => <MaterialCommunityIcons name="help-circle-outline" size={20} color={theme.colors.icon} />}
                onPress={() => Alert.alert('Help', 'Navigate to Help/FAQ screen')}
                titleStyle={{ color: theme.colors.text }}
                style={styles.listItem}
              />
            </List.Section>
          </View>
        </Card>

        {/* Logout Button */}
        <Button
          mode="contained"
          onPress={confirmLogout}
          style={[styles.logoutButton, { backgroundColor: theme.colors.error }]}
          labelStyle={styles.logoutButtonLabel}
          icon="logout"
        >
          Log Out
        </Button>

        <View style={styles.footer}>
          <Text style={[styles.footerText, { color: theme.colors.placeholder }]}>
            App Version 1.0.0
          </Text>
          <Text style={[styles.footerText, { color: theme.colors.placeholder }]}>
            © 2025 Squard Split
          </Text>
        </View>
      </ScrollView>

      {/* Ad modal (simulated) */}
      {/* <Portal>
        <Modal visible={showAdModal} onDismiss={() => (!adWatching && setShowAdModal(false))} contentContainerStyle={[styles.modalContent, { backgroundColor: theme.colors.surface, alignItems: 'center' }]}>
          <MaterialCommunityIcons name="television-play" color={theme.colors.primary} size={56} />
          <Text style={{ marginTop: 10, fontWeight: 'bold', color: theme.colors.text }}>Watching Ad…</Text>
          <Text style={{ marginTop: 6, color: theme.colors.placeholder }}>Please wait for it to finish to earn 10 coins.</Text>
          <ActivityIndicator style={{ marginTop: 14 }} color={theme.colors.primary} />
        </Modal>
      </Portal> */}

      {/* --- Modals for Edit Features --- */}

      {/* Edit Display Name Modal */}
      <Portal>
        <Modal visible={showEditNameModal} contentContainerStyle={[styles.modalContent, { backgroundColor: theme.colors.surface }]}>
          <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={styles.keyboardAvoidingView}>
            <Text style={[styles.modalTitle, { color: theme.colors.text }]}>Edit Display Name</Text>
            <CustomTextInput
              control={nameControl}
              label="Display Name"
              name="displayName"
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
            />
            <View style={styles.modalButtonContainer}>
              <Button mode="outlined" onPress={() => setShowEditNameModal(false)} style={styles.modalButton} labelStyle={{ color: theme.colors.primary }}>
                Cancel
              </Button>
              <Button mode="contained" onPress={handleNameSubmit(onEditName)} style={[styles.modalButton, { backgroundColor: theme.colors.primary }]} loading={formSubmitting} disabled={formSubmitting}>
                Save
              </Button>
            </View>
          </KeyboardAvoidingView>
        </Modal>
      </Portal>

      {/* Change Password Modal */}
      <Portal>
        <Modal visible={showChangePasswordModal} contentContainerStyle={[styles.modalContent, { backgroundColor: theme.colors.surface }]}>
          <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={styles.keyboardAvoidingView}>
            <Text style={[styles.modalTitle, { color: theme.colors.text }]}>Change Password</Text>

            <CustomTextInput
              control={passwordControl}
              label="Current Password"
              icon="lock"
              name="currentPassword"
              secureTextEntry={!currentPasswordVisible}
              isPasswordToggle={true}
              passwordVisible={currentPasswordVisible}
              onPasswordToggle={() => setCurrentPasswordVisible(!currentPasswordVisible)}
              autoCorrect={false}
            />
            <CustomTextInput
              control={passwordControl}
              label="New Password"
              icon="lock-reset"
              name="newPassword"
              secureTextEntry={!resetPasswordVisible}
              isPasswordToggle={true}
              passwordVisible={resetPasswordVisible}
              onPasswordToggle={() => setResetPasswordVisible(!resetPasswordVisible)}
              autoCorrect={false}
            />

            <CustomTextInput
              control={passwordControl}
              label="New Password"
              icon="lock-reset"
              secureTextEntry={!confirmNewPasswordVisible}
              isPasswordToggle={true}
              passwordVisible={confirmNewPasswordVisible}
              onPasswordToggle={() => setConfirmNewPasswordVisible(!confirmNewPasswordVisible)}
              name="confirmNewPassword"
              autoCorrect={false}
            />
            <View style={styles.modalButtonContainer}>
              <Button mode="outlined" onPress={() => setShowChangePasswordModal(false)} style={styles.modalButton} labelStyle={{ color: theme.colors.primary }}>
                Cancel
              </Button>
              <Button mode="contained" onPress={handlePasswordSubmit(onChangePassword)} style={[styles.modalButton, { backgroundColor: theme.colors.primary }]} loading={formSubmitting} disabled={formSubmitting}>
                Change
              </Button>
            </View>
          </KeyboardAvoidingView>
        </Modal>
      </Portal>

      {/* Update Email Modal */}
      <Portal>
        <Modal visible={showUpdateEmailModal} contentContainerStyle={[styles.modalContent, { backgroundColor: theme.colors.surface }]}>
          <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={styles.keyboardAvoidingView}>
            <Text style={[styles.modalTitle, { color: theme.colors.text }]}>Update Email</Text>
            <CustomTextInput
              control={nameControl}
              label="New Email"
              icon="email"
              name="newEmail"
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
            />

            <CustomTextInput
              label="Your Current Password"
              autoCorrect={false}
              control={emailControl}
              secureTextEntry={!passwordVisible}
              isPasswordToggle={true}
              passwordVisible={passwordVisible}
              onPasswordToggle={() => setPasswordVisible(!passwordVisible)}
              name="password"
              icon="lock"
            />
            <View style={styles.modalButtonContainer}>
              <Button mode="outlined" onPress={() => setShowUpdateEmailModal(false)} style={styles.modalButton} labelStyle={{ color: theme.colors.primary }}>
                Cancel
              </Button>
              <Button mode="contained" onPress={handleEmailSubmit(onUpdateEmail)} style={[styles.modalButton, { backgroundColor: theme.colors.primary }]} loading={formSubmitting} disabled={formSubmitting}>
                Update
              </Button>
            </View>
          </KeyboardAvoidingView>
        </Modal>
      </Portal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingBottom: 0,
    paddingTop: Platform.OS === 'android' ? 40 : 20,

  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    marginBottom: 20,
    alignItems: 'center',
  },
  quickActionButtonContainer: {
    paddingLeft: 15,
    paddingBottom: 10,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
  },
  subtitle: {
    fontSize: 16,
    textAlign: 'center',
    color: '#757575',
  },
  card: {
    width: '100%',
    borderRadius: 12,
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 3,
    marginBottom: 15,
    paddingTop: 0
  },
  profileInfoContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  profileTextContainer: {
    flex: 1,
    marginLeft: 15,
  },
  profileName: {
    fontSize: 20,
    fontWeight: 'bold',
  },
  profileDetail: {
    fontSize: 14,
    color: '#757575',
  },
  cardSectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    verticalAlign: "middle",
    marginLeft: -15,
  },
  listItem: {
    paddingVertical: 0,
  },
  logoutButton: {
    width: '100%',
    paddingVertical: 4,
    borderRadius: 8,
    marginTop: 10,
    marginBottom: 20,
    elevation: 2,
  },
  logoutButtonLabel: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#fff',
  },
  footer: {
    alignItems: 'center',
    marginTop: 20,
    marginBottom: 40,
  },
  footerText: {
    fontSize: 12,
    color: '#757575',
    marginTop: 5,
  },
  themeSelectorContainer: {
    paddingHorizontal: 15,
    marginBottom: 10,
    marginTop: 5,
  },
  segmentedButtons: {
    // Add any specific styling for the segmented buttons container here
  },
  // --- Modal Styles ---
  modalContent: {
    marginHorizontal: 20,
    borderRadius: 12,
    padding: 20,
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
  },
  keyboardAvoidingView: {
    flexGrow: 1, // Allows content to grow within modal
    justifyContent: 'center', // Centers content vertically
  },
  modalTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    marginBottom: 20,
    textAlign: 'center',
  },
  modalButtonContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginTop: 20,
  },
  modalButton: {
    flex: 1,
    marginHorizontal: 5,
  },
});
