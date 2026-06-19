// src/screens/LoginScreen.js
import React, { useEffect, useState } from "react";
import {
  View,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  Alert,
  ScrollView,
} from "react-native";
import { Button, Text, useTheme, Modal, Portal } from "react-native-paper";
import { useNavigation } from "@react-navigation/native";
import { useForm } from "react-hook-form";
import { doc, getDoc } from "firebase/firestore";
import * as SecureStore from 'expo-secure-store';
import * as yup from "yup";
import { yupResolver } from "@hookform/resolvers/yup";
import { signInWithEmailAndPassword, sendPasswordResetEmail } from "firebase/auth"; // Import sendPasswordResetEmail

import CustomTextInput from "../../components/react-hook-form/CustomTextInput";
import { db, auth } from "../../firebaseConfig";
import CustomSelectField from "../../components/react-hook-form/CustomSelectField";

// Validation Schema for Login
const loginSchema = yup.object().shape({
  email: yup
    .string()
    .required("Email is required.")
    .matches(
      /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i,
      "Invalid email format."
    ),
  password: yup
    .string()
    .required("Password is required.")
});

export default function LoginScreen() {
  const theme = useTheme();
  const navigation = useNavigation();

  // State for password visibility and loading
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [loading, setLoading] = useState(false);
  
  // State for the password reset modal
  const [showResetPasswordModal, setShowResetPasswordModal] = useState(false);

  // React Hook Form for the login form
  const {
    control,
    handleSubmit,
  } = useForm({
    mode: "onChange",
    defaultValues: {
      email: "",
      password: "",
    },
    resolver: yupResolver(loginSchema),
  });
  
  // React Hook Form for the password reset form
  const {
    control: resetControl,
    handleSubmit: handleResetSubmit,
    reset: resetResetForm,
  } = useForm({
    mode: "onChange",
    defaultValues: {
      email: "",
    },
    resolver: yupResolver(loginSchema.pick(['email'])),
  });

  // --- Email/Password Login Logic ---
  const handleEmailPasswordLogin = async (data) => {
    setLoading(true);

    try {
      const userCredential = await signInWithEmailAndPassword(auth, data.email, data.password);
      const user = userCredential.user;

      if (!user.emailVerified) {
        throw new Error("Please verify your email before logging in.");
      }

      // Optional: fetch user data from Firestore using UID
      const userDocRef = doc(db, "users", user.uid);
      const userDocSnap = await getDoc(userDocRef);
      if (!userDocSnap.exists()) {
        throw new Error("User profile data not found.");
      }

      const userToken = await userCredential.user.getIdToken();
      await SecureStore.setItemAsync('userToken', userToken);

      navigation.replace("Main");
    } catch (error) {
      Alert.alert("Login Failed", error.message || "An error occurred during login.");
    } finally {
      setLoading(false);
    }
  };

  // --- Password Reset Logic ---
  const handlePasswordReset = async (data) => {
    setLoading(true);
    try {
      await sendPasswordResetEmail(auth, data.email);
      Alert.alert(
        "Password Reset Sent",
        "A password reset link has been sent to your email address."
      );
      setShowResetPasswordModal(false);
      resetResetForm(); // Clear the reset password form
    } catch (error) {
      Alert.alert("Error", error.message || "Failed to send password reset email.");
    } finally {
      setLoading(false);
    }
  };

  // --- Sign Up Button Handler ---
  const handleSignUp = () => {
    navigation.replace("SignUp");
  };

  return (
    <KeyboardAvoidingView
      style={styles.keyboardAvoidingContainer}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 64 : 0}
    >
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View
          style={[
            styles.container,
            { backgroundColor: theme.colors.background },
          ]}
        >
          {/* --- Logo/App Title Section --- */}
          <View style={styles.logoContainer}>
            <Text style={[styles.title, { color: theme.colors.primary }]}>
              Squad Split
            </Text>
            <Text style={[styles.subtitle, { color: theme.colors.text }]}>
              Log in to your account
            </Text>
          </View>

          {/* --- Input Fields Section --- */}
          <View style={styles.inputContainer}>
            <CustomTextInput
              control={control}
              name="email"
              label="Email"
              icon="email"
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              disabled={loading}
              returnKeyType="next"
              textContentType="username"
            />

            <CustomTextInput
              control={control}
              name="password"
              label="Password"
              icon="lock"
              secureTextEntry={!passwordVisible}
              isPasswordToggle={true}
              passwordVisible={passwordVisible}
              onPasswordToggle={() => setPasswordVisible(!passwordVisible)}
              disabled={loading}
              returnKeyType="done"
              textContentType="password"
            />
            {/* --- Forgot Password Button --- */}
            <Button
              mode="text"
              onPress={() => setShowResetPasswordModal(true)}
              style={styles.forgotPasswordButton}
              labelStyle={{ color: theme.colors.primary }}
              disabled={loading}
            >
              Forgot password?
            </Button>
          </View>

          {/* --- Login Button (Email/Password) --- */}
          <Button
            mode="contained"
            onPress={handleSubmit(handleEmailPasswordLogin)}
            loading={loading}
            disabled={loading}
            style={[
              styles.loginButton,
              { backgroundColor: theme.colors.primary },
            ]}
            labelStyle={styles.loginButtonLabel}
            icon="login"
          >
            Login
          </Button>

          {/* --- Sign Up Link --- */}
          <View style={styles.signUpContainer}>
            <Text style={{ color: theme.colors.text }}>
              {"Don't have an account? "}
            </Text>
            <Button
              mode="text"
              onPress={handleSignUp}
              labelStyle={{ color: theme.colors.primary }}
              disabled={loading}
            >
              Sign Up
            </Button>
          </View>

          {/* --- Optional Footer Text --- */}
          <Text
            style={[styles.footerText, { color: theme.colors.placeholder }]}
          >
            © 2025 Squad Split. All rights reserved.
          </Text>
        </View>
      </ScrollView>

      {/* --- Password Reset Modal --- */}
      <Portal>
        <Modal
          visible={showResetPasswordModal}
          contentContainerStyle={[
            styles.modalContainer,
            { backgroundColor: theme.colors.surface },
          ]}
        >
          <Text style={[styles.modalTitle, { color: theme.colors.text }]}>
            Reset Password
          </Text>
          <Text style={[styles.modalMessage, { color: theme.colors.placeholder }]}>
            Enter the email address associated with your account. A password reset link will be sent to your inbox.
          </Text>
          <CustomTextInput
            control={resetControl}
            name="email"
            label="Email"
            icon="email"
            keyboardType="email-address"
            autoCapitalize="none"
            disabled={loading}
          />
          <View style={styles.modalActions}>
            <Button
              mode="text"
              onPress={() => setShowResetPasswordModal(false)}
              disabled={loading}
            >
              Cancel
            </Button>
            <Button
              mode="contained"
              onPress={handleResetSubmit(handlePasswordReset)}
              loading={loading}
              disabled={loading}
              style={{ backgroundColor: theme.colors.primary }}
            >
              Send Reset Email
            </Button>
          </View>
        </Modal>
      </Portal>
    </KeyboardAvoidingView>
  );
}

// --- Stylesheet ---
const styles = StyleSheet.create({
  keyboardAvoidingContainer: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
  },
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
    paddingBottom: 32,
  },
  logoContainer: {
    alignItems: "center",
    marginBottom: 40,
  },
  title: {
    fontSize: 32,
    fontWeight: "bold",
    marginBottom: 5,
  },
  subtitle: {
    fontSize: 16,
  },
  inputContainer: {
    width: "100%",
    marginBottom: 20,
  },
  forgotPasswordButton: {
    alignSelf: "flex-end",
    marginBottom: 20,
  },
  loginButton: {
    width: "100%",
    paddingVertical: 8,
    borderRadius: 8,
    marginBottom: 20,
    elevation: 2,
  },
  loginButtonLabel: {
    fontSize: 18,
    fontWeight: "bold",
  },
  signUpContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 20,
  },
  footerText: {
    marginTop: 24,
    fontSize: 12,
    textAlign: "center",
    alignSelf: 'center',
  },
  modalContainer: {
    padding: 24,
    marginHorizontal: 20,
    borderRadius: 12,
    elevation: 5,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 10,
    textAlign: 'center',
  },
  modalMessage: {
    fontSize: 14,
    marginBottom: 20,
    textAlign: 'center',
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 20,
    gap: 10,
  },
});
