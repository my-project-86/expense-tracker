// src/screens/AllExpenses.js
import React, { useEffect, useState } from 'react';
import { View, StyleSheet, ActivityIndicator, ScrollView, Alert } from 'react-native';
import { Appbar, List, Text, Divider, useTheme, Button, Chip } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';
import { db, auth } from '../../firebaseConfig';
import { collection, onSnapshot, query, orderBy, updateDoc, serverTimestamp, doc } from 'firebase/firestore';
import MonthFilter, { formatFilterLabel } from '../../components/filters/MonthFilter';

export default function AllExpenses() {
    const theme = useTheme();
    const navigation = useNavigation();
    const route = useRoute();
    const { groupId, members, groupName, initialFilter } = route.params;

    const currentUID = auth.currentUser.uid;

    const [expenses, setExpenses] = useState([]);
    const [loading, setLoading] = useState(true);
    const [settleAllLoading, setSettleAllLoading] = useState(false);

    // filter state
    const [filter, setFilter] = useState(initialFilter || { mode: 'current', year: new Date().getFullYear(), month: new Date().getMonth() + 1 });

    useEffect(() => {
        // 🔑 order by createdAt descending so latest is on top
        const expensesRef = collection(db, 'groups', groupId, 'expenses');
        const q = query(expensesRef, orderBy('createdAt', 'desc'));

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const list = snapshot.docs.map((doc) => ({
                id: doc.id,
                ...doc.data(),
            }));
            setExpenses(list);
            setLoading(false);
        });

        return () => unsubscribe();
    }, [groupId]);

    const getMemberName = (uid) => {
        const member = members.find((m) => m.uid === uid);
        return member?.uid === currentUID ? "You" : member?.displayName || member?.email || 'Unknown';
    };

    return (
        <View style={{ flex: 1, backgroundColor: theme.colors.surface }}>
            {/* AppBar */}
            <Appbar.Header mode="small" style={{ paddingBottom: 10 }}>
                <Appbar.BackAction onPress={() => navigation.goBack()} />
                <Appbar.Content title="All Expenses" />
                <MonthFilter
                  expenses={expenses}
                  value={filter}
                  onChange={setFilter}
                  buttonLabel={formatFilterLabel(filter) || 'Filter'}
                />
                <Appbar.Action
                    icon={settleAllLoading ? 'loading' : 'check-all'}
                    title="Settle All"
                    disabled={settleAllLoading || expenses.length === 0 || expenses.every(e => e.status === 'settled')}
                    onPress={() => {
                        Alert.alert('Confirm', 'Settle all expenses for this group?', [
                          { text: 'Cancel', style: 'cancel' },
                          { text: 'Settle All', style: 'destructive', onPress: async () => {
                            try {
                                setSettleAllLoading(true);
                                const promises = [];
                                const toUpdate = expenses.filter(e => e.status !== 'settled');
                                for (const e of toUpdate) {
                                    const expenseRef = doc(db, 'groups', groupId, 'expenses', e.id);
                                    const updatedSplitAmong = (e?.splitAmong || []).map(m => ({
                                        ...m,
                                        settledAmount: Number(m.yourShare || 0),
                                        due: 0,
                                        isSettled: true,
                                    }));
                                    promises.push(updateDoc(expenseRef, {
                                        splitAmong: updatedSplitAmong,
                                        status: 'settled',
                                        updatedAt: serverTimestamp(),
                                    }));
                                }
                                if (toUpdate.length > 0) {
                                    const groupRef = doc(db, 'groups', groupId);
                                    promises.push(updateDoc(groupRef, {
                                        lastActivity: serverTimestamp(),
                                    }));
                                }
                                await Promise.all(promises);
                                Alert.alert('Success', toUpdate.length > 0 ? 'All expenses settled.' : 'Already settled');
                            } catch (e) {
                                console.error('AllExpenses settleAll error', e);
                                Alert.alert('Error', 'Failed to settle all expenses');
                            } finally {
                                setSettleAllLoading(false);
                            }
                          }}
                        ]);
                    }}
                    color={expenses.length === 0 || expenses.every(e => e.status === 'settled') ? theme.colors.outline : theme.colors.primary}
                    accessibilityLabel="Settle All"
                />
            </Appbar.Header>

            {/* Selected month label */}
            <View style={{ paddingHorizontal: 16, paddingBottom: 8 }}>
              <Text style={{ color: theme.colors.placeholder }}>
                {formatFilterLabel(filter)}
              </Text>
            </View>

            {loading ? (
                <ActivityIndicator style={{ marginTop: 20 }} />
            ) : expenses.length === 0 ? (
                <View style={styles.emptyContainer}>
                    <Text style={{ color: theme.colors.placeholder }}>No expenses yet</Text>
                </View>
            ) : (
                <ScrollView showsVerticalScrollIndicator={false} showsHorizontalScrollIndicator={false}>
                    <List.Section>
                        {expenses
                          .filter(e => {
                            // reuse the same logic as GroupDetail: filter by createdAt
                            const ts = e?.createdAt;
                            const d = ts?.toDate ? ts.toDate() : (ts?.seconds ? new Date(ts.seconds * 1000) : null);
                            if (!d) return false;
                            if (filter.mode === 'all') return true;
                            if (filter.mode === 'current') {
                              const now = new Date();
                              return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
                            }
                            if (filter.mode === 'previous') {
                              const now = new Date();
                              const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
                              return d.getFullYear() === prev.getFullYear() && d.getMonth() === prev.getMonth();
                            }
                            if (filter.mode === 'custom') {
                              return d.getFullYear() === filter.year && (d.getMonth() + 1) === filter.month;
                            }
                            return true;
                          })
                          .map((expense, index, arr) => {
                            const isPaidByYou = expense?.paidBy === auth.currentUser?.uid;
                            const paidByName = isPaidByYou ? 'You' : getMemberName(expense?.paidBy);

                            return (
                                <View key={expense.id}>
                                    <List.Item
                                        title={expense.title || 'Untitled Expense'}
                                        onPress={() =>
                                            navigation.navigate('ExpenseDetails', { expense, members, groupId })
                                        }
                                        description={() => (
                                            <View>
                                                {expense.notes ? (
                                                    <Text
                                                        style={{ color: theme.colors.placeholder }}
                                                        numberOfLines={1}
                                                    >
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
                                                name="currency-inr"
                                                size={20}
                                                color={theme.colors.secondary}
                                            />
                                        )}
                                        right={() => (
                                            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                                                <Text
                                                    style={{
                                                        color: expense.status === 'settled' ? 'green' : 'orange',
                                                        marginRight: 4,
                                                    }}
                                                >
                                                    {expense.status}
                                                </Text>
                                                <MaterialCommunityIcons
                                                    name="chevron-right"
                                                    size={24}
                                                    color={theme.colors.placeholder}
                                                />
                                            </View>
                                        )}
                                        style={styles.listItem}
                                    />
                                    {arr?.length - 1 !== index && <Divider />}
                                </View>
                            );
                        })}
                    </List.Section>
                </ScrollView>
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    listItem: {
        paddingHorizontal: 10,
    },
    emptyContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    expensesCard: {
        margin: 10,
        marginTop: 0,
        borderRadius: 12
    },
});
