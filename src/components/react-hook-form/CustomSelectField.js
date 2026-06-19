import React, { useState } from 'react';
import { View, StyleSheet, Pressable, ScrollView } from 'react-native';
import {
  TextInput,
  Menu,
  HelperText,
  useTheme,
  Divider,
  List,
  Checkbox,
  Button,
} from 'react-native-paper';
import { Controller } from 'react-hook-form';

const CustomSelectField = ({
  name,
  control,
  label,
  options,
  defaultValue = [],
  rules = {},
  disabled = false,
  multiple = false,
  maxSelected = null, // ✅ optional selection limit
}) => {
  const theme = useTheme();
  const [visible, setVisible] = useState(false);
  const [inputWidth, setInputWidth] = useState(0);
  const [focused, setFocused] = useState(false);


  const openMenu = () => {
    setVisible(true);
    setFocused(true);
  };

  const closeMenu = () => {
    setVisible(false);
    setFocused(false);
  };

  const getSelectedLabels = (value) => {
    if (multiple && Array.isArray(value)) {
      if (value.length === 0) return '';
      if (value.length <= 2) {
        return options
          ?.filter(option => value.includes(option.value))
          ?.map(option => option.label)
          .join(', ');
      }
      const firstTwo = options
        ?.filter(option => value.includes(option.value))
        ?.slice(0, 2)
        .map(option => option.label);
      return `${firstTwo.join(', ')} +${value.length - 2} more`;
    } else {
      return options?.find(option => option.value === value)?.label || '';
    }
  };

  const handleSelect = (value, onChange, selectedValues) => {
    if (multiple) {
      let updated = Array.isArray(selectedValues) ? [...selectedValues] : [];
      if (updated.includes(value)) {
        updated = updated.filter(v => v !== value);
      } else {
        if (!maxSelected || updated.length < maxSelected) {
          updated.push(value);
        }
      }
      onChange(updated);
    } else {
      onChange(value);
      closeMenu();
    }
  };

  const clearAll = (onChange) => {
    onChange([]);
  };

  const selectAll = (onChange) => {
    onChange(options?.map(opt => opt.value));
  };

  return (
    <Controller
      name={name}
      control={control}
      rules={rules}
      defaultValue={defaultValue}
      render={({ field: { onChange, value }, fieldState: { error } }) => (
        <View style={styles.container}>
          <Menu
            visible={visible}
            onDismiss={closeMenu}
            anchor={
              <Pressable
                disabled={disabled}
                onPress={openMenu}
                onLayout={(e) => setInputWidth(e.nativeEvent.layout.width)}
              >
                <TextInput
                  mode="outlined"

                  label={label}
                  value={getSelectedLabels(value)}
                  editable={false}
                  right={
                    <TextInput.Icon
                      icon={visible ? 'menu-up' : 'menu-down'}
                      onPress={openMenu}
                      color={disabled ? theme.colors.textLabelDisabled : theme.colors.placeholder}
                      forceTextInputFocus={false}
                    />
                  }
                  error={!!error}
                  disabled={disabled}
                  style={[
                    styles.input,
                    {
                      backgroundColor: disabled
                        ? ""
                        : theme.colors.surface,
                    },
                  ]}
                  textColor={disabled ? theme.colors.textLabelDisabled : theme.colors.onSurface}

                  //                   outlineStyle={{
                  //   borderColor: error
                  //     ? theme.colors.error
                  //     : disabled
                  //     ? theme.colors.onSurfaceDisabled // ✅ proper disabled outline
                  //     : focused
                  //     ? theme.colors.primary
                  //     : theme.colors.outline,
                  //   borderWidth: error || focused ? 2 : 1,
                  // }}

                  theme={{
                    colors: {
                      primary: theme.colors.primary, // Focused outline + label
                      onSurfaceVariant: disabled
                        ? theme.colors.placeholder // Disabled text
                        : (focused ? theme.colors.primary : theme.colors.placeholder), // Focused/unfocused label
                      error: theme.colors.error,
                      onSurfaceDisabled: theme.colors.textLabelDisabled, // Disabled text color

                    },
                  }}
                  pointerEvents="none"
                />
              </Pressable>
            }
            contentStyle={{
              backgroundColor: theme.colors.surface,
              borderRadius: 8,
              paddingVertical: 4,
              width: inputWidth,
              marginTop: 58,
              maxHeight: 300,
            }}
          >
            {/* ✅ Multi-select helper actions */}
            {multiple && (
              <View style={styles.actionsRow}>
                <Button
                  compact
                  onPress={() => selectAll(onChange)}
                  disabled={value?.length === options.length}
                >
                  Select All
                </Button>
                <Button
                  compact
                  onPress={() => clearAll(onChange)}
                  disabled={!value || value.length === 0}
                >
                  Clear All
                </Button>
              </View>
            )}

            <ScrollView>
              {options?.map((option, index) => {
                const isSelected = multiple
                  ? Array.isArray(value) && value.includes(option.value)
                  : value === option.value;

                return (
                  <View key={option.value}>
                    <List.Item
                      title={option.label}
                      onPress={() => handleSelect(option.value, onChange, value)}
                      titleStyle={{
                        color: isSelected ? theme.colors.primary : theme.colors.onSurface,
                        fontWeight: isSelected ? 'bold' : 'normal',
                      }}
                      left={() =>
                        multiple ? (
                          <Checkbox
                            status={isSelected ? 'checked' : 'unchecked'}
                            onPress={() => handleSelect(option.value, onChange, value)}
                          />
                        ) : null
                      }
                      style={[
                        styles.menuItem,
                        isSelected && { backgroundColor: theme.colors.primary + '20' },
                      ]}
                    />
                    {index < options.length - 1 && (
                      <Divider style={{ backgroundColor: 'grey' }} />
                    )}
                  </View>
                );
              })}
            </ScrollView>
          </Menu>

          {error && (
            <HelperText type="error" visible={!!error}>
              {error.message || 'This field is required'}
            </HelperText>
          )}
        </View>
      )}
    />
  );
};

const styles = StyleSheet.create({
  container: {
    marginBottom: 16,
  },
  input: {
    opacity: 0.95,
  },
  actionsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingBottom: 4,
  },
  menuItem: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    minHeight: 45,
  },
});

export default CustomSelectField;
