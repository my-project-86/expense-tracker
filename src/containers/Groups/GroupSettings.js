// src/screens/GroupSettingsScreen.js
import React, { useState, useEffect } from 'react';
import {
  View, StyleSheet, ScrollView, Alert,
  KeyboardAvoidingView, Platform
} from 'react-native';
import {
  Text, useTheme, Button, IconButton,
  ActivityIndicator, Portal, Modal, Avatar, Appbar
} from 'react-native-paper';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useForm } from 'react-hook-form';
import { yupResolver } from '@hookform/resolvers/yup';
import * as yup from 'yup';

import { auth, db } from '../../firebaseConfig';
import {
  doc, getDoc, updateDoc, deleteDoc, collection,
  query, where, getDocs, arrayUnion, arrayRemove, serverTimestamp
} from 'firebase/firestore';

import CustomTextInput from '../../components/react-hook-form/CustomTextInput';
import { logGroupActivity } from '../../utils/activity';

// --- Validation Schemas ---
const editGroupSchema = yup.object().shape({
  groupName: yup.string().required('Group name is required.').min(3).max(50),
  groupDescription: yup.string().max(200),
});

const addMemberSchema = yup.object().shape({
  memberEmail: yup.string().required("Email is required.")
    .matches(
      /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i,
      "Invalid email format."
    ),
});

// --- Utility: create activity objects ---
const createActivityObjectsFromChanges = (groupId, oldData, newData, currentUser) => {
  const activities = [];

  // Group renamed
  if (oldData.name !== newData.name) {
    activities.push({
      type: "group_renamed",
      oldName: oldData.name,
      newName: newData.name,
      groupId,
      groupName: newData.name,
      createdAt: new Date(),
      createdBy: currentUser.uid,
      createdByName: currentUser.displayName || currentUser.email,
    });
  }

  // Description updated
  if (oldData.description !== newData.description) {
    activities.push({
      type: "group_description_updated",
      newDescription: newData.description,
      groupId,
      groupName: newData.name,
      createdAt: new Date(),
      createdBy: currentUser.uid,
      createdByName: currentUser.displayName || currentUser.email,
    });
  }

  // Members added
  const membersAdded = newData.members.filter(
    (m) => !oldData.members.find((om) => om.uid === m.uid)
  );
  membersAdded.forEach((m) => {
    activities.push({
      type: "member_added_to_group",
      targetUserId: m.uid,
      targetUserName: m.displayName || m.email,
      groupId,
      groupName: newData.name,
      createdAt: new Date(),
      createdBy: currentUser.uid,
      createdByName: currentUser.displayName || currentUser.email,
    });
  });

  // Members removed
  const membersRemoved = oldData.members.filter(
    (om) => !newData.members.find((m) => m.uid === om.uid)
  );
  membersRemoved.forEach((m) => {
    activities.push({
      type: "member_removed_from_group",
      targetUserId: m.uid,
      targetUserName: m.displayName || m.email,
      groupId,
      groupName: newData.name,
      createdAt: new Date(),
      createdBy: currentUser.uid,
      createdByName: currentUser.displayName || currentUser.email,
    });
  });

  return activities;
};

export default function GroupSettingsScreen() {
  const theme = useTheme();
  const navigation = useNavigation();
  const route = useRoute();

  const { groupId } = route.params || {};
  const currentUser = auth.currentUser;

  const [loading, setLoading] = useState(true);
  const [savingDetails, setSavingDetails] = useState(false);
  const [addMemberLoading, setAddMemberLoading] = useState(false);
  const [removeMemberLoadingUid, setRemoveMemberLoadingUid] = useState(null);
  const [deleteGroupLoading, setDeleteGroupLoading] = useState(false);
  const [groupData, setGroupData] = useState(null);
  const [showAddMemberModal, setShowAddMemberModal] = useState(false);
  const [foundUser, setFoundUser] = useState(null);
  const [localMembers, setLocalMembers] = useState([]);
  const [leaveLoading, setLeaveLoading] = useState(false);

  const {
    control, handleSubmit, formState: { errors }, reset
  } = useForm({
    resolver: yupResolver(editGroupSchema),
    defaultValues: { groupName: '', groupDescription: '' },
  });

  const {
    control: addMemberControl, handleSubmit: handleAddMemberSubmit,
    reset: resetAddMemberForm,
    setError: setAddMemberError
  } = useForm({
    resolver: yupResolver(addMemberSchema),
    defaultValues: { memberEmail: '' },
  });

  useEffect(() => {
    const fetchGroupData = async () => {
      if (!groupId) {
        Alert.alert('Error', 'Group ID not found.');
        navigation.goBack();
        return;
      }
      setLoading(true);
      try {
        const groupRef = doc(db, 'groups', groupId);
        const snapshot = await getDoc(groupRef);
        if (snapshot.exists()) {
          const data = snapshot.data();
          setGroupData(data);
          setLocalMembers(data.members || []);
          reset({ groupName: data.name, groupDescription: data.description });
        } else {
          Alert.alert('Error', 'Group not found.');
          navigation.goBack();
        }
      } catch (err) {
        Alert.alert('Error', 'Failed to fetch group data.');
      } finally {
        setLoading(false);
      }
    };
    fetchGroupData();
  }, [groupId, navigation, reset]);

  const onUpdateGroupDetails = async (formData) => {
    if (!groupData) return;

    setSavingDetails(true);
    try {
      const groupRef = doc(db, "groups", groupId);

      const newGroupData = {
        name: formData.groupName,
        description: formData.groupDescription,
        members: localMembers,
      };

      // Fetch current group data
      const snap = await getDoc(groupRef);
      if (!snap.exists()) throw new Error("Group not found");

      const currentGroup = snap.data();
      let updatedActivities = currentGroup.activities || [];

      // Detect changes -> create activities
      const newActivities = createActivityObjectsFromChanges(
        groupId,
        groupData,
        newGroupData,
        currentUser
      );

      // If group name changed, update all past activities
      if (
        newGroupData.name &&
        newGroupData.name !== currentGroup.name
      ) {
        updatedActivities = updatedActivities.map((act) => ({
          ...act,
          groupName: newGroupData.name,
        }));
      }

      // Append new activities
      updatedActivities = [...updatedActivities, ...newActivities];

      // Update Firestore
      await updateDoc(groupRef, {
        ...newGroupData,
        memberUIDs: (newGroupData.members || []).map(m => m.uid), // ✅ keep in sync for array-contains query
        updatedAt: serverTimestamp(),
        activities: updatedActivities,
      });

      // Fire notifications for each new activity
      for (const act of newActivities) {
        if (act.type === 'group_renamed') {
          await logGroupActivity(groupId, { type: 'group_renamed', newName: act.newName });
        } else if (act.type === 'member_added_to_group') {
          await logGroupActivity(groupId, { type: 'member_added', memberUid: act.targetUserId, memberName: act.targetUserName });
        } else if (act.type === 'member_removed_from_group') {
          await logGroupActivity(groupId, { type: 'member_removed', memberUid: act.targetUserId, memberName: act.targetUserName });
        }
      }

      // Update local state
      setGroupData((prev) => ({ ...prev, ...newGroupData }));

      navigation.goBack();
      Alert.alert("Success", "Group updated successfully.");
    } catch (err) {
      Alert.alert("Error", err.message || "Update failed.");
    } finally {
      setSavingDetails(false);
    }
  };

  const searchUserByEmail = async ({ memberEmail }) => {
    setAddMemberLoading(true);
    setFoundUser(null);
    try {
      const usersRef = collection(db, 'users');
      const q = query(usersRef, where('email', '==', memberEmail.trim().toLowerCase()));
      const snap = await getDocs(q);
      if (!snap.empty) {
        const userDoc = snap.docs[0];
        const userData = userDoc.data();
        const isMember = localMembers.some(m => m.uid === userDoc.id);
        if (isMember) {
          setAddMemberError('memberEmail', { message: 'User is already a member.' });
        } else {
          setFoundUser({
            uid: userDoc.id,
            email: userData.email,
            displayName: userData.displayName || userData.email,
          });
        }
      } else {
        setAddMemberError('memberEmail', { message: 'No user found with this email.' });
      }
    } catch (err) {
      Alert.alert('Error', 'Search failed.');
    } finally {
      setAddMemberLoading(false);
    }
  };

  const addFoundUserToGroup = () => {
    if (!foundUser) return;
    setLocalMembers(prev => [...prev, foundUser]);
    Alert.alert('Staged', 'Member added. Click Save Details to update.');
    resetAddMemberForm();
    setFoundUser(null);
    setShowAddMemberModal(false);
  };

  const removeMember = (member) => {
    if (member.uid === groupData.ownerId) {
      Alert.alert('Cannot Remove', 'Owner cannot be removed.');
      return;
    }
    if (localMembers.length <= 1) {
      Alert.alert('Cannot Remove', 'Group must have at least one member.');
      return;
    }
    setRemoveMemberLoadingUid(member.uid);
    setTimeout(() => {
      setLocalMembers(prev => prev.filter(m => m.uid !== member.uid));
      setRemoveMemberLoadingUid(null);
      Alert.alert('Staged', 'Member removed. Click Save Details to update.');
    }, 600);
  };

  const handleDeleteGroup = () => {
    if (!currentUser) return;

    if (currentUser.uid !== groupData.ownerId) {
      Alert.alert('Permission Denied', 'Only the owner can delete the group.');
      return;
    }

    Alert.alert(
      'Delete Group',
      `Delete "${groupData.name}" permanently?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            setDeleteGroupLoading(true);
            try {
              const groupRef = doc(db, 'groups', groupId);

              // -----------------------
              // 1️⃣ Delete expenses subcollection
              // -----------------------
              const expensesSnapshot = await getDocs(collection(groupRef, 'expenses'));
              for (const expenseDoc of expensesSnapshot.docs) {
                await deleteDoc(expenseDoc.ref);
              }

              // -----------------------
              // 2️⃣ Delete activities subcollection
              // -----------------------
              const activitiesSnapshot = await getDocs(collection(groupRef, 'activities'));
              for (const activityDoc of activitiesSnapshot.docs) {
                await deleteDoc(activityDoc.ref);
              }

              // -----------------------
              // 3️⃣ Delete the group document itself
              // -----------------------
              await deleteDoc(groupRef);

              Alert.alert('Deleted', 'Group has been deleted.');
              navigation.navigate('Groups', { deletedGroupId: groupId });
            } catch (err) {
              console.error('Error deleting group:', err);
              Alert.alert('Error', err.message || 'Failed to delete the group.');
            } finally {
              setDeleteGroupLoading(false);
            }
          },
        },
      ],
      { cancelable: true }
    );
  };

  // --- UI Render ---
  if (loading) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: theme.colors.background }]}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
        <Text style={{ marginTop: 10 }}>Loading group settings...</Text>
      </View>
    );
  }

  if (!groupData) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: theme.colors.background }]}>
        <Text style={{ color: theme.colors.error }}>Group data could not be loaded.</Text>
        <Button mode="contained" onPress={() => navigation.goBack()} style={{ marginTop: 20 }}>
          Go Back
        </Button>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={[styles.keyboardAvoidingContainer, { backgroundColor: theme.colors.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <Appbar.Header
        mode="small"
        style={{ backgroundColor: theme.colors.background }}
      >
        <Appbar.BackAction onPress={() => navigation.goBack()} />
        <Appbar.Content title={`Settings for ${groupData.name}`} />
      </Appbar.Header>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false} nestedScrollEnabled>
        <View style={[styles.sectionContainer, { backgroundColor: theme.colors.surface }]}>
          <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>Group Details</Text>
          <CustomTextInput
            control={control}
            name="groupName"
            label="Group Name"
            icon="format-list-bulleted"
            autoCapitalize="words"
            error={errors.groupName}
            disabled={savingDetails}
          />
          <CustomTextInput
            control={control}
            name="groupDescription"
            label="Description (Optional)"
            icon="text-box-outline"
            multiline
            numberOfLines={3}
            error={errors.groupDescription}
            disabled={savingDetails}
          />

          <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>Members</Text>
          {localMembers.length > 0 ? (
            localMembers?.slice() // copy to avoid mutating original
              .sort((a, b) => {
                if (a.uid === auth.currentUser?.uid) return -1; // put current user first
                if (b.uid === auth.currentUser?.uid) return 1;
                return 0; // keep others unchanged
              }).map((item) => (
                <View key={item.uid} style={[styles.memberItem, { borderBottomColor: theme.colors.backdrop }]}>
                  <Avatar.Text
                    size={32}
                    label={item.displayName ? item.displayName.charAt(0).toUpperCase() : 'U'}
                    style={{ backgroundColor: "#4CAF50", marginRight: 10 }}
                    color={theme.colors.onPrimary}
                  />
                  <Text style={[styles.memberName, { color: theme.colors.text }]}>
                    {item.displayName || item.email}
                    {item.uid === groupData.ownerId && ' (Owner)'}
                    {item.uid === currentUser?.uid && ' (You)'}
                  </Text>
                  {item.uid !== currentUser?.uid && (
                    <IconButton
                      icon="account-remove"
                      iconColor="grey"
                      size={24}
                      onPress={() => removeMember(item)}
                      disabled={removeMemberLoadingUid === item.uid || savingDetails}
                      style={styles.removeMemberIcon}
                    />
                  )}
                  {removeMemberLoadingUid === item.uid && (
                    <ActivityIndicator size={20} color={theme.colors.error} style={{ marginLeft: 8 }} />
                  )}
                </View>
              ))
          ) : (
            <Text style={[styles.emptyListText, { color: theme.colors.placeholder }]}>
              No members in this group.
            </Text>
          )}

          <Button
            mode="outlined"
            onPress={() => {
              resetAddMemberForm();
              setFoundUser(null);
              setShowAddMemberModal(true);
            }}
            style={[{ borderColor: theme.colors.primary }]}
            labelStyle={{ color: theme.colors.primary }}
            icon="account-plus-outline"
            disabled={savingDetails}
          >
            Add Member
          </Button>
          <Button
            mode="contained"
            onPress={handleSubmit(onUpdateGroupDetails)}
            loading={savingDetails}
            disabled={savingDetails}
            style={[{ backgroundColor: theme.colors.primary , marginTop: 20 }]}
            labelStyle={styles.saveButtonLabel}
            icon="content-save-outline"
          >
            Save Details
          </Button>
        </View>
         {/* Leave group button section */}
        {currentUser?.uid !== groupData?.ownerId &&
          <View style={[styles.sectionContainer, { backgroundColor: theme.colors.surface }]}
          >
            <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>Leave Group</Text>
            <Button
              mode="contained"
              icon="exit-to-app"
              style={{ backgroundColor: theme.colors.error }}
              loading={leaveLoading}
              disabled={leaveLoading || currentUser?.uid === groupData.ownerId}
              onPress={async () => {
                if (!currentUser || !groupId) return;

                // Owner cannot leave
                if (currentUser.uid === groupData.ownerId) {
                  Alert.alert('Cannot Leave', 'Owner cannot leave the group. Transfer ownership or delete the group.');
                  return;
                }

                // Confirm
                Alert.alert(
                  'Leave Group',
                  `Are you sure you want to leave "${groupData.name}"?`,
                  [
                    { text: 'Cancel', style: 'cancel' },
                    {
                      text: 'Leave',
                      style: 'destructive',
                      onPress: async () => {
                        try {
                          setLeaveLoading(true);

                          // Fetch expenses to compute pending balances
                          const expensesSnap = await getDocs(collection(db, 'groups', groupId, 'expenses'));
                          const expenses = expensesSnap.docs.map(d => ({ id: d.id, ...d.data() }));
                          const me = currentUser.uid;

                          // Check any unsettled amounts involving me
                          const hasPending = expenses.some(e => {
                            const split = Array.isArray(e.splitAmong) ? e.splitAmong : [];
                            // If I paid, others may owe me
                            if (e.paidBy === me) {
                              return split.some(m => m.memberUid !== me && ((Number(m.due) || 0) > 0 || (Number(m.yourShare) || 0) > (Number(m.settledAmount) || 0)));
                            }
                            // If someone else paid, I may owe them
                            const myShare = split.find(m => m.memberUid === me);
                            if (myShare) {
                              const due = Number(myShare?.due) || 0;
                              const yourShare = Number(myShare?.yourShare) || 0;
                              const settled = Number(myShare?.settledAmount) || 0;
                              if (due > 0 || yourShare > settled) return true;
                            }
                            return false;
                          });

                          if (hasPending) {
                            Alert.alert('Cannot Leave', 'You have pending balances in this group. Please settle up before leaving.');
                            return;
                          }

                          // Safe to leave: remove from members and memberUIDs
                          const groupRef = doc(db, 'groups', groupId);
                          const meMemberObj = (groupData.members || []).find(m => m.uid === me) || { uid: me };
                          await updateDoc(groupRef, {
                            members: arrayRemove(meMemberObj),
                            memberUIDs: arrayRemove(me),
                            updatedAt: serverTimestamp(),
                          });

                          // Log activity for notifications
                          await logGroupActivity(groupId, { type: 'member_removed', memberUid: me, memberName: currentUser.displayName || currentUser.email });

                          Alert.alert('Left Group', 'You have left the group.');
                          navigation.navigate('Groups');
                        } catch (err) {
                          Alert.alert('Error', err?.message || 'Failed to leave the group.');
                        } finally {
                          setLeaveLoading(false);
                        }
                      }
                    }
                  ]
                );
              }}
            >
              Leave Group
            </Button>
            {currentUser?.uid === groupData.ownerId && (
              <Text style={{ marginTop: 8, color: theme.colors.error }}>
                Owners cannot leave. Transfer ownership or delete the group.
              </Text>
            )}
          </View>
        }

        {currentUser?.uid === groupData.ownerId && (
          <View style={[styles.sectionContainer, { backgroundColor: theme.colors.surface }]}>
            <Text style={[styles.sectionTitle, { color: theme.colors.error }]}>Delete Permanently</Text>
            <Button
              mode="contained"
              onPress={handleDeleteGroup}
              loading={deleteGroupLoading}
              disabled={deleteGroupLoading}
              style={[{ backgroundColor: theme.colors.error }]}
              labelStyle={styles.deleteButtonLabel}
              icon="delete-forever"
            >
              Delete Group
            </Button>
          </View>
        )}
      </ScrollView>

      <Portal>
        <Modal visible={showAddMemberModal} contentContainerStyle={{ backgroundColor: theme.colors.surface, margin: 20, padding: 20, borderRadius: 12 }}>
          <Text style={{ fontSize: 18, fontWeight: 'bold', marginBottom: 12, color: theme.colors.text }}>Add Member</Text>
          <CustomTextInput
            control={addMemberControl}
            keyboardType="email-address"
            label="Email"
            name="memberEmail"
            autoCapitalize="none"
            disabled={addMemberLoading}
          />
          {foundUser && (
            <View style={{ marginTop: 16, marginBottom: 8 }}>
              <Text style={{ color: theme.colors.text, fontSize: 16 }}>
                Found: {foundUser.displayName || foundUser.email}
              </Text>
              <Button
                mode="contained"
                onPress={addFoundUserToGroup}
                style={{ marginTop: 10, backgroundColor: theme.colors.primary }}
                disabled={addMemberLoading}
              >
                Add to Group
              </Button>
            </View>
          )}
          <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 10, marginTop: 12 }}>
            <Button onPress={() => setShowAddMemberModal(false)} disabled={addMemberLoading}>Cancel</Button>
            <Button mode="contained" onPress={handleAddMemberSubmit(searchUserByEmail)} disabled={addMemberLoading} loading={addMemberLoading}>Search</Button>
          </View>
        </Modal>
      </Portal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  keyboardAvoidingContainer: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 10,
    paddingTop: Platform.OS === 'android' ? 40 : 20,
    paddingBottom: 15,
    // borderBottomWidth: 1,
    borderBottomColor: '#ccc',
  },
  backButton: {
    // Styles for the back button
  },
  placeholderIcon: {
    width: 24, // Match icon size for alignment
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    flex: 1,
    textAlign: 'center',
  },
  scrollContent: {
    flexGrow: 1,
    padding: 10,
    paddingBottom: 40, // Ensure space at bottom
  },
  sectionContainer: {
    borderRadius: 12,
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 3,
    marginBottom: 20,
    padding: 15,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 15,
    paddingBottom: 10,
  },
  saveButton: {
    width: '100%',
    paddingVertical: 8,
    borderRadius: 8,
    marginTop: 20,
    elevation: 3,
  },
  saveButtonLabel: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#fff',
  },
  memberItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderColor: 'rgba(0,0,0,0.1)', // Subtle separator
    marginBottom: 5,
  },
  memberName: {
    marginLeft: 10,
    fontSize: 16,
    flex: 1,
  },
  removeMemberIcon: {
    marginLeft: 'auto',
  },
  addMemberButton: {
    marginTop: 15,
    paddingVertical: 5,
  },
  deleteButtonLabel: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#fff',
  },
  // --- Modal Styles ---
  modalContent: {
    marginHorizontal: 20,
    borderRadius: 12,
    padding: 20,
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    maxHeight: '80%',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 20,
    textAlign: 'center',
  },
  modalActionButton: {
    width: '100%',
    paddingVertical: 8,
    borderRadius: 8,
    marginTop: 10,
  },
  modalButtonLabel: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#fff',
  },
  foundUserContainer: {
    marginTop: 20,
    padding: 15,
    borderWidth: 1,
    borderRadius: 8,
    alignItems: 'center',
  },
  foundUserText: {
    fontSize: 16,
    marginBottom: 10,
  },
  modalButtonContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: 20,
  },
  modalButton: {
    flex: 1,
    marginHorizontal: 5,
    maxWidth: '50%',
  },
  emptyListText: {
    textAlign: 'center',
    marginTop: 10,
    fontStyle: 'italic',
  }
});
