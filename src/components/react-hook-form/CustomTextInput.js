// CustomTextInput.js
import React, { useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { TextInput, Text, useTheme } from 'react-native-paper';
import { Controller } from 'react-hook-form';

const CustomTextInput = ({
  control,
  name,
  rules = {},
  label,
  icon,
  rightIcon,
  isPasswordToggle = false,
  passwordVisible = false,
  onPasswordToggle,
  style,
  disabled = false,
  ...inputProps
}) => {
  const theme = useTheme();
  const [isFocused, setIsFocused] = useState(false);

  return (
    <Controller
      control={control}
      name={name}
      rules={rules}
      render={({ field: { value, onChange, onBlur }, fieldState: { error } }) => (
        <View style={styles.inputWrapper}>
          <TextInput
            label={label}
            value={value}
            maxLength={inputProps.maxLength || 50}
            onChangeText={onChange}
            onFocus={() => setIsFocused(true)}
            onBlur={() => {
              setIsFocused(false);
              onBlur();
            }}
            mode="outlined"
            disabled={disabled}
            style={[
              styles.textInput,
              style,
              {
                backgroundColor: disabled
                  ? ""
                  : theme.colors.surface,
             },
            ]}
            error={!!error}
            {...inputProps}
            right={
              isPasswordToggle ? (
                <TextInput.Icon
                  icon={passwordVisible ? 'eye-off' : 'eye'}
                  onPress={onPasswordToggle}
                />
              ) : rightIcon ? (
                <TextInput.Icon icon={rightIcon} />
              ) : null
            }
            theme={{
              colors: {
                primary: theme.colors.primary, // Focused outline + label
                onSurfaceVariant: isFocused ? theme.colors.primary : theme.colors.placeholder, // Focused/unfocused label
                error: theme.colors.error,
                onSurfaceDisabled: theme.colors.textLabelDisabled, // Disabled text color
              },
            }}
            textColor={disabled ? theme.colors.textLabelDisabled : theme.colors.onSurface}

          />
          {error && (
            <Text style={[styles.errorMessage, { color: theme.colors.error }]}>
              {error.message || `${label} is invalid.`}
            </Text>
          )}
        </View>
      )}
    />
  );
};

const styles = StyleSheet.create({
  inputWrapper: {
    marginBottom: 15,
  },
  textInput: {
    opacity: 0.95,
  },
  errorMessage: {
    marginTop: 4,
    fontSize: 12,
  },
});

export default CustomTextInput;
