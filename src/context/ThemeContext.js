// src/context/ThemeContext.js
import React, { createContext, useEffect, useState, useMemo } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useColorScheme } from 'react-native';
import { customTheme, darkTheme } from '../Layout/theme';

export const ThemeContext = createContext();

export const ThemeProvider = ({ children }) => {
  const systemScheme = useColorScheme(); // 'light' or 'dark'
  const [themePreference, setThemePreference] = useState('system');

  useEffect(() => {
    const load = async () => {
      const stored = await AsyncStorage.getItem('userThemePreference');
      setThemePreference(stored || 'system');
    };
    load();
  }, []);

  const updatePreference = async (preference) => {
    await AsyncStorage.setItem('userThemePreference', preference);
    setThemePreference(preference);
  };

  const theme =
    themePreference === 'dark'
      ? darkTheme
      : themePreference === 'light'
        ? customTheme
        : systemScheme === 'dark'
          ? darkTheme
          : customTheme;

  const contextValue = useMemo(() => ({
    themePreference,
    setThemePreference: updatePreference,
    paperTheme: theme,
  }), [themePreference, systemScheme]);

  return (
    <ThemeContext.Provider value={contextValue}>
      {children}
    </ThemeContext.Provider>
  );
};
