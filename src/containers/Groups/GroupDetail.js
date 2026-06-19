// src/screens/GroupDetails.js
import React, { useEffect, useState, useMemo } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  SafeAreaView,
  BackHandler,
  Alert,
  ActivityIndicator,
  TouchableOpacity,
  Dimensions
} from 'react-native';
import {
  Text,
  useTheme,
  List,
  Divider,
  Button,
  FAB,
  IconButton,
  Card,
  Appbar,
  Dialog,
  Avatar,
  TextInput,
  RadioButton
} from 'react-native-paper';
import { useRoute, useNavigation } from '@react-navigation/native';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import { auth, db } from '../../firebaseConfig';
import { doc, onSnapshot, collection, query, orderBy, serverTimestamp } from 'firebase/firestore';
import { Modal, Portal, TextInput as PaperInput } from 'react-native-paper';
import { useForm, Controller } from 'react-hook-form';
import { updateDoc, arrayUnion } from 'firebase/firestore';
import CustomTextInput from '../../components/react-hook-form/CustomTextInput';
import { where, getDocs, deleteDoc, getDoc } from 'firebase/firestore';
import CustomAccordion from "../../components/Accodrian/CustomAccordian"
import { youOweBalance } from './Groups.config';
import { logGroupActivity } from '../../utils/activity';
import MonthFilter, { formatFilterLabel } from '../../components/filters/MonthFilter';
import { Picker } from '@react-native-picker/picker';


export default function GroupDetails() {
  const theme = useTheme();
  const route = useRoute();
  const groupId = route.params?.id;
  const group = route.params?.group;


  const navigation = useNavigation();

  const [showAddMember, setShowAddMember] = useState(false);
  const { control, handleSubmit, reset } = useForm({
    defaultValues: {
      email: '',
    },
  });

  const [groupData, setGroupData] = useState(null);
  const [loading, setLoading] = useState(true);

  const [selectedExpense, setSelectedExpense] = useState(null);
  const [detailsDialogVisible, setDetailsDialogVisible] = useState(false);
  const [deleteDialogVisible, setDeleteDialogVisible] = useState(false);

  const [customSettleAmount, setCustomSettleAmount] = useState('');

  const [settleType, setSettleType] = useState('total');

  const [addMemberLoading, setAddMemberLoading] = useState(false);
  const [bulkSettleLoading, setBulkSettleLoading] = useState(false); // loading for group-wide settle
  const [memberSettling, setMemberSettling] = useState(null); // uid currently being settled

  useEffect(() => {
    if (!groupId) return;

    const groupRef = doc(db, 'groups', groupId);

    const unsubscribeGroup = onSnapshot(groupRef, (groupDoc) => {
      if (!groupDoc.exists()) {
        setLoading(false);
        return;
      }

      const group = { id: groupDoc.id, ...groupDoc.data() };

      // Fetch expenses
      const expensesRef = collection(db, 'groups', groupId, 'expenses');
      const q = query(expensesRef, orderBy('createdAt', 'desc'));

      const unsubscribeExpenses = onSnapshot(q, (expensesSnap) => {
        const expenses = expensesSnap.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        }));

        group.expenses = expenses;

        setGroupData(group);
        setLoading(false);
      });

      // Cleanup for expenses listener
      return () => unsubscribeExpenses();
    });

    // Cleanup for group listener
    return () => unsubscribeGroup();
  }, [route.params?.id]);

  const { id, name, description, members = [], expenses = [] } = groupData || {};

  // Helper: Check if a member is fully settled across all expenses
  const isMemberFullySettled = (memberUid) => {
    if (!Array.isArray(expenses) || expenses.length === 0) return true;
    for (const e of expenses) {
      const share = e?.splitAmong?.find((m) => m.memberUid === memberUid);
      if (share) {
        const due = Number(share?.due) || 0;
        const yourShare = Number(share?.yourShare) || 0;
        const settled = Number(share?.settledAmount) || 0;
        if (due > 0 || yourShare > settled) return false;
      }
    }
    return true;
  };

  // Helper: Check if there is any pending balance specifically between current user and target member
  const hasPendingBetweenUs = (otherUid) => {
    if (!Array.isArray(filteredExpenses) || filteredExpenses.length === 0) return false;
    for (const e of filteredExpenses) {
      if (e.paidBy === currentUID) {
        const theirShare = e?.splitAmong?.find((m) => m.memberUid === otherUid);
        if (theirShare) {
          const due = Number(theirShare?.due) || 0;
          const yourShare = Number(theirShare?.yourShare) || 0;
          const settled = Number(theirShare?.settledAmount) || 0;
          if (due > 0 || yourShare > settled) return true; // they owe me
        }
      } else if (e.paidBy === otherUid) {
        const myShare = e?.splitAmong?.find((m) => m.memberUid === currentUID);
        if (myShare) {
          const due = Number(myShare?.due) || 0;
          const yourShare = Number(myShare?.yourShare) || 0;
          const settled = Number(myShare?.settledAmount) || 0;
          if (due > 0 || yourShare > settled) return true; // I owe them
        }
      }
    }
    return false;
  };

  // ---------- Filters ----------
  // modes: 'all' | 'current' | 'previous' | 'custom'
  const [filterMode, setFilterMode] = useState('current');
  const [customYear, setCustomYear] = useState(new Date().getFullYear());
  const [customMonth, setCustomMonth] = useState(new Date().getMonth() + 1); // 1-12
  const [showFilterModal, setShowFilterModal] = useState(false);
  const [showMonthPicker, setShowMonthPicker] = useState(false);

  // Compute min and max month bounds based on all group expenses
  const { minMonthDate, maxMonthDate } = useMemo(() => {
    const now = new Date();
    const max = new Date(now.getFullYear(), now.getMonth(), 1);
    if (!Array.isArray(expenses) || expenses.length === 0) {
      return { minMonthDate: undefined, maxMonthDate: max };
    }
    let min = null;
    for (const e of expenses) {
      const ts = e?.createdAt;
      const dt = ts?.toDate ? ts.toDate() : (ts?.seconds ? new Date(ts.seconds * 1000) : null);
      if (dt) min = min ? (dt < min ? dt : min) : dt;
    }
    const minStart = min ? new Date(min.getFullYear(), min.getMonth(), 1) : undefined;
    return { minMonthDate: minStart, maxMonthDate: max };
  }, [expenses]);

  // Helper to check if expense is in selected period
  const isInPeriod = (ts, mode, y, m) => {
    if (!ts?.seconds && !ts?.toDate) return false;
    const date = ts?.toDate ? ts.toDate() : new Date(ts.seconds * 1000);

    const now = new Date();
    const year = date.getFullYear();
    const month = date.getMonth() + 1; // 1-12

    if (mode === 'all') return true;
    if (mode === 'current') {
      const cy = now.getFullYear();
      const cm = now.getMonth() + 1;
      return year === cy && month === cm;
    }
    if (mode === 'previous') {
      const cmDate = new Date(now.getFullYear(), now.getMonth(), 1);
      const prev = new Date(cmDate);
      prev.setMonth(prev.getMonth() - 1);
      const py = prev.getFullYear();
      const pm = prev.getMonth() + 1;
      return year === py && month === pm;
    }
    if (mode === 'custom') {
      return year === Number(y) && month === Number(m);
    }
    return true;
  };

  // Memoized filtered expenses based on selected filter
  const filteredExpenses = useMemo(() => {
    if (!Array.isArray(expenses)) return [];
    return expenses.filter(e => isInPeriod(e.createdAt, filterMode, customYear, customMonth));
  }, [expenses, filterMode, customYear, customMonth]);

  const totalGroupSpend = filteredExpenses?.reduce((sum, e) => sum + (Number(e.amount) || 0), 0);

  const currentUID = auth.currentUser.uid;
  const currentUser = auth.currentUser;

  // Balances and member balances should also reflect filters where appropriate on the UI.

  // Industry-standard "You Spent":
  // - Money you fronted as payer (full amounts you paid)
  // - Plus amounts you actually settled to others (capped to your share)
  const youPaidOut = filteredExpenses?.reduce((sum, e) => {
    return sum + (e.paidBy === currentUID ? Number(e.amount) || 0 : 0);
  }, 0) || 0;

  const youSettledToOthers = filteredExpenses?.reduce((sum, e) => {
    if (e.paidBy === currentUID) return sum; // if you paid, don't count your own settled amount
    const share = e?.splitAmong?.find((m) => m.memberUid === currentUID);
    if (!share) return sum;
    const settled = Math.min(Number(share?.settledAmount) || 0, Number(share?.yourShare) || 0);
    return sum + settled;
  }, 0) || 0;

  const youSpent = (youPaidOut || 0) + (youSettledToOthers || 0);

  const yourShare =
    filteredExpenses?.reduce((sum, expense) => {
      const share = expense?.splitAmong?.find(m => m.memberUid === currentUID);
      return sum + (share?.yourShare || 0);
    }, 0) || 0;

  const youOwe = youOweBalance(filteredExpenses, currentUID);

  const memberBalances = (member) => {
    const source = Array.isArray(filteredExpenses) ? filteredExpenses : [];
    // How much I owe this member
    const iOwe = source?.reduce((sum, expense) => {
      if (expense.paidBy === member.uid) {
        const myShare = expense.splitAmong.find(m => m.memberUid === currentUID);
        return sum + (myShare?.due || 0);
      }
      return sum;
    }, 0) || 0;

    // How much this member owes me
    const owesMe = source?.reduce((sum, expense) => {
      if (expense.paidBy === currentUID) {
        const theirShare = expense.splitAmong.find(m => m.memberUid === member.uid);
        return sum + (theirShare?.due || 0);
      }
      return sum;
    }, 0) || 0;

    return owesMe - iOwe;
  };


  const handleAddMember = async (data) => {
    try {
      setAddMemberLoading(true);
      const email = data.email.toLowerCase().trim();

      // 1. Check if user exists
      const usersRef = collection(db, "users");
      const q = query(usersRef, where("email", "==", email));
      const querySnapshot = await getDocs(q);

      if (querySnapshot.empty) {
        Alert.alert("User not found", "This email is not registered on Squad Split.");
        setAddMemberLoading(false);
        return;
      }

      const userDoc = querySnapshot.docs[0];
      const userData = userDoc.data();

      // 2. Check if already a member
      const alreadyMember = members.some(m => m.uid === userDoc.id);
      if (alreadyMember) {
        Alert.alert("Already a member", "This user is already in the group.");
        setAddMemberLoading(false);
        return;
      }

      const newMember = {
        uid: userDoc.id,
        email: userData.email,
        displayName: userData.displayName || userData.email,
        joinedAt: new Date().toISOString(),
      };

      // 2. Generate unique activity ID
      const newActivityId = doc(collection(db, "dummy")).id;

      // 3. Build activity object
      const activity = {
        id: newActivityId,
        groupId: id,
        groupName: group.name,
        type: "member_added_to_group",
        description: `You added ${newMember.displayName} to the group ${group.groupName}`,
        createdBy: currentUser.uid,
        createdByName: currentUser.displayName || currentUser.email,
        targetUserId: newMember.uid,
        targetUserName: newMember.displayName,
        createdAt: new Date(),
      };

      // 4. Add member & activity
      const groupRef = doc(db, "groups", id);
      await updateDoc(groupRef, {
        members: arrayUnion(newMember),
        memberUIDs: arrayUnion(newMember.uid), // ✅ ensure memberUIDs stays in sync for querying
        lastActivity: serverTimestamp(),
        activities: arrayUnion(activity), // 👈 arrayUnion instead of overwrite
      });

      // Trigger push via activity subcollection
      await logGroupActivity(id, {
        type: 'member_added',
        memberUid: newMember.uid,
        memberName: newMember.displayName || newMember.email,
      });

      Alert.alert("Success", `${newMember.displayName} added to the group.`);
      reset();
      setShowAddMember(false);
    } catch (error) {
      console.error(error);
      Alert.alert("Error", "Failed to add member.");
    } finally {
      setAddMemberLoading(false);
    }
  };


  const getMemberName = (uid) => {
    const member = members?.find((m) => m.uid === uid);
    return member?.uid === currentUID ? "You" : member?.displayName || member?.email || 'Unknown';
  };

  if (loading || !groupData) {
    return <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: theme.colors.background }}>
      <ActivityIndicator size="large" color={theme.colors.primary} />
    </View>; // Optional: add loading indicator
  };

  const handleDeleteExpense = async () => {
    try {
      if (!selectedExpense) return;

      const groupId = route.params?.id;
      const expenseId = selectedExpense.id;

      // 1. Delete from subcollection
      const expenseRef = doc(db, 'groups', groupId, 'expenses', expenseId);
      await deleteDoc(expenseRef);

      // 2. Fetch the group doc
      const groupRef = doc(db, 'groups', groupId);
      const groupSnap = await getDoc(groupRef);

      if (groupSnap.exists()) {
        const groupData = groupSnap.data();
        const updatedMembers = groupData.members?.map((member) => {
          const updatedExpenses = (member.expenses || []).filter(
            (expense) => expense.id !== expenseId
          );
          return {
            ...member,
            expenses: updatedExpenses,
          };
        });

        // 3. Update the group doc with modified members array
        await updateDoc(groupRef, { members: updatedMembers, lastActivity: serverTimestamp() });
      }

      // 4. Cleanup
      setSelectedExpense(null);

    } catch (error) {
      Alert.alert('Error', 'Could not delete expense.');
    }
  };


  const formatTimestamp = (timestamp) => {
    if (!timestamp?.seconds) return '';
    const date = new Date(timestamp.seconds * 1000 + Math.floor(timestamp.nanoseconds / 1e6));

    return date.toLocaleDateString('en-US', {
      weekday: 'short', // "Mon"
      year: 'numeric',
      month: 'short',   // "Jul"
      day: 'numeric',   // "29"
    });
  };

  // Mark all expenses in this group as fully settled
  const handleSettleAllExpenses = async () => {
    try {
      if (!groupId) return;
      setBulkSettleLoading(true);

      const expensesRef = collection(db, 'groups', groupId, 'expenses');
      const snap = await getDocs(expensesRef);

      let updatedCount = 0;
      for (const expDoc of snap.docs) {
        const expData = expDoc.data();
        const updatedSplitAmong = (expData?.splitAmong || []).map((m) => ({
          ...m,
          settledAmount: Number(m.yourShare || 0),
          due: 0,
          isSettled: true,
        }));

        // Skip write if already settled
        const alreadySettled =
          (expData?.status === 'settled') &&
          updatedSplitAmong.every((m) => m.isSettled);
        if (!alreadySettled) {
          await updateDoc(expDoc.ref, {
            splitAmong: updatedSplitAmong,
            status: 'settled',
            updatedAt: serverTimestamp(),
          });
          updatedCount += 1;
        }
      }

      // Group activity (aggregate)
      const groupRef = doc(db, 'groups', groupId);
      await updateDoc(groupRef, {
        lastActivity: serverTimestamp(),
        activities: arrayUnion({
          id: doc(collection(db, 'dummy')).id,
          groupId,
          groupName: name,
          type: 'group_all_expenses_settled',
          count: updatedCount,
          description: updatedCount > 0
            ? `All expenses were marked settled (${updatedCount} updated)`
            : 'All expenses already settled',
          createdBy: currentUID,
          createdByName: auth.currentUser?.displayName || auth.currentUser?.email,
          createdAt: new Date(),
        }),
      });

      Alert.alert('Success', updatedCount > 0 ? 'All expenses settled.' : 'No changes. Already settled.');
    } catch (e) {
      console.error('handleSettleAllExpenses error', e);
      Alert.alert('Error', 'Failed to settle all expenses.');
    } finally {
      setBulkSettleLoading(false);
    }
  };

  // Settle dues between current user and the selected member across all expenses
  const handleSettleMemberAcrossExpenses = async (memberUid) => {
    try {
      if (!groupId || !memberUid) return;
      setMemberSettling(memberUid);

      const expensesRef = collection(db, 'groups', groupId, 'expenses');
      const snap = await getDocs(expensesRef);

      let updatedCount = 0;
      for (const expDoc of snap.docs) {
        const expData = expDoc.data();
        if (!Array.isArray(expData?.splitAmong)) continue;

        let changed = false;
        const updatedSplitAmong = expData.splitAmong.map((m) => {
          // If other member owes me in an expense I paid, mark their share settled
          if (expData.paidBy === currentUID && m.memberUid === memberUid) {
            const newSettled = Number(m.yourShare || 0);
            const wasSettled = Number(m.settledAmount || 0) >= newSettled;
            const updated = {
              ...m,
              settledAmount: newSettled,
              due: 0,
              isSettled: true,
            };
            if (!wasSettled) changed = true;
            return updated;
          }
          // If I owe them in an expense they paid, mark my share settled
          if (expData.paidBy === memberUid && m.memberUid === currentUID) {
            const newSettled = Number(m.yourShare || 0);
            const wasSettled = Number(m.settledAmount || 0) >= newSettled;
            const updated = {
              ...m,
              settledAmount: newSettled,
              due: 0,
              isSettled: true,
            };
            if (!wasSettled) changed = true;
            return updated;
          }
          return m;
        });

        if (changed) {
          const allSettledNow = updatedSplitAmong.every((m) => m.isSettled);
          await updateDoc(expDoc.ref, {
            splitAmong: updatedSplitAmong,
            status: allSettledNow ? 'settled' : 'pending',
            updatedAt: serverTimestamp(),
          });
          updatedCount += 1;
        }
      }

      const memberName = getMemberName(memberUid);
      const groupRef = doc(db, 'groups', groupId);
      await updateDoc(groupRef, {
        lastActivity: serverTimestamp(),
        activities: arrayUnion({
          id: doc(collection(db, 'dummy')).id,
          groupId,
          groupName: name,
          targetUserId: memberUid,
          targetUserName: memberName,
          type: 'member_all_expenses_settled',
          count: updatedCount,
          description: updatedCount > 0
            ? `All dues settled between you and ${memberName} across ${updatedCount} expense(s)`
            : `No pending dues found between you and ${memberName}`,
          createdBy: currentUID,
          createdByName: auth.currentUser?.displayName || auth.currentUser?.email,
          createdAt: new Date(),
        }),
      });

      Alert.alert('Success', updatedCount > 0 ? `Settled dues with ${memberName}.` : 'No changes.');
    } catch (e) {
      console.error('handleSettleMemberAcrossExpenses error', e);
      Alert.alert('Error', 'Failed to settle for this member.');
    } finally {
      setMemberSettling(null);
    }
  };

  const confirmSettleAll = () => {
    if (bulkSettleLoading) return;
    Alert.alert('Confirm', 'Settle all expenses for this group?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Settle All', style: 'destructive', onPress: handleSettleAllExpenses },
    ]);
  };

  const confirmSettleMember = (memberUid) => {
    if (memberSettling) return;
    const memberName = getMemberName(memberUid);
    Alert.alert('Confirm', `Mark all dues as settled for ${memberName}?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Settle', style: 'destructive', onPress: () => handleSettleMemberAcrossExpenses(memberUid) },
    ]);
  };

  const { height, width } = Dimensions.get('window');

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: theme.colors.background }]}>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false} showsHorizontalScrollIndicator={false}>
        {/* Header */}
        <Appbar.Header mode="small" position="sticky" style={{ backgroundColor: theme.colors.background, paddingLeft: 0, paddingHorizontal: 0, paddingRight: 0, paddingBottom: 20 }}>
          <Appbar.BackAction onPress={() => navigation.navigate('Main', { screen: 'Groups' })} />
          <Appbar.Content title="Group Details" />
          <Appbar.Action icon="cog-outline" iconColor='grey' onPress={() => navigation.navigate('Group Settings', { groupId })} />
        </Appbar.Header>

        {/* Group Balance */}
        <Card style={[styles.summaryCard, { backgroundColor: theme.colors.surface }]}>
          <Card.Content>

            {/* Group Name and Description */}
            <View style={styles.groupHeader}>
              <Text style={[styles.groupTitle, { color: theme.colors.primary }]}>
                {name}
              </Text>
              {description ? (
                <Text style={[styles.groupDescription, { color: theme.colors.text }]}>
                  {description}
                </Text>
              ) : null}
            </View>

            {/* Total Spent (Single Row with Amount Right Aligned) */}
            <View style={styles.totalSpentRow}>
              <View style={styles.headerRow}>
                <Text style={[styles.headerTitle, { color: theme.colors.text }]}>
                  Total Spent
                </Text>
              </View>
              <Text style={[styles.totalAmountRight, { color: theme.colors.text }]}>
                ₹ {totalGroupSpend}
              </Text>
            </View>

            {/* Divider Line */}
            <View style={styles.dividerLine} />

            {/* You Spent | You Owe / You Are Owed */}
            <View style={styles.detailsRow}>
              <View style={styles.detailItem}>
                <Text style={[styles.detailLabel, { color: theme.colors.text }]}>You Spent</Text>
                <Text style={styles.detailValue}>₹ {youSpent}</Text>
              </View>
              <View style={styles.detailItem}>
                <Text style={[styles.detailLabel, { color: theme.colors.text }]}>Your Share</Text>
                <Text style={styles.detailValue}>₹ {yourShare}</Text>
              </View>
              <View style={styles.detailItem}>
                <Text
                  style={[
                    styles.detailLabel,
                    {
                      color:
                        youOwe === 0
                          ? theme.colors.text
                          : youOwe < 0
                            ? theme.colors.error
                            : '#4CAF50',
                    },
                  ]}
                >
                  {youOwe === 0
                    ? 'Settled Up'
                    : youOwe < 0
                      ? 'You Owe'
                      : 'You Are Owed'}
                </Text>
                <Text
                  style={[
                    styles.detailValue,
                    {
                      color:
                        youOwe === 0
                          ? theme.colors.text
                          : youOwe < 0
                            ? theme.colors.error
                            : '#4CAF50',
                    },
                  ]}
                >
                  ₹ {Math.abs(youOwe)}
                </Text>
              </View>
            </View>
          </Card.Content>
        </Card>

        {/* Members */}
        <Card style={[styles.sectionCard, { backgroundColor: theme.colors.surface }]}>
          <Card.Title
            title="Members"
            style={{ paddingBottom: 0 }}
            titleStyle={[styles.sectionTitle, { color: theme.colors.text }]}
            left={() => (
              <MaterialCommunityIcons
                name="account-group-outline"
                style={{ alignSelf: 'center', marginLeft: -15 }}
                size={24}
                color={theme.colors.icon}
              />
            )}
            right={() => (
              <Button
                mode="text"
                onPress={() => setShowAddMember(true)}
                labelStyle={{ color: theme.colors.primary }}
                style={{marginRight: 5}}
              >
                Add Member
              </Button>
            )}
          />
          <Divider />

          {/* Scrollable member list with max height */}
          <View style={{ maxHeight: 350 }}>
            <ScrollView nestedScrollEnabled>
              <List.Section style={{ paddingLeft: 15, paddingRight: 15 }}>
                {members?.slice() // copy to avoid mutating original
                  .sort((a, b) => {
                    if (a.uid === auth.currentUser?.uid) return -1; // put current user first
                    if (b.uid === auth.currentUser?.uid) return 1;
                    return 0; // keep others unchanged
                  })?.map((member, index) => {
                    const isYou = member.uid === auth.currentUser?.uid;

                    const balance = memberBalances(member) || 0;
                    const display = {
                      text:
                        balance === 0
                          ? 'Settled up'
                          : balance > 0
                            ? `Owed ₹ ${balance}`
                            : `Owes ₹ ${Math.abs(balance)}`,
                      icon:
                        balance === 0
                          ? 'check-circle-outline'
                          : balance > 0
                            ? 'arrow-down-circle'
                            : 'arrow-up-circle',
                      color:
                        balance === 0
                          ? theme.colors.placeholder
                          : balance > 0
                            ? '#4CAF50'
                            : theme.colors.error,
                    };

                    return (
                      <List.Item
                        key={index}
                        title={isYou ? 'You' : member.displayName || member.email}
                        description={!isYou && display.text}
                        titleStyle={{ color: theme.colors.text }}
                        descriptionStyle={{ color: display.color }}
                        left={() => (
                          <Avatar.Text
                            size={32}
                            label={
                              member.displayName
                                ? member.displayName.charAt(0).toUpperCase()
                                : 'U'
                            }
                            style={{ backgroundColor: theme.colors.avatar, marginRight: 10 }}
                            color={theme.colors.onPrimary}
                          />
                        )}
                        right={() => (
                          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                            {!isYou && (
                              <Button
                                mode="text"
                                compact
                                loading={memberSettling === member.uid}
                                style={{ marginRight: -10 }}
                                disabled={memberSettling === member.uid || !filteredExpenses || filteredExpenses.length === 0 || !hasPendingBetweenUs(member.uid)}
                                onPress={() => confirmSettleMember(member.uid)}
                              >
                                Mark as Settled
                              </Button>
                            )}
                          </View>
                        )}
                        style={styles.listItem}
                      />
                    );
                  })}
              </List.Section>
            </ScrollView>
          </View>
        </Card>

        {/* Expenses */}
        <Card style={[styles.sectionCard, { backgroundColor: theme.colors.surface }]}>
          <Card.Title
            title="Expenses"
            titleStyle={[styles.sectionTitle, { color: theme.colors.text }]}
            left={(props) => (
              <MaterialCommunityIcons
                {...props}
                name="file-document-outline"
                size={24}
                color={theme.colors.icon}
                style={{ alignSelf: "center", marginLeft: -15 }}
              />
            )}
            right={() => {
              const allSettled = Array.isArray(filteredExpenses) && filteredExpenses.length > 0 && filteredExpenses.every(e => e.status === 'settled');
              return (
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <MonthFilter
                    expenses={expenses}
                    value={{ mode: filterMode, year: customYear, month: customMonth }}
                    onChange={(v) => {
                      setFilterMode(v.mode);
                      if (v.year) setCustomYear(v.year);
                      if (v.month) setCustomMonth(v.month);
                    }}
                    buttonLabel={formatFilterLabel({ mode: filterMode, year: customYear, month: customMonth }) || 'Filter'}
                  />
                  <Button
                    mode="text"
                    loading={bulkSettleLoading}
                    disabled={bulkSettleLoading || !filteredExpenses || filteredExpenses.length === 0 || allSettled}
                    onPress={confirmSettleAll}
                    style={{marginRight: 10}}
                  >
                    Settle All
                  </Button>
                </View>
              );
            }}
          />
          <Divider />

          <List.Section style={{ paddingLeft: 15, paddingRight: 15 }}>
            {filteredExpenses && filteredExpenses.length > 0 ? (
              filteredExpenses
                .slice(0, 5) // 👉 show only first 5
                .map((expense, index) => {
                  const isPaidByYou = expense?.paidBy === auth.currentUser?.uid;
                  const paidByName = isPaidByYou ? "You" : getMemberName(expense?.paidBy);

                  return (
                    <List.Item
                      key={index}
                      title={expense.title || "Untitled Expense"}
                      onPress={() => {
                        navigation.navigate("ExpenseDetails", { expense, members, groupId, groupName: name });
                      }}
                      description={() => (
                        <View>
                          {expense.notes ? (
                            <Text style={{ color: theme.colors.placeholder }} numberOfLines={1}>
                              {expense.notes}
                            </Text>
                          ) : null}
                          <Text style={{ color: theme.colors.placeholder }}>
                            ₹ {expense.amount} • Paid by {paidByName}
                          </Text>
                        </View>
                      )}
                      titleStyle={{ color: theme.colors.text }}
                      left={() => (
                        <MaterialCommunityIcons
                          name="receipt"
                          size={20}
                          color={theme.colors.icon}
                        />
                      )}
                      right={() => (
                        <View style={{ flexDirection: "row", alignItems: "center" }}>
                          <Text
                            style={{
                              color: expense.status === "settled" ? "green" : "orange",
                              marginRight: 4,
                            }}
                          >
                            {expense.status}
                          </Text>
                          <MaterialCommunityIcons
                            name="chevron-right"
                            size={24}
                            color={theme.colors.icon}
                          />
                        </View>
                      )}
                      style={styles.listItem}
                    />
                  );
                })
            ) : (
              <Text style={{ color: theme.colors.placeholder, padding: 10 }}>
                No expenses for selected filter
              </Text>
            )}
          </List.Section>

          <Card.Actions style={styles.sectionActions}>
            <Button
              mode="text"
              disabled={!expenses || expenses.length === 0}
              labelStyle={{ color: !expenses || expenses.length === 0 ? theme.colors.disabled : theme.colors.primary }}
              onPress={() =>
                navigation.navigate("AllExpenses", {
                  groupId,
                  members,
                  groupName: name,
                  initialFilter: { mode: filterMode, year: customYear, month: customMonth },
                })
              }
            >
              View All
            </Button>
          </Card.Actions>
        </Card>

        <Portal>
          <Modal visible={showAddMember} contentContainerStyle={{ backgroundColor: theme.colors.surface, margin: 20, padding: 20, borderRadius: 12 }}>
            <Text style={{ fontSize: 18, fontWeight: 'bold', marginBottom: 12, color: theme.colors.text }}>Add Member</Text>
            <CustomTextInput
              control={control}
              keyboardType="email-address"
              label="Email"
              name="email"
              autoCapitalize="none"
            />
            <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 10 }}>
              <Button onPress={() => setShowAddMember(false)} disabled={addMemberLoading}>Cancel</Button>
              <Button mode="contained" onPress={handleSubmit(handleAddMember)} disabled={addMemberLoading} loading={addMemberLoading}>Add</Button>
            </View>
          </Modal>
        </Portal>

        {/* Filter Modal */}
        <Portal>
          <Modal visible={showFilterModal} onDismiss={() => setShowFilterModal(false)} contentContainerStyle={{ backgroundColor: theme.colors.surface, margin: 20, padding: 20, borderRadius: 12 }}>
            <Text style={{ fontSize: 18, fontWeight: 'bold', marginBottom: 12, color: theme.colors.text }}>Filter Expenses</Text>

            <RadioButton.Group onValueChange={(v) => { setFilterMode(v); if (v === 'custom') setShowMonthPicker(true); }} value={filterMode}>
              <RadioButton.Item label="All time" value="all" />
              <RadioButton.Item label="Current month" value="current" />
              <RadioButton.Item label="Previous month" value="previous" />
              {/* <RadioButton.Item label="Custom month" value="custom" /> */}
            </RadioButton.Group>

            {filterMode === 'custom' && (
              <View style={{ marginTop: 8 }}>
                <Button mode="outlined" onPress={() => setShowMonthPicker(true)}>
                  {`Select Month: ${customYear}-${String(customMonth).padStart(2, '0')}`}
                </Button>
              </View>
            )}

            <View style={{ flexDirection: 'row', justifyContent: 'flex-end', marginTop: 16 }}>
              <Button onPress={() => setShowFilterModal(false)}>Close</Button>
            </View>
          </Modal>
        </Portal>

        {/* Custom Month-Year Picker Modal (JS-based) */}
        <Portal>
          <Modal visible={showMonthPicker} onDismiss={() => setShowMonthPicker(false)} contentContainerStyle={{ backgroundColor: theme.colors.surface, margin: 20, padding: 20, borderRadius: 12 }}>
            <Text style={{ fontSize: 16, fontWeight: '600', marginBottom: 8, color: theme.colors.text }}>Select Month</Text>

            {/* Wheel pickers */}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              {/* Year picker */}
              <View style={{ flex: 1, borderWidth: 1, borderColor: theme.colors.outline, borderRadius: 8 }}>
                <Picker
                  selectedValue={customYear}
                  onValueChange={(val) => setCustomYear(val)}
                  style={{ backgroundColor:"white" }}
                >
                  {(function() {
                    const years = [];
                    const minY = minMonthDate ? minMonthDate.getFullYear() : customYear - 10;
                    const maxY = maxMonthDate ? maxMonthDate.getFullYear() : customYear + 1;
                    for (let y = maxY; y >= minY; y--) years.push(y);
                    return years.map(y => (
                      <Picker.Item key={y} label={`${y}`} value={y} />
                    ));
                  })()}
                </Picker>
              </View>

              {/* Month picker */}
              <View style={{ flex: 1, borderWidth: 1, borderColor: theme.colors.outline, borderRadius: 8 }}>
                <Picker
                  selectedValue={customMonth}
                  onValueChange={(val) => setCustomMonth(val)}
                  dropdownIconColor="#444" // makes dropdown arrow theme-friendly
                >
                  {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => {
                    const thisDate = new Date(customYear, m - 1, 1);
                    const disabled =
                      (minMonthDate && thisDate < minMonthDate) ||
                      (maxMonthDate && thisDate > maxMonthDate);

                    return (
                      <Picker.Item
                        key={m}
                        label={new Date(2000, m - 1, 1).toLocaleString("en", { month: "long" })}
                        value={m}
                        color={disabled ? "#999" : "#000"} // grey out disabled items
                        enabled={!disabled} // disables selection
                      />
                    );
                  })}
                </Picker>
              </View>
            </View>

            <View style={{ flexDirection: 'row', justifyContent: 'flex-end', marginTop: 12 }}>
              <Button onPress={() => setShowMonthPicker(false)}>Done</Button>
            </View>
          </Modal>
        </Portal>

        <Portal>
          <Modal
            visible={detailsDialogVisible}
            contentContainerStyle={{
              backgroundColor: theme.colors.surface,
              // marginHorizontal: 10,
              padding: 15,
              height: height,
              width: width,
              // marginTop:-45,
              borderRadius: 12,
              elevation: 5,
              flex: 1,
              justifyContent: 'flex-start',
            }}
          >
            <View>
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  marginRight: -16,
                  marginLeft: -18
                }}
              >
                {/* Back Button */}
                <IconButton
                  icon="arrow-left"
                  size={24}
                  onPress={() => setDetailsDialogVisible(false)}
                  iconColor="grey"
                // style={{ marginLeft:-12 }}
                />

                {/* Right-side Buttons */}
                <View style={{ flexDirection: 'row' }}>
                  <IconButton
                    icon="pencil-outline"
                    size={20}
                    iconColor={theme.colors.outline}
                    onPress={() => {
                      setDetailsDialogVisible(false);
                      navigation.navigate('AddExpense', {
                        groupData,
                        expenseToEdit: selectedExpense,
                      });
                      // Open edit modal
                    }}
                  />
                  <IconButton
                    icon="trash-can-outline"
                    size={20}
                    iconColor={theme.colors.error}
                    onPress={() => {
                      // setDetailsDialogVisible(false);
                      setDeleteDialogVisible(true);
                    }}
                  />
                </View>
              </View>

              {/* Title + Action Buttons */}
              <View style={{ marginBottom: 12, paddingTop: 10, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <View style={{ flex: 1 }}>
                  <Text style={{
                    fontSize: 36,
                    fontWeight: 600,
                    color: theme.colors.onBackground,
                    marginBottom: selectedExpense?.notes ? 4 : 0,
                  }}>
                    {selectedExpense?.title || 'Expense Details'}
                  </Text>
                  {selectedExpense?.notes && (
                    <Text style={{
                      fontSize: 13,
                      color: "grey",
                      lineHeight: 18,
                    }}>
                      {selectedExpense.notes}
                    </Text>
                  )}
                </View>
              </View>
              <Divider />

              {/* Expense Info */}
              <View style={{ marginTop: 16, flexDirection: 'row', flexWrap: 'wrap' }}>
                {/* Total Amount */}
                <View style={{ width: '100%', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingBottom: 16 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <List.Icon icon="check-circle-outline" color="grey" style={{ margin: 0, marginRight: 8 }} />
                    <Text style={{ fontSize: 15, color: theme.colors.onBackground }}>Status</Text>
                  </View>
                  <Text style={{ fontSize: 15, fontWeight: '500', color: selectedExpense?.isSettled ? 'green' : 'orange' }}>
                    {selectedExpense?.isSettled ? 'Settled' : 'Pending'}
                  </Text>
                </View>

                {/* Amount */}
                <View style={{ width: '100%', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingBottom: 16 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <List.Icon icon="currency-inr" color="grey" style={{ margin: 0, marginRight: 8 }} />
                    <Text style={{ fontSize: 15, color: theme.colors.onBackground }}>Amount</Text>
                  </View>
                  <Text style={{ fontSize: 15, fontWeight: '500', color: theme.colors.onBackground }}>
                    ₹ {selectedExpense?.amount}
                  </Text>
                </View>

                {/* Paid By */}
                <View style={{ width: '100%', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingBottom: 16 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <List.Icon icon="account" color="grey" style={{ margin: 0, marginRight: 8 }} />
                    <Text style={{ fontSize: 15, color: theme.colors.onBackground }}>Paid by</Text>
                  </View>
                  <Text style={{ fontSize: 15, fontWeight: '500', color: theme.colors.onBackground }}>
                    {getMemberName(selectedExpense?.paidBy)}
                  </Text>
                </View>


                {/* Paid By */}
                <View style={{ width: '100%', flexDirection: 'row', alignItems: 'center', marginBottom: 8, justifyContent: 'space-between' }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <List.Icon icon="calendar" color="grey" style={{ margin: 0, marginRight: 8 }} />
                    <Text style={{ fontSize: 15, color: theme.colors.onBackground }}>Date</Text>
                  </View>
                  <Text style={{ fontSize: 15, fontWeight: '500', color: theme.colors.onBackground }}>
                    {formatTimestamp(selectedExpense?.createdAt)}
                  </Text>
                </View>

              </View>

              {/* Split Among Section */}
              {!!selectedExpense?.splitAmong?.length && (
                <View style={{ marginTop: 20 }}>
                  <Text
                    style={{
                      fontSize: 15,
                      fontWeight: '600',
                      color: theme.colors.onBackground,
                      marginBottom: 8,
                    }}
                  >
                    Split Among
                  </Text>

                  {/* Header */}
                  <View
                    style={{
                      flexDirection: 'row',
                      paddingVertical: 7,
                      borderBottomWidth: 1,
                      paddingTop: 10,
                      borderColor: theme.colors.outlineVariant,
                    }}
                  >
                    <Text style={{ flex: 2, fontWeight: 'bold', color: theme.colors.onBackground }}>
                      Member
                    </Text>
                    <Text style={{ flex: 1, fontWeight: 'bold', color: theme.colors.onBackground, textAlign: 'right' }}>
                      Share
                    </Text>
                    <Text style={{ flex: 1, fontWeight: 'bold', color: theme.colors.onBackground, textAlign: 'right' }}>
                      Paid
                    </Text>
                    <Text style={{ flex: 1, fontWeight: 'bold', color: theme.colors.onBackground, textAlign: 'right' }}>
                      Due
                    </Text>
                  </View>

                  {/* Member Rows */}
                  {selectedExpense?.splitAmong?.map((uid, index) => {
                    const memberName = getMemberName(uid);
                    const share = selectedExpense?.yourShare || 0;
                    const paid = selectedExpense?.settlements?.[uid] || 0;
                    const due = Math.max(share - paid, 0);
                    // const isYou = uid === currentUID;
                    const isPaidBy = uid === selectedExpense?.paidBy;

                    return (
                      <View
                        key={index}
                        style={{
                          flexDirection: 'row',
                          alignItems: 'center',
                          paddingVertical: 10,
                          borderBottomWidth: 0.5,
                          borderColor: theme.colors.outlineVariant,
                        }}
                      >
                        {/* Member Name */}
                        <View style={{ flex: 2, flexDirection: 'row', alignItems: 'center' }}>
                          <List.Icon icon="account" color="grey" style={{ margin: 0, marginRight: 6 }} />
                          <Text style={{ fontSize: 14, color: theme.colors.onBackground }}>
                            {memberName}
                          </Text>
                        </View>

                        {/* Share */}
                        <Text style={{ flex: 1, fontSize: 14, color: theme.colors.onBackground, textAlign: 'right' }}>
                          ₹ {share.toFixed(2)}
                        </Text>

                        {/* Paid */}
                        <Text style={{ flex: 1, fontSize: 14, color: paid > 0 ? 'green' : theme.colors.onBackground, textAlign: 'right' }}>
                          {isPaidBy ? "-" : `₹ ${paid.toFixed(2)}`}
                        </Text>

                        {/* Due */}
                        <Text style={{ flex: 1, fontSize: 14, color: isPaidBy ? "" : due > 0 ? 'red' : 'green', textAlign: 'right' }}>
                          {isPaidBy ? "-" : `₹ ${due.toFixed(2)}`}
                        </Text>
                      </View>
                    );
                  })}
                </View>
              )}

              <Text style={{ fontWeight: 'bold', fontSize: 15 }}>Settle Type</Text>
              <RadioButton.Group
                onValueChange={value => setSettleType(value)}
                value={settleType}
              >
                <RadioButton.Item label="Settle total share" value="total" />
                <RadioButton.Item label="Settle Custom Amount" value="custom" />
              </RadioButton.Group>

              {settleType === 'custom' && (
                <TextInput
                  label="Custom Amount"
                  value={customSettleAmount}
                  onChangeText={setCustomSettleAmount}
                  keyboardType="numeric"
                  mode="outlined"
                  style={{ marginBottom: 12 }}
                />
              )}

              <View style={{ paddingTop: 32 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <Button mode="outlined" onPress={() => markExpenseAsSettled(parseFloat(customSettleAmount))}>
                    Settle Custom
                  </Button>
                  <Button mode="contained" onPress={() => markExpenseAsSettled(selectedExpense?.amount)}>
                    Settle Full
                  </Button>
                </View>
              </View>

            </View>
          </Modal>
        </Portal>

        <Portal>
          <Modal
            visible={deleteDialogVisible}
            contentContainerStyle={styles.modalContainer}
          >
            <Text style={styles.modalTitle}>Delete Expense</Text>
            <Text style={styles.modalMessage}>Are you sure you want to delete this expense?</Text>

            <View style={styles.modalActions}>
              <Button
                mode="text"
                onPress={() => setDeleteDialogVisible(false)}
                style={styles.button}
              >
                Cancel
              </Button>
              <Button
                mode="contained"
                onPress={async () => {
                  await handleDeleteExpense();
                  setDeleteDialogVisible(false);
                }}
                buttonColor="#e53935"
                textColor="white"
                style={styles.button}
              >
                Delete
              </Button>
            </View>
          </Modal>
        </Portal>
      </ScrollView>

      <FAB
        style={[styles.fab, { backgroundColor: theme.colors.primary }]}
        icon="plus"
        color="white"
        label="Add Expense"
        onPress={() => navigation.navigate('AddExpense', { groupData })}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    padding: 10,
    paddingTop: 0,
    paddingBottom: 100,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  groupNameTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    flex: 1,
    textAlign: 'center',
  },
  summaryCard: {
    borderRadius: 12,
    marginBottom: 20,
    elevation: 4,
  },
  balanceContent: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  summaryLabel: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 10,
    textAlign: 'center',
  },
  balanceRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  summaryAmount: {
    fontSize: 20,
    fontWeight: 'bold',
  },
  summaryStatsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 16,
    width: '100%',
  },
  summaryStatBox: {
    alignItems: 'center',
    flex: 1,
  },
  statLabel: {
    fontSize: 14,
    fontWeight: '500',
    marginBottom: 4,
    textAlign: 'center',
  },
  statAmount: {
    fontSize: 16,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  sectionCard: {
    borderRadius: 12,
    marginBottom: 20,
    elevation: 3,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginLeft: -20,
    verticalAlign: 'middle',
  },
  listItem: {
    paddingVertical: 4,
    paddingRight: 6
  },
  sectionActions: {
    justifyContent: 'flex-end',
    paddingRight: 10,
  },
  fab: {
    position: 'absolute',
    right: 20,
    bottom: 20,
    elevation: 6,
  },
  totalSpent: {
    fontSize: 26,
    fontWeight: 'bold',
    marginTop: 6,
    textAlign: 'center',
  },

  subStatsBox: {
    marginTop: 16,
    alignItems: 'center',
  },

  subStatText: {
    fontSize: 16,
    fontWeight: '500',
    marginTop: 4,
  },

  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
    justifyContent: 'center',
  },

  headerTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 8,
  },

  totalAmount: {
    fontSize: 26,
    fontWeight: 'bold',
    marginBottom: 12,
    justifyContent: 'center',
    textAlign: 'center',
  },

  dividerLine: {
    height: 1,
    backgroundColor: '#ddd',
    marginVertical: 6,
  },

  detailsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 10,
    paddingTop: 10
  },

  detailItem: {
    flex: 1,
    alignItems: 'center',
  },

  detailLabel: {
    fontSize: 14,
    fontWeight: '500',
    marginBottom: 4,
  },

  detailValue: {
    fontSize: 16,
    fontWeight: 'bold',
  },

  totalSpentRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },

  totalAmountRight: {
    fontSize: 38,
    fontWeight: 'bold',
  },
  groupHeader: {
    marginBottom: 28,
  },

  groupTitle: {
    fontSize: 32,
    fontWeight: 'bold',
  },

  groupDescription: {
    fontSize: 14,
    marginTop: 4,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContainer: {
    backgroundColor: 'white',
    padding: 24,
    marginHorizontal: 20,
    borderRadius: 12,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 8,
    color: '#333',
  },
  modalMessage: {
    fontSize: 16,
    marginBottom: 20,
    color: '#555',
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
  },
  button: {
    minWidth: 90,
  },
});