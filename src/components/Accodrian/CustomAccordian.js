import React from 'react';
import { View, StyleSheet, TouchableOpacity, LayoutAnimation, Platform, UIManager } from 'react-native';
import { Text, IconButton, useTheme } from 'react-native-paper';
import { MaterialIcons } from '@expo/vector-icons';

if (Platform.OS === 'android') {
  UIManager.setLayoutAnimationEnabledExperimental?.(true);
}

const CustomAccordion =({
  title,
  expanded,
  onToggle,
  children,
  leftIcon = 'keyboard-arrow-right',
  rightActions,
}) => {
  const theme = useTheme();

  const handleToggle = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    onToggle();
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.surface }]}>
      <TouchableOpacity style={styles.header} onPress={handleToggle}>
        <View style={styles.headerContent}>
          
          <Text variant="titleMedium" style={{ color: theme.colors.onSurface }}>
            {title}
          </Text>
        </View>
        <View style={styles.rightActions}>
          {rightActions}
          {/* <IconButton
            icon={expanded ? 'chevron-up' : 'chevron-down'}
            size={20}
            iconColor={theme.colors.onSurfaceVariant}
            /> */}
          <MaterialIcons
            onPress={handleToggle}
            name={expanded ? 'keyboard-arrow-down' : leftIcon}
            size={24}
            color={theme.colors.onSurface}
            style={{ marginRight: 8 }}
          />
        </View>
      </TouchableOpacity>

      {expanded && <View style={styles.content}>{children}</View>}
    </View>
  );
};

export default CustomAccordion;

const styles = StyleSheet.create({
  container: {
    // borderWidth: 1,
    borderRadius: 10,
    marginBottom: 10,
    overflow: 'hidden',
    width: "100%"
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    // padding: 12,
  },
  headerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  rightActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  content: {
    paddingHorizontal: 12,
    paddingBottom: 12,
  },
});
