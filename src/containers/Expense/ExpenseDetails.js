import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, StyleSheet, Alert } from 'react-native';
import { Appbar, List, Divider, Button, Portal, Modal, useTheme, ActivityIndicator } from 'react-native-paper';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useForm } from 'react-hook-form';
import { yupResolver } from '@hookform/resolvers/yup';
import * as yup from 'yup';
import { doc, getDoc, updateDoc, deleteDoc, serverTimestamp, arrayUnion, collection } from 'firebase/firestore';
import { db, auth } from '../../firebaseConfig';
import CustomTextInput from '../../components/react-hook-form/CustomTextInput';
import CustomSelectField from '../../components/react-hook-form/CustomSelectField';
import { logGroupActivity } from '../../utils/activity';

// Schema with dynamic max validation based on selected member's share
const createValidationSchema = (getShare) =>
  yup.object().shape({
    settledBy: yup
      .string()
      .required('Please select who settled the expense'),
    customSettleAmount: yup
      .string()
      .required('Amount is required')
      .test(
        'max-share',
        'Amount cannot be more than member’s share',
        function (value) {
          const { settledBy } = this.parent;
          if (!settledBy || value == null) return true;
          const maxShare = getShare(settledBy);
          return value <= maxShare;
        }
      ),
  });

export default function ExpenseDetails() {
  const theme = useTheme();
  const navigation = useNavigation();
  const route = useRoute();
  const { expense, members, groupId, groupName } = route.params || {};

  const [expenseData, setExpenseData] = useState(expense);

  const currentUID = auth.currentUser.uid;
  const [deleteDialogVisible, setDeleteDialogVisible] = useState(false);

  const getMemberName = (uid) => {
    const member = members?.find((m) => m.uid === uid);
    return member?.uid === currentUID ? 'You' : member?.displayName || member?.email || 'Unknown';
  };

  const formatTimestamp = (timestamp) => {
    if (!timestamp?.seconds) return '';
    const date = new Date(timestamp.seconds * 1000 + Math.floor(timestamp.nanoseconds / 1e6));
    return date.toLocaleDateString('en-US', {
      weekday: 'short',
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  const [visible, setVisible] = useState(false);
  const [loading, setLoading] = useState(false); // ✅ loading state for settle action
  const [deleteLoading, setDeleteLoading] = useState(false);

  const showModal = () => setVisible(true);
  const hideModal = () => {
    setVisible(false);
    reset();
  };

  const getMemberShare = (uid) => {
    const currentExpense = expenseData?.splitAmong?.find(member => member.memberUid === uid)?.due;
    return currentExpense || 0;
  };

  const formMethods = useForm({
    resolver: yupResolver(createValidationSchema(getMemberShare)),
    defaultValues: {
      settledBy: '',
      customSettleAmount: '',
    },
  });

  const { control, watch, setValue, handleSubmit, reset, clearErrors } = formMethods;

  const settledBy = watch('settledBy');
  const customSettleAmount = watch('customSettleAmount');

  // Pre-fill share amount when a member is selected
  useEffect(() => {
    if (settledBy) {
      const share = getMemberShare(settledBy);
      setValue('customSettleAmount', share.toString());
      clearErrors("customSettleAmount");
    }
  }, [settledBy]);

  // Firestore update function
  const markExpenseAsSettled = async (data) => {
    const { settledBy, customSettleAmount } = data || {};

    try {
      if (!groupId || !expenseData?.id) {
        throw new Error("Missing groupId or expenseId");
      }

      setLoading(true); // ✅ show loading

      const expenseRef = doc(db, "groups", groupId, "expenses", expenseData.id);
      const expenseSnap = await getDoc(expenseRef);

      if (!expenseSnap.exists()) {
        throw new Error("Expense not found");
      }

      const expense = expenseSnap.data();

      // update the splitAmong array
      const updatedSplitAmong = expense.splitAmong.map((member) => {
        if (member.memberUid === settledBy) {
          const newSettledAmount =
            Number(member?.settledAmount || 0) + Number(customSettleAmount);

          const remainingDue = Number(member?.yourShare) - newSettledAmount;

          return {
            ...member,
            settledAmount: newSettledAmount,
            due: remainingDue,
            isSettled: remainingDue === 0,
          };
        }
        return member;
      });

      // check if all members are settled
      const allSettled = updatedSplitAmong.every((m) => m.isSettled);

      // write back only the updated fields in the expense doc
      await updateDoc(expenseRef, {
        splitAmong: updatedSplitAmong,
        status: allSettled ? "settled" : "pending", // ✅ update expense status
        updatedAt: serverTimestamp(),
      });

      console.log("expense", expense)

      console.log("Updated SplitAmong:", {
          id: doc(collection(db, "dummy")).id, // random id
          groupId,
          groupName: groupName, // fallback
          expenseId: expenseData.id,
          expenseName: expense.expenseName || expenseData?.title,
          amount: customSettleAmount,
          settledBy,
          splitAmong: updatedSplitAmong,
          type: allSettled ? "expense_settled" : "expense_partially_settled",
          description: allSettled
            ? `"${expense.expenseName || expenseData?.title}" was fully settled`
            : `"${customSettleAmount}" settled for "${expense.expenseName || expenseData?.title}"`,
          createdBy: auth.currentUser?.uid,
          createdByName: auth.currentUser?.displayName || auth.currentUser?.email,
          createdAt: new Date(),
        });

      // update group's lastActivity + activities
      const groupRef = doc(db, "groups", groupId);
      await updateDoc(groupRef, {
        lastActivity: serverTimestamp(),
        activities: arrayUnion({
          id: doc(collection(db, "dummy")).id, // random id
          groupId,
          groupName: groupName, // fallback
          expenseId: expenseData.id,
          expenseName: expense.expenseName || expenseData?.title,
          amount: customSettleAmount,
          settledBy,
          splitAmong: updatedSplitAmong,
          type: allSettled ? "expense_settled" : "expense_partially_settled",
          description: allSettled
            ? `"${expense.expenseName || expenseData?.title}" was fully settled`
            : `"${customSettleAmount}" settled for "${expense.expenseName || expenseData?.title}"`,
          createdBy: auth.currentUser?.uid,
          createdByName: auth.currentUser?.displayName || auth.currentUser?.email,
          createdAt: new Date(),
        }),
      });
      // Trigger push via activity subcollection
      await logGroupActivity(groupId, {
        type: allSettled ? "expense_settled" : "expense_partially_settled",
        expenseId: expenseData.id,
        expenseTitle: expense.expenseName || expenseData?.title,
        amount: Number(customSettleAmount),
      });

      // update local state
      setExpenseData((prev) => ({
        ...prev,
        splitAmong: updatedSplitAmong,
        status: allSettled ? "settled" : "pending",
      }));

      hideModal();
    } catch (err) {
      console.error("Error marking expense as settled:", err);
    } finally {
      setLoading(false); // ✅ stop loading
    }
  };

  const markExpenseFullySettled = async () => {
    try {
      if (!groupId || !expenseData?.id) {
        throw new Error("Missing groupId or expenseId");
      }

      setLoading(true); // show loading

      const expenseRef = doc(db, "groups", groupId, "expenses", expenseData.id);
      const expenseSnap = await getDoc(expenseRef);

      if (!expenseSnap.exists()) {
        throw new Error("Expense not found");
      }

      const expense = expenseSnap.data();

      // mark all members as fully settled
      const updatedSplitAmong = expense?.splitAmong?.map((member) => ({
        ...member,
        settledAmount: Number(member.yourShare || 0),
        due: 0,
        isSettled: true,
      }));

      // update expense in Firestore
      await updateDoc(expenseRef, {
        splitAmong: updatedSplitAmong,
        status: "settled",
        updatedAt: serverTimestamp(),
      });

      const groupRef = doc(db, "groups", groupId);

      // add activity log for settlement
      await updateDoc(groupRef, {
        lastActivity: serverTimestamp(),
        activities: arrayUnion({
          id: doc(collection(db, "dummy")).id, // generates random id
          groupId,
          expenseId: expenseData.id,
          expenseName: expense.title,
          amount: expense.amount,
          splitAmong: updatedSplitAmong,
          type: "expense_settled",
          description: `"${expense.title}" was marked as fully settled`,
          createdBy: auth.currentUser?.uid,
          createdByName:
            auth.currentUser?.displayName || auth.currentUser?.email,
          createdAt: new Date(),
        }),
      });
      // Trigger push via activity subcollection
      await logGroupActivity(groupId, {
        type: "expense_settled",
        expenseId: expenseData.id,
        expenseTitle: expense.title,
        amount: Number(expense.amount),
      });

      // update local state
      setExpenseData((prev) => ({
        ...prev,
        splitAmong: updatedSplitAmong,
        status: "settled",
      }));
    } catch (err) {
      console.error("Error marking expense fully settled:", err);
    } finally {
      setLoading(false); // stop loading
    }
  };

  const handleDeleteExpense = async () => {
    try {
      if (!expenseData) return;
      const expenseId = expenseData.id;

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

        // 3. Add a delete activity
        await updateDoc(groupRef, {
          members: updatedMembers,
          lastActivity: serverTimestamp(),
          activities: arrayUnion({
            id: doc(collection(db, 'dummy')).id,
            expenseId: expenseId,
            amount: expenseData.amount,
            groupId: groupId,
            expenseName: expenseData.title,
            groupName: groupData.name,
            type: 'expense_deleted',
            description: `"${expenseData.title}" was deleted from "${groupData.name}"`,
            createdBy: currentUID,
            createdByName: auth.currentUser.displayName || auth.currentUser.email,
            createdAt: new Date(),
          }),
        });
        // Trigger push via activity subcollection
        await logGroupActivity(groupId, {
          type: 'expense_deleted',
          expenseId: expenseId,
          expenseTitle: expenseData.title,
        });
      }

      navigation.goBack();

    } catch (error) {
      Alert.alert('Error', error.message || 'Could not delete expense.');
    }
  };


  return (
    <ScrollView contentContainerStyle={{ backgroundColor: theme.colors.surface }}>
      <Appbar.Header mode="small">
        <Appbar.BackAction onPress={() => navigation.goBack()} />
        <Appbar.Content title="Expense Details" />
        <Appbar.Action
          icon="pencil-outline"
          color="grey"
          onPress={() => {
            navigation.navigate('AddExpense', { groupData: { id: groupId, members }, expenseToEdit: expenseData });
          }}
        />
        <Appbar.Action icon="trash-can-outline" iconColor={theme.colors.error} onPress={() => { setDeleteDialogVisible(true) }} />
      </Appbar.Header>

      <View style={{ padding: 15, paddingTop: 0 }}>
        <Text style={{ fontSize: 36, fontWeight: '600', color: theme.colors.onBackground }}>
          {expenseData?.title || 'Expense Details'}
        </Text>
        {expenseData?.notes && <Text style={{ fontSize: 13, color: 'grey', lineHeight: 18 }}>{expenseData.notes}</Text>}
        <Divider style={{ marginVertical: 16 }} />

        {[{ icon: 'check-circle-outline', label: 'Status', value: expenseData?.status === "settled" ? 'Settled' : 'Pending', valueColor: expenseData?.status === "settled" ? 'green' : 'orange' },
        { icon: 'currency-inr', label: 'Amount', value: `₹${expenseData?.amount}`, valueColor: theme.colors.onBackground },
        { icon: 'account', label: 'Paid by', value: getMemberName(expenseData?.paidBy), valueColor: theme.colors.onBackground },
        { icon: 'calendar', label: 'Date', value: formatTimestamp(expenseData?.createdAt), valueColor: theme.colors.onBackground }]
          .map(({ icon, label, value, valueColor }) => (
            <View key={label} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingBottom: 16 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <List.Icon icon={icon} color="grey" style={{ marginRight: 8 }} />
                <Text style={{ fontSize: 15, color: theme.colors.onBackground }}>{label}</Text>
              </View>
              <Text style={{ fontSize: 15, fontWeight: '500', color: valueColor }}>{value}</Text>
            </View>
          ))}

        {!!expenseData?.splitAmong?.length && (
          <View style={{ marginTop: 20 }}>
            <Text style={{ fontSize: 15, fontWeight: '600', marginBottom: 8, color: theme.colors.text }}>Split Among</Text>
            <View style={{ flexDirection: 'row', paddingVertical: 7, borderBottomWidth: 1, borderColor: theme.colors.outlineVariant }}>
              <Text style={{ flex: 2, fontWeight: 'bold', color: theme.colors.text }}>Member</Text>
              <Text style={{ flex: 1, fontWeight: 'bold', textAlign: 'right', color: theme.colors.text }}>Share</Text>
              <Text style={{ flex: 1, fontWeight: 'bold', textAlign: 'right', color: theme.colors.text }}>Paid</Text>
              <Text style={{ flex: 1, fontWeight: 'bold', textAlign: 'right', color: theme.colors.text }}>Due</Text>
            </View>
            {expenseData?.splitAmong?.map((uid, index) => {
              const memberName = getMemberName(uid.memberUid);
              const isPaidBy = uid.memberUid === expenseData?.paidBy;

              return (
                <View key={index} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 0.5, borderColor: theme.colors.outlineVariant }}>
                  <View style={{ flex: 2, flexDirection: 'row', alignItems: 'center' }}>
                    <List.Icon icon="account" color="grey" style={{ marginRight: 6 }} />
                    <Text style={{ fontSize: 14, color: theme.colors.text }}>{memberName}</Text>
                  </View>
                  <Text style={{ flex: 1, textAlign: 'right', color: theme.colors.text }}>₹{uid.yourShare}</Text>
                  <Text style={{ flex: 1, textAlign: 'right', color: uid.settledAmount > 0 ? 'green' : theme.colors.onBackground }}>
                    {isPaidBy ? '-' : `₹ ${uid.settledAmount || 0}`}
                  </Text>
                  <Text style={{ flex: 1, textAlign: 'right', color: isPaidBy ? theme.colors.text : uid.due > 0 ? 'red' : 'green' }}>
                    {isPaidBy ? '-' : `₹ ${uid.due || 0}`}
                  </Text>
                </View>
              );
            })}
          </View>
        )}

        <View style={{ marginTop: 30, flexDirection: "row", justifyContent: "space-between" }}>
          {/* Settle Partial Button */}
          <Button
            mode="outlined"
            onPress={showModal}
            disabled={expenseData?.status === "settled"} // disable if already settled
            style={{ flex: 1, marginRight: 8 }}
          >
            {expenseData?.status === "settled" ? "Already Settled" : "Settle Partial"}
          </Button>

          {/* Mark as Settled Button */}
          <Button
            mode="contained"
            onPress={markExpenseFullySettled} // 👉 you need to define this handler
            disabled={expenseData?.status === "settled"} // also disable if already settled
            style={{ flex: 1, marginLeft: 8 }}
          >
            Mark as Settled
          </Button>
        </View>

      </View>

      <Portal>
        <Modal
          visible={visible}
          contentContainerStyle={{
            backgroundColor: theme.colors.surface,
            borderRadius: 8,
            marginHorizontal: 20,
            padding: 20,
          }}
        >
          <Text style={{ color: theme.colors.text, fontSize: 24, fontWeight: 'bold', marginBottom: 16 }}>
            Settle Expense
          </Text>

          <ScrollView contentContainerStyle={{ paddingBottom: 30 }}>
            <CustomSelectField
              control={control}
              name="settledBy"
              label="Settled By"
              options={members.filter(m => m.uid !== expenseData?.paidBy).map(m => ({
                label: getMemberName(m.uid),
                value: m.uid,
              }))}
            />
            <CustomTextInput
              control={control}
              name="customSettleAmount"
              label="Amount"
              keyboardType="numeric"
            />
          </ScrollView>

          <View style={{ flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center' }}>
            <Button onPress={hideModal} style={{ marginRight: 8 }}>Cancel</Button>
            <Button
              mode="contained"
              onPress={handleSubmit(markExpenseAsSettled)}
              disabled={loading} // ✅ disable while loading
            >
              {loading ? (
                <ActivityIndicator animating={true} color="white" size="small" />
              ) : Number(customSettleAmount) === getMemberShare(settledBy)
                ? 'Settle Full Share'
                : 'Settle Partial Amount'}
            </Button>
          </View>
        </Modal>
      </Portal>

      <Portal>
        <Modal
          visible={deleteDialogVisible}
          contentContainerStyle={[styles.modalContainer, {backgroundColor: theme.colors.surface}]}
        >
          <Text style={[styles.modalTitle, {color: theme.colors.text}]}>Delete Expense</Text>
          <Text style={[styles.modalMessage, {color: theme.colors.text}]}>Are you sure you want to delete this expense?</Text>

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
                try {
                  setDeleteLoading(true); // ✅ start loading
                  await handleDeleteExpense();
                  setDeleteDialogVisible(false);
                } catch (e) {
                  console.error(e);
                } finally {
                  setDeleteLoading(false); // ✅ stop loading
                }
              }}
              disabled={deleteLoading} // ✅ disable while loading
              buttonColor="#e53935"
              textColor="white"
              style={styles.button}
            >
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center" }}>
                <Text style={{ color: "white", fontWeight: "bold" }}>Delete</Text>
                {deleteLoading && (
                  <ActivityIndicator
                    animating={true}
                    color="white"
                    size="small"
                    style={{ marginLeft: 8 }}
                  />
                )}
              </View>
            </Button>
          </View>
        </Modal>
      </Portal>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  modalContainer: {
    padding: 24,
    marginHorizontal: 20,
    borderRadius: 12,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  modalMessage: {
    fontSize: 16,
    marginBottom: 20,
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
