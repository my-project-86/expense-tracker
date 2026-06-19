import React, { useContext } from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Platform } from 'react-native';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import { ThemeContext } from '../../context/ThemeContext';

const Tab = createBottomTabNavigator();

export default function MainTabNavigator() {
  const { paperTheme: theme } = useContext(ThemeContext);

  return (
    <Tab.Navigator
      initialRouteName="Dashboard"
      lazy={true}
      detachInactiveScreens={true}
      screenOptions={({ route }) => ({
        tabBarIcon: ({ color, size }) => {
          let iconName;
          if (route.name === 'Dashboard') {
            iconName = 'view-dashboard';
          } else if (route.name === 'Groups') {
            iconName = 'account-group';
          } else if (route.name === 'Activity') {
            iconName = 'history';
          } else if (route.name === 'Profile') {
            iconName = 'account-circle';
          }
          return <MaterialCommunityIcons name={iconName} size={size} color={color} />;
        },
        tabBarActiveTintColor: theme.colors.primary,
        tabBarInactiveTintColor: theme.colors.placeholder,
        tabBarStyle: {
          backgroundColor: theme.colors.surface,
          borderTopColor: 'transparent',
          paddingBottom: Platform.OS === 'ios' ? 10 : 5,
          height: Platform.OS === 'ios' ? 70 : 55,
        },
        headerTitleStyle: {
          fontWeight: 'bold',
          fontSize: 18,
          color: theme.colors.text,
        },
        tabBarIconStyle: {
          marginBottom: -5,
        },
        tabBarLabelStyle: {
          fontSize: 12,
        },
        headerShown: false,
      })}
    >
      <Tab.Screen
        name="Dashboard"
        getComponent={() => require('../../containers/Dashboard/Dashboard').default}
        options={{ title: 'Dashboard' }}
      />
      <Tab.Screen
        name="Groups"
        getComponent={() => require('../../containers/Groups/Groups').default}
        options={{ title: 'Groups' }}
      />
      <Tab.Screen
        name="Activity"
        getComponent={() => require('../../containers/Activity/Activity').default}
        options={{ title: 'Activity' }}
      />
      <Tab.Screen
        name="Profile"
        getComponent={() => require('../../containers/Profile/Profile').default}
        options={{ title: 'Profile' }}
      />
    </Tab.Navigator>
  );
}