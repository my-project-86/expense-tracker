import React, { useState, useEffect } from 'react';
import {
  View,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  Alert,
  TouchableOpacity
} from 'react-native';
import {
  Button,
  Text,
  useTheme,
  Appbar,
} from 'react-native-paper';
import { useForm, useWatch } from 'react-hook-form';
import * as yup from 'yup';
import { yupResolver } from '@hookform/resolvers/yup';
import {
  setDoc,
  collection,
  arrayUnion,
  serverTimestamp,
  doc,
  updateDoc,
  getDoc,
} from 'firebase/firestore';
import { useNavigation, useRoute } from '@react-navigation/native';
import { db, auth } from '../../firebaseConfig';
import CustomTextInput from '../../components/react-hook-form/CustomTextInput';
import CustomSelectField from '../../components/react-hook-form/CustomSelectField';
import { logGroupActivity } from '../../utils/activity';

const schema = yup.object().shape({
  title: yup.string().required('Title is required.'),
  amount: yup
    .number()
    .required('Amount is required.')
    .typeError('Amount must be a number')
    .positive('Amount must be greater than 0'),
  notes: yup.string(),
  splitAmong: yup.array().min(1, 'Select at least one person to split with.'),
  paidBy: yup.string().required('Paid By is required.'),
});

export default function AddExpense() {
  const theme = useTheme();
  const route = useRoute();
  const navigation = useNavigation();

  const currentUID = auth.currentUser.uid;
  const { groupData, expenseToEdit } = route.params || {};
  const { id, members = [] } = groupData || {};
  const { title, amount, notes, splitAmong, paidBy } = expenseToEdit || {};

  const [loading, setLoading] = useState(false);

  const {
    control,
    handleSubmit,
    reset,
    setValue,
  } = useForm({
    resolver: yupResolver(schema),
    defaultValues: {
      title: title || '',
      amount: amount?.toString() || '',
      notes: notes || '',
      splitAmong: splitAmong?.map((uid) => uid.memberUid) || [],
      paidBy: paidBy || '',
    },
  });

  const memberOptions = members
    ?.sort((a, b) => (a.uid === currentUID ? -1 : b.uid === currentUID ? 1 : 0))
    .map((member) => ({
      label: member.uid === currentUID ? 'You' : member.displayName,
      value: member.uid,
    }));



  // 👀 Watch selected members dynamically
  const selectedMembers = useWatch({ control, name: 'splitAmong' });
  const currentAmount = useWatch({ control, name: 'amount' });
  // State for custom amounts
  const [customAmounts, setCustomAmounts] = useState({});
  console.log("customAmounts", customAmounts)
  const [customShareError, setCustomShareError] = useState('');

  // State for adjust remaining button disablement
  const [isAdjustDisabled, setIsAdjustDisabled] = useState(true);

  // Helper to calculate equal shares
  const calculateEqualShares = (amount, members) => {
    const parsedAmount = parseInt(amount, 10);
    if (!parsedAmount || parsedAmount <= 0 || members.length === 0) {
      const result = {};
      members.forEach((uid) => {
        result[uid] = 0;
      });
      return result;
    }

    const baseShare = Math.floor(parsedAmount / members.length); // distribute base
    let remainder = parsedAmount - baseShare * members.length;   // distribute remainder
    const result = {};

    members.forEach((uid, index) => {
      // distribute remainder one by one
      let share = baseShare;
      if (remainder > 0) {
        share += 1;
        remainder -= 1;
      }
      result[uid] = share;
    });

    return result;
  };


  // Track default shares for current amount/members
  const [defaultShares, setDefaultShares] = useState({});
  useEffect(() => {
    // Always recalculate default shares for current amount and members
    setDefaultShares(calculateEqualShares(currentAmount, selectedMembers));
  }, [selectedMembers, currentAmount]);

  // Prefill custom amounts when editing expense
  useEffect(() => {
    if (expenseToEdit?.splitAmong) {
      const amounts = {};
      expenseToEdit.splitAmong.forEach((m) => {
        amounts[m.memberUid] = Number(m.yourShare) || 0;
      });
      setCustomAmounts(amounts);
      setCustomShareError('');
    }
  }, [expenseToEdit]);

  // Ensure customAmounts always has keys for all selected members
  useEffect(() => {
    if (selectedMembers?.length > 0) {
      setCustomAmounts((prev) => {
        const updated = { ...prev };
        selectedMembers.forEach((uid) => {
          if (updated[uid] === undefined) {
            updated[uid] = calculateEqualShares(currentAmount, selectedMembers)[uid];
          }
        });
        // Remove keys for deselected members
        Object.keys(updated).forEach((uid) => {
          if (!selectedMembers.includes(uid)) {
            delete updated[uid];
          }
        });
        return updated;
      });
    }
  }, [selectedMembers, currentAmount]);

  const [isAmountEdited, setIsAmountEdited] = useState(false);


  // Update customAmounts when amount or selectedMembers change (only if not editing and not already set)
  useEffect(() => {
    if ((!expenseToEdit || Number(currentAmount) !== Number(expenseToEdit?.amount)) && selectedMembers?.length > 0) {
      setCustomAmounts(calculateEqualShares(control?._formValues?.amount, selectedMembers));
      setCustomShareError('');
    }
  }, [selectedMembers, control?._formValues?.amount, currentAmount, expenseToEdit]);

  // Handler for custom share change
  const handleCustomAmountChange = (uid, value) => {
    const newVal = value === '' ? 0 : parseFloat(value);
    let updated = { ...customAmounts, [uid]: newVal };
    setCustomAmounts(updated);
    setValue(uid, newVal.toString(), { shouldValidate: true });
    // Validate sum
    const totalAmount = parseFloat(currentAmount) || 0;
    const sumShares = selectedMembers.reduce((sum, id) => sum + (parseFloat(updated[id]) || 0), 0);
    if (sumShares > totalAmount) {
      const excess = (sumShares - totalAmount).toFixed(2);
      setCustomShareError(`Assigned shares exceed total by ₹${excess}`);
    } else if (sumShares < totalAmount) {
      const remaining = (totalAmount - sumShares).toFixed(2);
      setCustomShareError(`₹${remaining} left to assign`);
    } else {
      setCustomShareError('');
    }
  };

  // Handler for split equally button
  const handleSplitEqually = () => {
    setCustomAmounts(calculateEqualShares(currentAmount, selectedMembers));
    setCustomShareError('');
  };

  // Handler for adjust remaining button
  const handleAdjustRemaining = () => {
    const totalAmount = parseFloat(currentAmount) || 0;
    if (!selectedMembers?.length) return;

    let assignedSum = 0;
    const manualUids = [];

    // Collect manually entered shares
    selectedMembers.forEach((id) => {
      const val = Number(customAmounts[id]);
      if (!isNaN(val) && val > 0) {
        assignedSum += val;
        manualUids.push(id);
      }
    });

    // Remaining members (no manual amount entered)
    const remainingUids = selectedMembers.filter((id) => !manualUids.includes(id));

    const remainingAmount = totalAmount - assignedSum;
    const perOther = remainingUids.length > 0 ? remainingAmount / remainingUids.length : 0;

    const updated = { ...customAmounts };

    console.log("remainingUids", remainingUids)
    // Assign adjusted values
    remainingUids.forEach((id) => {
      updated[id] = perOther >= 0 ? perOther : 0;

      setValue(id, updated[id].toString(), {
        shouldValidate: true,
        shouldDirty: true,
        shouldTouch: true,
      });
    });

    console.log("manualUids", manualUids)

    // ✅ Also push manual ones back into RHF so they don’t get reset
    manualUids.forEach((id) => {
      const val = Number(customAmounts[id]) || 0;
      console.log("id, val", id, val)
      setValue(id, val.toString(), {
        shouldValidate: true,
        shouldDirty: true,
        shouldTouch: true,
      });
    });

    setCustomAmounts(updated);
    setCustomShareError('');
  };



  // Disable adjust button if all shares are default
  useEffect(() => {
    const isAnyChanged = selectedMembers.some((id) => parseFloat(customAmounts[id]) !== parseFloat(defaultShares[id]));
    setIsAdjustDisabled(!isAnyChanged);
  }, [customAmounts, defaultShares, selectedMembers]);

  const onSubmit = async (data) => {
    // Prevent submit if custom share error exists
    if (customShareError) {
      Alert.alert('Error', customShareError);
      return;
    }
    try {
      setLoading(true);
      const expenseAmount = parseFloat(data.amount);
      const groupRef = doc(db, 'groups', id);
      const groupSnap = await getDoc(groupRef);
      if (!groupSnap.exists()) throw new Error('Group not found');
      const groupData = groupSnap.data();
      const splitAmongUids = data.splitAmong;
      // ✅ Calculate shares
      let splitAmongFinal = [];
      let totalAssigned = 0;
      splitAmongUids.forEach((uid, index) => {
        const isLast = index === splitAmongUids.length - 1;
        let rawShare = customAmounts[uid];
        let share = Number(rawShare);
        if (!isFinite(share)) share = 0;

        // Round off immediately (no decimals)
        share = Math.round(share);

        if (isLast) {
          // Ensure last member fixes rounding differences
          share = Math.round(Number(expenseAmount)) - totalAssigned;
          if (!isFinite(share)) share = 0;
        }

        totalAssigned += share;

        if (expenseToEdit) {
          const prevMember = expenseToEdit.splitAmong.find(m => m.memberUid === uid);

          splitAmongFinal.push({
            memberUid: String(uid),
            amount: Math.round(Number(expenseAmount)) || 0, // total (rounded)
            yourShare: share,

            // ✅ Settled Amount
            settledAmount: uid === data.paidBy
              ? share
              : (prevMember ? prevMember.settledAmount : 0),

            // ✅ Due
            due: uid === data.paidBy
              ? 0
              : share - (prevMember ? prevMember.settledAmount : 0),

            // ✅ Is Settled
            isSettled: uid === data.paidBy
              ? true
              : (share - (prevMember ? prevMember.settledAmount : 0)) <= 0,
          });

        } else {
          splitAmongFinal.push({
            memberUid: String(uid),
            amount: Math.round(Number(expenseAmount)) || 0, // total (rounded)
            yourShare: share,
            settledAmount: uid === data.paidBy ? share : 0,
            due: uid === data.paidBy ? 0 : share,
            isSettled: uid === data.paidBy ? true : false,
          });
        }
      });



      // Only keep valid form fields in data
      const { title, amount, notes, splitAmong, paidBy } = data;
      const cleanData = { title, amount, notes, splitAmong, paidBy };

      if (expenseToEdit) {
        // Update expense
        const expenseDocRef = doc(db, 'groups', id, 'expenses', expenseToEdit.id);

        await updateDoc(expenseDocRef, {
          id: expenseToEdit.id,
          ...cleanData,
          splitAmong: splitAmongFinal,
          status: splitAmongFinal.every((m) => m.isSettled) ? 'settled' : 'pending',
          amount: expenseAmount,
          updatedAt: serverTimestamp(),
        });

        // 👇 Track activity diffs
        const activityBase = {
          id: doc(collection(db, 'dummy')).id,
          groupId: id,
          groupName: groupData.name,
          expenseId: expenseToEdit.id,
          expenseName: expenseToEdit.title,
          createdBy: currentUID,
          createdAt: new Date(),
          createdByName: auth.currentUser.displayName || auth.currentUser.email,
        };

        let activityLogs = [];

        if (expenseToEdit.title !== data.title) {
          activityLogs.push({
            ...activityBase,
            type: "expense_title_updated",
            oldName: expenseToEdit.title,
            newName: data.title,
            description: `Expense renamed from "${expenseToEdit.title}" to "${data.title}"`,
          });
        }

        if (Number(expenseToEdit.amount) !== Number(data.amount)) {
          activityLogs.push({
            ...activityBase,
            type: "expense_amount_updated",
            oldAmount: expenseToEdit.amount,
            newAmount: Number(data.amount),
            description: `Amount changed from ₹${expenseToEdit.amount} to ₹${data.amount} for "${data.title}"`,
          });
        }

        if (expenseToEdit.paidBy !== data.paidBy) {
          const oldPaidBy = members.find(m => m.uid === expenseToEdit.paidBy)?.displayName || "Someone";
          const newPaidBy = members.find(m => m.uid === data.paidBy)?.displayName || "Someone";
          activityLogs.push({
            ...activityBase,
            type: "expense_paidBy_updated",
            oldPayer: oldPaidBy,
            newPayer: newPaidBy,
            description: `Payer changed from "${oldPaidBy}" to "${newPaidBy}" for "${data.title}"`,
          });
        }

        if (expenseToEdit.notes !== data.notes) {
          activityLogs.push({
            ...activityBase,
            type: "expense_notes_updated",
            description: `Notes updated for "${data.title}"`,
          });
        }

        // Compare members
        const oldMembers = expenseToEdit.splitAmong.map(m => m.memberUid);
        const newMembers = data.splitAmong;

        const addedMembers = newMembers.filter(uid => !oldMembers.includes(uid));
        const removedMembers = oldMembers.filter(uid => !newMembers.includes(uid));

        addedMembers.forEach(uid => {
          const name = members.find(m => m.uid === uid)?.displayName || uid;
          activityLogs.push({
            ...activityBase,
            type: "expense_member_added",
            targetUserName: name,
            description: `${name} added to "${data.title}"`,
          });
        });

        removedMembers.forEach(uid => {
          const name = members.find(m => m.uid === uid)?.displayName || uid;
          activityLogs.push({
            ...activityBase,
            type: "expense_member_removed",
            targetUserName: name,
            description: `${name} removed from "${data.title}"`,
          });
        });

        // Compare shares (optional — if you want fine-grained tracking)
        expenseToEdit.splitAmong.forEach(oldM => {
          const newM = splitAmongFinal.find(m => m.memberUid === oldM.memberUid);
          if (newM) {
            const oldShare = Number(oldM.yourShare) || 0;
            const newShare = Number(newM.yourShare) || 0;

            // Compare with fixed precision (avoid float mismatch)
            if (oldShare.toFixed(2) !== newShare.toFixed(2)) {
              const memberName = members.find(m => m.uid === oldM.memberUid)?.displayName || oldM.memberUid;
              activityLogs.push({
                ...activityBase,
                type: "expense_share_updated",
                targetUserName: memberName,
                oldShare,
                targetUserId: oldM.memberUid,
                newShare,
                description: `${memberName}'s share updated from ₹${oldShare} to ₹${newShare} in "${data.title}"`,
              });
            }
          }
        });


        // Push all activities
        if (activityLogs.length > 0) {
          await updateDoc(groupRef, {
            updatedAt: serverTimestamp(),
            lastActivity: serverTimestamp(),
            activities: arrayUnion(...activityLogs),
          });
          // Trigger push notifications for each activity
          for (const act of activityLogs) {
            await logGroupActivity(id, {
              type: act.type || 'expense_updated',
              expenseId: expenseToEdit.id,
              expenseTitle: data.title,
            });
          }
        }
      } else {
        // Add expense
        const expenseRef = doc(collection(db, 'groups', id, 'expenses'));
        const expenseId = expenseRef.id;

        await setDoc(expenseRef, {
          id: expenseId,
          ...cleanData,
          splitAmong: splitAmongFinal,
          amount: expenseAmount,
          status: splitAmongFinal.every((m) => m.isSettled) ? 'settled' : 'pending',
          createdBy: currentUID,
          createdAt: serverTimestamp(),
        });
        console.log("data", data)

        await updateDoc(groupRef, {
          updatedAt: serverTimestamp(),
          lastActivity: serverTimestamp(),
          activities: arrayUnion({
            id: doc(collection(db, 'dummy')).id,
            amount: expenseAmount,
            groupId: id,
            splitAmong: splitAmongFinal,
            paidBy: data.paidBy,
            expenseName: data.title,
            groupName: groupData.name,
            type: 'expense_added',
            description: `"${data.title}" added in "${groupData.name}"`,
            createdBy: currentUID,
            createdAt: new Date(),
            createdByName: auth.currentUser.displayName || auth.currentUser.email,
            paidByName: members.find(m => m.uid === data.paidBy)?.displayName || (data.paidBy === currentUID ? 'You' : data.paidBy),
          }),
        });
        // Trigger push notification via activity subcollection
        await logGroupActivity(id, {
          type: 'expense_added',
          expenseId: expenseId,
          expenseTitle: data.title,
          amount: Number(expenseAmount),
        });
      }

      navigation.goBack();
      reset();
    } catch (error) {
      Alert.alert('Error', error.message || 'Failed to process expense');
      console.log(error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.keyboardAvoidingContainer}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
        {/* AppBar */}
        <Appbar.Header mode="small" style={{ backgroundColor: theme.colors.background }}>
          <Appbar.BackAction onPress={() => navigation.goBack()} />
          <Appbar.Content title={expenseToEdit ? 'Edit Expense' : 'Add Expense'} />
        </Appbar.Header>

        <View style={styles.formContent}>
          <View style={styles.inputContainer}>
            <CustomTextInput
              control={control}
              name="title"
              label="Title"
              icon="text"
              disabled={loading}
            />
            <CustomTextInput
              control={control}
              name="amount"
              label="Amount"
              icon="currency-inr"
              keyboardType="numeric"
              disabled={loading}
            />
            <CustomTextInput
              control={control}
              name="notes"
              label="Notes"
              icon="note-outline"
              maxLength={100}
              multiline
              numberOfLines={3}
              disabled={loading}
            />
            <CustomSelectField
              control={control}
              name="splitAmong"
              label="Split Among"
              icon="account-multiple"
              maxSelected={10}
              options={memberOptions}
              multiple
              disabled={loading}
            />
            {/* ✅ Extra inputs for custom amounts per person */}
            {selectedMembers?.length > 0 && (
              <View>
                <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6 }}>
                  <Text style={{ fontWeight: '600', flex: 1 }}>Custom Shares</Text>
                  <TouchableOpacity
                    onPress={handleSplitEqually}
                    style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 6 }}
                  >
                    <Text style={{ fontWeight: '600', color: theme.colors.primary }}>Split Equally</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={handleAdjustRemaining}
                    style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 6 }}
                    disabled={isAdjustDisabled}
                  >
                    <Text style={{ fontWeight: '600', color: isAdjustDisabled ? '#aaa' : theme.colors.primary }}>
                      Adjust Remaining
                    </Text>
                  </TouchableOpacity>
                </View>

                {customShareError ? (
                  <Text style={{ color: 'red', marginBottom: 6 }}>{customShareError}</Text>
                ) : null}
                {selectedMembers?.map((uid, index) => {
                  const member = members.find((m) => m.uid === uid);
                  return (
                      <CustomTextInput
                        key={index}
                        control={control}
                        name={uid}
                        label={member?.uid === currentUID ? 'You' : member?.displayName}
                        value={customAmounts[uid]?.toString() || ''}
                        onChangeText={(val) => handleCustomAmountChange(uid, val)}
                        keyboardType="numeric"
                        disabled={loading}
                      />
                  );
                })}
              </View>
            )}

            <CustomSelectField
              control={control}
              name="paidBy"
              label="Paid By"
              icon="account"
              options={memberOptions}
              disabled={loading}
            />
          </View>

          <Button
            mode="contained"
            onPress={handleSubmit(onSubmit)}
            loading={loading}
            disabled={loading}
            style={[styles.submitButton, { backgroundColor: theme.colors.primary }]}
            labelStyle={styles.submitButtonLabel}
          >
            {expenseToEdit ? 'Update Expense' : 'Add Expense'}
          </Button>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  keyboardAvoidingContainer: {
    flex: 1,
  },
  container: {
    flex: 1,
  },
  formContent: {
    flex: 1,
    padding: 20,
  },
  inputContainer: {
    marginBottom: 24,
  },
  customAmountsContainer: {
    marginTop: 12,
    padding: 10,
    borderRadius: 8,
    backgroundColor: '#f7f7f7',
  },
  submitButton: {
    paddingVertical: 4,
    borderRadius: 8,
    elevation: 2,
  },
  submitButtonLabel: {
    fontSize: 18,
    fontWeight: 'bold',
  },
});
