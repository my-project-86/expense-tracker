import React from 'react';
import { View, Alert } from 'react-native';
import { useForm, Controller } from 'react-hook-form';
import { Text, Button } from 'react-native-paper';
import { collection, doc, getDoc, updateDoc, arrayUnion } from 'firebase/firestore';
import { db } from '../../firebaseConfig'; // your firebase config
import CustomTextInput from '../../components/react-hook-form/CustomTextInput'; // your custom input component

const AddMemberScreen = ({ route, navigation }) => {
  const { id: groupId } = route.params;

  const { control, handleSubmit, reset } = useForm({
    defaultValues: {
      email: '',
    },
  });

  const onSubmit = async ({ email }) => {
    try {
      const userRef = doc(db, 'users', email); // Assuming user doc ID = email
      const userSnap = await getDoc(userRef);

      if (!userSnap.exists()) {
        Alert.alert('Error', 'User not found. Ask them to sign up on Squad Split.');
        return;
      }

      const userData = userSnap.data();
      const groupRef = doc(db, 'groups', groupId);

      await updateDoc(groupRef, {
        members: arrayUnion({
          uid: userSnap.id,
          email: userData.email,
          displayName: userData.displayName || userData.email,
        }),
        memberUIDs: arrayUnion(userSnap.id), // ✅ ensure added member sees the group in their list
      });

      Alert.alert('Success', 'Member added successfully!');
      reset();
      navigation.goBack();
    } catch (error) {
      Alert.alert('Error', 'Failed to add member. Please try again.');
    }
  };

  return (
    <View style={{ padding: 16 }}>
      <Text variant="titleLarge" style={{ marginBottom: 16 }}>
        Add Member by Email
      </Text>
          <CustomTextInput
          control={control}
            label="Member Email"
            name="email"
            keyboardType="email-address"
            autoCapitalize="none"
          />
       

      <Button
        mode="contained"
        onPress={handleSubmit(onSubmit)}
        style={{ marginTop: 24 }}
      >
        Add Member
      </Button>
    </View>
  );
};

export default AddMemberScreen;
