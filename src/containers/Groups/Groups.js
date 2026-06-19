// src/screens/Groups.js
import React, { useEffect, useState, useCallback } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { View, ScrollView, Alert, ActivityIndicator } from 'react-native';
import { Text, useTheme, FAB, Card, Avatar } from 'react-native-paper';
import { useNavigation } from '@react-navigation/native';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { auth, db } from '../../firebaseConfig';
import { styles } from './Groups.config';
import { youOweBalance } from './Groups.config';

export default function Groups() {
  const theme = useTheme();
  const navigation = useNavigation();
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);

  const currentUser = auth.currentUser;
  const currentUID = auth.currentUser.uid;

  const removeGroupFromState = (groupId) => {
  setGroups((prev) => prev.filter((g) => g.id !== groupId));
};

useFocusEffect(
  useCallback(() => {
    if (!currentUser) {
      setLoading(false);
      return;
    }

    const deletedGroupId = navigation.getState()?.routes.find(r => r.name === "Groups")?.params?.deletedGroupId;
    if (deletedGroupId) {
      removeGroupFromState(deletedGroupId);
      // clean param so it doesn't repeat
      navigation.setParams({ deletedGroupId: null });
    }

    const groupsRef = collection(db, "groups");
    const q = query(groupsRef, where("memberUIDs", "array-contains", currentUser.uid));

    const expenseUnsubscribers = new Map();

    const unsubscribeGroups = onSnapshot(
      q,
      (snapshot) => {
        snapshot.docChanges().forEach((change) => {
          const docData = change.doc.data();
          const groupData = { id: change.doc.id, ...docData };

          if (change.type === "removed") {
            setGroups((prev) => prev.filter((g) => g.id !== change.doc.id));
            if (expenseUnsubscribers.has(change.doc.id)) {
              expenseUnsubscribers.get(change.doc.id)();
              expenseUnsubscribers.delete(change.doc.id);
            }
            return;
          }

          if (!expenseUnsubscribers.has(change.doc.id)) {
            const expensesRef = collection(db, "groups", change.doc.id, "expenses");
            const unsubscribeExpenses = onSnapshot(expensesRef, (expensesSnapshot) => {
              const expenses = expensesSnapshot.docs.map((expDoc) => ({
                id: expDoc.id,
                ...expDoc.data(),
              }));

              setGroups((prev) => {
                let updated = [...prev];
                const index = updated.findIndex((g) => g.id === groupData.id);

                if (index > -1) {
                  // update existing group without removing/reinserting
                  updated[index] = { ...groupData, expenses };
                } else {
                  // new group
                  updated.push({ ...groupData, expenses });
                }

                // sort groups by lastActivity
                updated.sort((a, b) => {
                  if (a.lastActivity && b.lastActivity) {
                    return b.lastActivity.toMillis() - a.lastActivity.toMillis();
                  } else if (a.lastActivity && !b.lastActivity) {
                    return -1;
                  } else if (!a.lastActivity && b.lastActivity) {
                    return 1;
                  }
                  return 0;
                });

                return updated;
              });
            });

            expenseUnsubscribers.set(change.doc.id, unsubscribeExpenses);
          }
        });

        setLoading(false);
      },
      (error) => {
        Alert.alert("Error", "Failed to load groups. Please try again later.");
        setLoading(false);
      }
    );

    return () => {
      unsubscribeGroups();
      expenseUnsubscribers.forEach((unsub) => unsub());
    };
  }, [currentUser])
);

  const formatRelativeTime = (timestamp) => {
    try {
      const date =
        typeof timestamp?.toDate === "function"
          ? timestamp.toDate()
          : new Date(timestamp);

      const diffInSeconds = Math.floor((now - date) / 1000);
      const diffInMinutes = Math.floor(diffInSeconds / 60);
      const diffInHours = Math.floor(diffInMinutes / 60);
      const diffInDays = Math.floor(diffInHours / 24);

      if (diffInMinutes < 1) return "Just now";
      if (diffInMinutes < 60) return `${diffInMinutes} minute${diffInMinutes > 1 ? "s" : ""} ago`;
      if (diffInHours < 24) return `${diffInHours} hour${diffInHours > 1 ? "s" : ""} ago`;
      if (diffInDays === 1) return "Yesterday";
      if (diffInDays < 30) return `${diffInDays} days ago`;

      return date.toLocaleDateString("en-IN", {
        day: "numeric",
        month: "short",
        year: "numeric",
      });
    } catch {
      return "Invalid date";
    }
  };

  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const interval = setInterval(() => {
      setNow(new Date()); // tick every minute
    }, 60000);

    return () => clearInterval(interval);
  }, []);

  const getBalanceDisplay = (balance) => {
    if (balance === 0) {
      return { label: "Settled Up", amount: "₹ 0", color: theme.colors.placeholder, icon: "check-circle" };
    } else if (balance > 0) {
      return { label: "You Are Owed", amount: `₹ ${balance}`, color: theme.colors.success, icon: "arrow-up" };
    } else {
      return { label: "You Owe", amount: `₹ ${Math.abs(balance)}`, color: theme.colors.error, icon: "arrow-down" };
    }
  };

  // "#4A90E2", // blue
  // "#50E3C2", // teal
  // "#F5A623", // orange
  // "#7ED321", // green
  // "#D0021B", // red
  // "#9013FE", // purple
  // "#F8E71C", // yellow
  // "#B8E986" 

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      {loading ? (
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
        </View>
      ) : !loading && groups.length === 0 ? (
        <View style={styles.emptyStateContainer}>
          <MaterialCommunityIcons
            name="account-group-outline"
            size={80}
            color={theme.colors.placeholder}
            style={styles.emptyStateIcon}
          />
          <Text style={[styles.emptyStateText, { color: theme.colors.placeholder }]}>
            No groups yet! Tap the '+' button to create your first group.
          </Text>
        </View>
      ) : (
        <ScrollView style={styles.groupList}>
          {groups.map((group) => {
            const balanceDisplay = getBalanceDisplay(youOweBalance(group.expenses, currentUID)); // calculate for logged in user
            const hasExpenses = Array.isArray(group.expenses) && group.expenses.length > 0;

            return (
              <Card
                key={group.id}
                style={[styles.groupCard, { backgroundColor: theme.colors.surface }]}
                onPress={() => navigation.navigate('Group Details', { id: group.id, group: group })}
              >
                <Card.Content>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                    {/* Avatar on Left */}
                    <Avatar.Icon
                      icon="account-group-outline"
                      size={56}
                      style={{ backgroundColor: group.groupColor || theme.colors.primary }}
                      color={theme.colors.onPrimary || 'white'}
                    />

                    <View style={{ flex: 1, marginLeft: 16 }}>
                      <Text style={[styles.groupName, { color: theme.colors.text }]}>
                        {group.name}
                      </Text>
                      <Text style={[styles.groupMembers, { color: theme.colors.placeholder }]}>
                        {group.members?.length || 0} members
                      </Text>
                    </View>

                    {group.expenses.length > 0 && <View style={{ alignItems: 'flex-end' }}>
                      <Text style={{ fontSize: 18, fontWeight: 'bold', color: balanceDisplay.color }}>
                        {balanceDisplay.amount}
                      </Text>
                      <Text style={{ fontSize: 12, color: balanceDisplay.color }}>
                        {balanceDisplay.label}
                      </Text>
                    </View>}
                  </View>

                  {group.lastActivity && (
                    <Text
                      style={[
                        styles.lastActivity,
                        {
                          color: theme.colors.placeholder,
                          textAlign: 'right',
                          marginTop: 10,
                        },
                      ]}
                    >
                      {formatRelativeTime(group.lastActivity)}
                    </Text>
                  )}

                  {!hasExpenses && (
                    <Text
                      style={{
                        marginTop: 8,
                        fontStyle: 'italic',
                        color: theme.colors.placeholder,
                        textAlign: 'center',
                      }}
                    >
                      No expenses added yet
                    </Text>
                  )}
                </Card.Content>
              </Card>
            );
          })}

        </ScrollView>
      )}

      <FAB
        style={[styles.fab, { backgroundColor: theme.colors.primary }]}
        icon="plus"
        label="New Group"
        color="white"
        onPress={() => navigation.navigate('CreateGroup')}
      />
    </View>
  );
}
