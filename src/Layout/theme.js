import { DefaultTheme } from 'react-native-paper';

// Define your original custom theme
export const customTheme = {
    ...DefaultTheme,
    roundness: 8,
    colors: {
        ...DefaultTheme.colors,
        primary: '#1E88E5',      // Original: A modern, vibrant blue (Material Design 500)
        accent: '#FFC107',       // Original: A warm, contrasting amber (Material Design 500)
        background: '#f0f6fa',   // Original: A very light, subtle grey background for depth
        surface: '#FFFFFF',      // Original: Pure white for card-like elements and inputs
        text: '#212121',         // Original: Dark grey for primary text, ensuring readability
        placeholder: '#757575',  // Original: Medium grey for placeholder text
        disabled: '#BDBDBD',     // Original: Light grey for disabled elements
        error: '#D32F2F',        // Original: A clear, strong red for errors
        success: '#4CAF50',      // Original: A distinct green for success/positive balance (added previously)
        onSurface: '#000000',    // Original: Color for text/icons that appear on 'surface' backgrounds
        onBackground: '#000000', // Original: Color for text/icons that appear on 'background' backgrounds
        textInputLabel: '#6B7280', // Neutral gray for labels
        textInputLabelFocused: '#3B82F6', // Matches primary
        textInputDisabled: '#9CA3AF', // Muted gray for disabled text
        textInputBackgroundDisabled: '#E9ECEF',
        textLabelDisabled: "#979696ff",
        avatar: "green",
        icon: "grey"
    },
};

// Define your dark theme
export const darkTheme = {
    ...DefaultTheme,
    dark: true,
    roundness: 8,
    colors: {
        ...DefaultTheme.colors,
        primary: '#1E88E5',      // Lighter blue for dark mode
        accent: '#FFD54F',       // Soft yellow accent
        background: '#121212',   // True dark background
        surface: '#1E1E1E',      // Slightly lighter than background for cards
        text: '#E0E0E0',         // Light grey for text
        placeholder: '#B0B0B0',  // Medium grey for placeholder text
        disabled: 'rgba(255,255,255,0.1)',        // Dark grey for disabled elements
        error: '#D32F2F',        // Bright red for errors
        success: '#4CAF50',      // Softer green for success
        onSurface: '#E0E0E0',    // Light text/icons on surface
        onBackground: '#E0E0E0', // Light text/icons on background
        secondary: '#FFB300',    // Add a secondary color for highlights
        textInputLabel: '#9CA3AF', // Medium-light gray label
        textInputLabelFocused: '#D1D5DB', // Light gray when focused (not primary)
        textInputDisabled: '#6B7280', // Muted gray for disabled text
        textInputBackgroundDisabled: '#1F2937',
        textLabelDisabled: "#b0b0b067",
        avatar: "green",
        icon: "grey"
    },
};
