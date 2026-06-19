// src/screens/CreateGroupScreen.js
import React, { useState, useEffect } from 'react';
import {
  View, ScrollView, Alert, StyleSheet, KeyboardAvoidingView, Platform
} from 'react-native';
import {
  Text, useTheme, Button, IconButton, Portal, Modal, ActivityIndicator, Avatar, Card
} from 'react-native-paper';
import { useNavigation } from '@react-navigation/native';
import { useForm, Controller } from 'react-hook-form';
import { yupResolver } from '@hookform/resolvers/yup';
import * as yup from 'yup';
import {
  auth, db
} from '../../firebaseConfig';
import {
  collection, query, where, getDocs, addDoc, serverTimestamp, doc
} from 'firebase/firestore';
import CustomTextInput from '../../components/react-hook-form/CustomTextInput';
import { logGroupActivity } from '../../utils/activity';

const createGroupSchema = yup.object().shape({
  groupName: yup.string().required('Group name is required').min(3).max(50),
  groupDescription: yup.string().max(200),
});
const addMemberSchema = yup.object().shape({
  memberEmail: yup.string().email('Invalid email').required('Email is required'),
});

export default function CreateGroupScreen() {
  const theme = useTheme();
  const navigation = useNavigation();
  const currentUser = auth.currentUser;

  const [loading, setLoading] = useState(false);
  const [showAddMemberModal, setShowAddMemberModal] = useState(false);
  const [searchingUser, setSearchingUser] = useState(false);
  const [membersToAdd, setMembersToAdd] = useState([]);

  useEffect(() => {
    resetAdd();
  }, [showAddMemberModal]);

  const {
    control, handleSubmit, reset, formState: { errors }
  } = useForm({
    resolver: yupResolver(createGroupSchema),
    mode: "onChange",
    defaultValues: { groupName: '', groupDescription: '' },
  });

  const {
    control: ctrlAdd, handleSubmit: submitAdd, reset: resetAdd,
    setError
  } = useForm({
    resolver: yupResolver(addMemberSchema), defaultValues: { memberEmail: '' },
  });

  useEffect(() => {
    if (currentUser && membersToAdd.length === 0) {
      setMembersToAdd([{
        uid: currentUser.uid,
        email: currentUser.email,
        displayName: currentUser.displayName
      }]);
    }
  }, [currentUser]);

  const searchUserByEmail = async (form) => {

    try {
      const usersRef = collection(db, 'users');
      const q = query(usersRef, where('email', '==', form.memberEmail.trim().toLowerCase()));
      const snap = await getDocs(q);
      if (snap.empty) throw new Error('No user found');

      const usr = snap.docs[0].data();
      if (usr.uid === currentUser.uid) {
        setError('memberEmail', { type: 'manual', message: 'You’re already in the group' });
      } else if (membersToAdd.some(m => m.uid === usr.uid)) {
        setError('memberEmail', { type: 'manual', message: 'User already added' });
      } else {
        setMembersToAdd(prev => [...prev, {
          uid: usr.uid, email: usr.email, displayName: usr.displayName
        }]);
        resetAdd();
        setShowAddMemberModal(false);
      }
      setSearchingUser(true);
      setError('memberEmail', { type: 'manual', message: '' });
    } catch {
      setError('memberEmail', { type: 'manual', message: 'User not found' });
    } finally {
      setSearchingUser(false);
    }
  };

  const getRandomColor = () => {
    const colors = [
      "#FF6F61", "#6B5B95", "#88B04B", "#FFA500", "#00BFFF",
      "#20B2AA", "#9370DB", "#FF4500", "#2E8B57",

    ];
    return colors[Math.floor(Math.random() * colors.length)];
  };

  const handleCreateGroup = async (form) => {
    if (loading) return;
    if (!currentUser) return;
    setLoading(true);

    try {
      const groupsRef = collection(db, 'groups');
      const q = query(groupsRef, where('name', '==', form.groupName.trim()));
      const snap = await getDocs(q);

      if (!snap.empty) {
        Alert.alert('Exists', 'A group with this name already exists');
        return;
      }

      const newActivityId = doc(collection(db, "groups")).id;

      const groupDocRef = await addDoc(groupsRef, {
        name: form.groupName.trim(),
        description: form.groupDescription.trim(),
        ownerId: currentUser.uid,
        members: membersToAdd,
        memberUIDs: membersToAdd.map((m) => m.uid), // ✅ Ensures query works
        groupColor: getRandomColor(),
        createdAt: serverTimestamp(),
        activities: [{ id: newActivityId, groupName: form.groupName.trim(), type: "group_created", description: `You created a group ${form.groupName.trim()}`, createdBy: currentUser.uid, createdAt: new Date(), createdByName: currentUser.displayName || currentUser.email }]
      });

      // Push notification via activity subcollection
      await logGroupActivity(groupDocRef.id, {
        type: 'group_created',
        newName: form.groupName.trim(),
      });

      // Alert.alert('Success', 'Group created');
      reset();
      setMembersToAdd([{ uid: currentUser.uid, email: currentUser.email }]);
      navigation.goBack();
    } catch (e) {
      console.error('Error creating group:', e.message);
      Alert.alert('Error', e.message || 'Failed to create group');
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={[styles.wrapper, { backgroundColor: theme.colors.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <Portal>
        <Modal visible={showAddMemberModal} contentContainerStyle={[styles.modal, { backgroundColor: theme.colors.surface }]}>
          <Text style={[styles.modalTitle, { color: theme.colors.text }]}>Add Member by Email</Text>
          <CustomTextInput
            control={ctrlAdd}
            name="memberEmail"
            label="Email"
            icon="email"
            type="email"
            autoCapitalize="none"
            disabled={searchingUser}
          />
          <Button
            mode="contained"
            loading={searchingUser}
            onPress={submitAdd(searchUserByEmail)}
            style={{ marginTop: 8, backgroundColor: theme.colors.primary }}
          >
            Search & Add
          </Button>
          <Button onPress={() => setShowAddMemberModal(false)} style={{ marginTop: 8 }}>
            Cancel
          </Button>
        </Modal>
      </Portal>

      <ScrollView contentContainerStyle={styles.container}>
        {/* Header */}
        <View style={[styles.header, { backgroundColor: theme.colors.background }]}>
          <IconButton icon="arrow-left" color={theme.colors.text} size={24} onPress={() => navigation.goBack()} />
          <Text style={[styles.headerTitle, { color: theme.colors.text }]}>Create Group</Text>
          <View style={{ width: 24 }} />
        </View>

        {/* Form */}
        <Card style={[styles.summaryCard, { backgroundColor: theme.colors.surface }]}>
          <Card.Content>
        <View style={styles.form}>
          <CustomTextInput
            control={control} name="groupName" label="Group Name"
            icon="format-list-bulleted" error={errors.groupName}
            disabled={loading}
          />
          <CustomTextInput
            control={control} name="groupDescription" label="Description (optional)"
            icon="text-box-outline" multiline numberOfLines={3}
            error={errors.groupDescription} disabled={loading}
          />

          <View style={styles.memberSection}>
            <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>Members</Text>

            {membersToAdd.map((member) => (
              <View key={member.uid} style={styles.memberRow}>
                <Avatar.Icon
                  size={32}
                  icon="account"
                  color={theme.colors.onPrimary}
                  style={{ backgroundColor: theme.colors.primary, marginRight: 8 }}
                />
                <Text style={[styles.memberText, { color: theme.colors.text, flex: 1 }]}>
                  {member.displayName || member.email}
                  {member.uid === currentUser.uid ? " (You)" : ""}
                </Text>
                {member.uid !== currentUser.uid && (
                  <IconButton
                    icon="close"
                    size={20}
                    color={theme.colors.error}
                    onPress={() =>
                      setMembersToAdd((prev) =>
                        prev.filter((m) => m.uid !== member.uid)
                      )
                    }
                  />
                )}
              </View>
            ))}

            <Button
              mode="outlined"
              onPress={() => setShowAddMemberModal(true)}
              disabled={loading}
              style={{
                marginTop: 12,
                borderColor: theme.colors.primary,
                borderRadius: 8,
              }}
              labelStyle={{ color: theme.colors.primary }}
              icon="account-plus"
            >
              Add Member
            </Button>
          </View>
        </View>
        <View style={styles.submitButtonWrapper}>
            <Button
              mode="contained"
              onPress={handleSubmit(handleCreateGroup)}
              loading={loading}
              disabled={loading}
              style={[styles.submitBtn, {width: "100%"}]}
              labelStyle={{ color: theme.colors.onPrimary }}
            >
              Create Group
            </Button>
          </View>
        </Card.Content>
        </Card>
          
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  wrapper: { flex: 1 },
  container: { flexGrow: 1, paddingRight: 10, paddingLeft: 10 },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 12, paddingTop: Platform.OS === 'android' ? 40 : 20, paddingBottom: 12,
  },
  headerTitle: { fontSize: 20, fontWeight: 'bold' },
  form: { flex: 1 },
  memberSection: {
    marginTop: 16
  },
  memberRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 6,
  },
  memberText: {
    fontSize: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "600",
    marginBottom: 8,
  },
  submitBtn: { marginTop: 20, paddingVertical: 4, borderRadius: 6 },
  modal: {
    margin: 20, padding: 20, borderRadius: 8
  },
  modalTitle: { fontSize: 18, fontWeight: 'bold', marginBottom: 12 },
  submitButtonWrapper: {
    alignItems: 'flex-end',
    marginTop: 20,
  },
    summaryCard: {
    borderRadius: 12,
    marginBottom: 20,
    elevation: 4,
  },
});
