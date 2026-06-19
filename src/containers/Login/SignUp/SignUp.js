// src/screens/SignupScreen.js
import React, { useState } from 'react';
import {
  View,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  TouchableWithoutFeedback,
  Keyboard,
  Alert,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import { Button, Text, useTheme } from 'react-native-paper';
import { useNavigation } from '@react-navigation/native';
import { useForm } from 'react-hook-form';
import * as yup from 'yup';
import { yupResolver } from '@hookform/resolvers/yup';
// Removed getAuth import as it's no longer needed

// Corrected import path for CustomTextInput
import CustomTextInput from '../../../components/react-hook-form/CustomTextInput'; 

// Corrected import path for Firebase config
import { auth, app, db } from '../../../firebaseConfig'; // Adjust the import based on your project structure
import { createUserWithEmailAndPassword, updateProfile, sendEmailVerification } from 'firebase/auth';
import { doc, setDoc } from 'firebase/firestore';

// Validation Schema for Signup
const signupSchema = yup.object().shape({
  // 'displayName' will be used as the 'username'
  displayName: yup
    .string().required('Username is required.')
    .min(2, 'Username must be at least 2 characters.'),
  email: yup
    .string()
    .required('Email is required.')
    .matches(
      /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i, // Basic regex for email format
      'Invalid Email format.'
    ),
  password: yup
    .string()
    .required('Password is required.')
    .min(8, 'Password must be at least 8 characters long.')
    .matches(/[a-z]/, 'Password must contain at least one lowercase letter.')
    .matches(/[A-Z]/, 'Password must contain at least one uppercase letter.')
    .matches(/\d/, 'Password must contain at least one number.')
    .matches(/[^a-zA-Z0-9]/, 'Password must contain at least one special character (e.g., !@#$%^&*).'),
  confirmPassword: yup
    .string()
    .required('Confirm password is required.')
    .oneOf([yup.ref('password'), null], 'Passwords must match') // Ensures confirmPassword matches password
});

export default function SignupScreen() {
  const theme = useTheme();
  const navigation = useNavigation();

  const { control, handleSubmit, formState: { errors } } = useForm({
    mode: "onChange",
    defaultValues: {
      displayName: '',
      email: '',
      password: '',
      confirmPassword: '',
    },
    resolver: yupResolver(signupSchema),
  });

  const [passwordVisible, setPasswordVisible] = useState(false);
  const [confirmPasswordVisible, setConfirmPasswordVisible] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSignup = async (data) => {
    Keyboard.dismiss();
    setLoading(true);

    try {
      const userCredential = await createUserWithEmailAndPassword(auth, data.email, data.password);
      const user = userCredential.user;

      await updateProfile(user, { displayName: data.displayName });
      await sendEmailVerification(user);
      await setDoc(doc(db, 'users', user.uid), {
        displayName: data.displayName,
        email: data.email,
        createdAt: new Date(),
        uid: user.uid,
      });

      Alert.alert(
        'Account Created!',
        'A verification email has been sent to your email address. Please verify your email before logging in. Check your spam folder if you don\'t see it.',
        [
          {
            text: 'OK',
            onPress: () => navigation.replace('Login'),
          },
        ]
      );
    } catch (error) {
      let errorMessage = 'Failed to create account. Please try again.';
      if (error.code === 'auth/email-already-in-use') {
        errorMessage = 'That email address is already in use by another account!';
      } else if (error.code === 'auth/invalid-email') {
        errorMessage = 'The email address is not valid.';
      } else if (error.code === 'auth/weak-password') {
        errorMessage = 'The password is too weak. Please choose a stronger one.';
      } else if (error.code === 'auth/network-request-failed') {
        errorMessage = 'Network error. Please check your internet connection.';
      }
      Alert.alert('Signup Failed', errorMessage);
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.keyboardAvoidingContainer}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 80 : 0}
    >
      <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
        <ScrollView
          contentContainerStyle={[styles.container, { backgroundColor: theme.colors.background }]}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={[styles.title, { color: theme.colors.primary }]}>Sign Up</Text>
          <Text style={[styles.subtitle, { color: theme.colors.text }]}>
            Create your new Squad Split account
          </Text>

          <View style={styles.inputContainer}>
            <CustomTextInput
              control={control}
              name="displayName"
              label="Username"
              maxLength={50}
              icon="account"
              autoCapitalize="words"
              disabled={loading}
              error={errors.displayName}
              helperText={errors.displayName?.message}
            />
            <CustomTextInput
              control={control}
              name="email"
              label="Email"
              maxLength={100}
              icon="email"
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              disabled={loading}
              error={errors.email}
              helperText={errors.email?.message}
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
              error={errors.password}
              helperText={errors.password?.message || 'Min 8 chars, 1 uppercase, 1 lowercase, 1 number, 1 special character.'}
            />
            <CustomTextInput
              control={control}
              name="confirmPassword"
              label="Confirm Password"
              icon="lock"
              secureTextEntry={!confirmPasswordVisible}
              isPasswordToggle={true}
              passwordVisible={confirmPasswordVisible}
              onPasswordToggle={() => setConfirmPasswordVisible(!confirmPasswordVisible)}
              disabled={loading}
              error={errors.confirmPassword}
              helperText={errors.confirmPassword?.message}
            />
          </View>

          <Button
            mode="contained"
            onPress={handleSubmit(handleSignup)}
            loading={loading}
            disabled={loading}
            style={[styles.signupButton, { backgroundColor: theme.colors.primary }]}
            labelStyle={styles.signupButtonLabel}
            icon="account-plus"
          >
            Sign Up
          </Button>

          <View style={styles.loginContainer}>
            <Text style={{ color: theme.colors.text }}>Already have an account? </Text>
            <Button
              mode="text"
              onPress={() => navigation.replace('Login')}
              labelStyle={{ color: theme.colors.primary }}
              disabled={loading}
            >
              Log In
            </Button>
          </View>
        </ScrollView>
      </TouchableWithoutFeedback>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  keyboardAvoidingContainer: {
    flex: 1,
  },
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  title: {
    fontSize: 32,
    fontWeight: "bold",
    marginBottom: 5,
  },
  subtitle: {
    fontSize: 16,
    color: "#757575",
    marginBottom: 10,
  },
  inputContainer: {
    width: "100%",
    marginBottom: 20,
  },
  signupButton: {
    width: "100%",
    paddingVertical: 8,
    borderRadius: 8,
    marginBottom: 20,
    elevation: 2,
  },
  signupButtonLabel: {
    fontSize: 18,
    fontWeight: "bold",
  },
  loginContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 20,
  },
  footerText: {
    position: "absolute",
    bottom: 20,
    fontSize: 12,
    textAlign: "center",
  },
});
