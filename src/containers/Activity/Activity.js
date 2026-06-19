import React, { useEffect, useState } from 'react';
import { View, StyleSheet, ScrollView, Alert } from 'react-native';
import { Text, useTheme, Card, List, Divider, Appbar, Menu } from 'react-native-paper';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { db, auth } from '../../firebaseConfig'; // Adjust path
import { getActivityIconAndColor, renderActivityText, formatDateTime } from '../../context/data';

export default function Activity() {
    const theme = useTheme();
    const [activities, setActivities] = useState([]);
    const [loading, setLoading] = useState(true);
    const [sortOrder, setSortOrder] = useState('latest'); // 'latest' or 'oldest'
    const [filterMenuVisible, setFilterMenuVisible] = useState(false);
    const [filter, setFilter] = useState('all'); // options: all | expense | settlement | member | group
    const [selectedGroupId, setSelectedGroupId] = useState('all'); // default shows all groups
    const [groupMenuVisible, setGroupMenuVisible] = useState(false);
    const [groups, setGroups] = useState([]);

    const currentUser = auth.currentUser;

    useEffect(() => {
        if (!auth.currentUser) return;

        const q = query(
            collection(db, "groups"),
            where("memberUIDs", "array-contains", auth.currentUser.uid)
        );

        const unsubscribe = onSnapshot(
            q,
            (snapshot) => {
                let allActivities = [];
                snapshot.forEach((doc) => {
                    const group = doc.data();
                    if (group.activities && Array.isArray(group.activities)) {
                        allActivities = [
                            ...allActivities,
                            ...group.activities.map((act) => ({
                                ...act,
                                groupId: doc.id,
                                groupName: group.name,
                            })),
                        ];
                    }
                });

                const loadedGroups = snapshot.docs.map(doc => ({
                    id: doc.id,
                    name: doc.data().name,
                }));
                setGroups(loadedGroups);

                // Sort by sortOrder
                allActivities.sort((a, b) => {
                    if (sortOrder === 'latest') {
                        return b.createdAt?.toMillis?.() - a.createdAt?.toMillis?.();
                    } else {
                        return a.createdAt?.toMillis?.() - b.createdAt?.toMillis?.();
                    }
                });

                setActivities(allActivities);
                setLoading(false);
            },
            (error) => {
                setLoading(false);
                console.error(error);
            }
        );

        return () => unsubscribe();
    }, [sortOrder]);

    const filteredActivities = activities.filter(activity => {
        // 1️⃣ Filter by group
        const groupMatch = selectedGroupId === 'all' || activity.groupId === selectedGroupId;

        // 2️⃣ Filter by type
        const typeMatch =
            filter === 'all' ||
            (filter === 'expense' && activity.type.includes('expense')) ||
            (filter === 'settlement' && activity.type.includes('settled')) ||
            (filter === 'member' && activity.type.includes('member')) ||
            (filter === 'group' && activity.type.includes('group'));

        return groupMatch && typeMatch;
    });

 

    return (
        <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
            <View style={{ width: '100%' }}>
                <Appbar.Header
                    mode="small"
                    style={{
                        backgroundColor: theme.colors.background,
                        flexDirection: 'row',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        paddingHorizontal: 0,
                        elevation: 0,
                    }}
                >
                    {/* Title */}
                    <Appbar.Content title="Activity" titleStyle={{ color: theme.colors.text }} />

                    {/* Right-side Buttons */}
                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                        {/* Group Menu */}
                        <Menu
                            visible={groupMenuVisible}
                            onDismiss={() => setGroupMenuVisible(false)}
                            anchor={
                                <Appbar.Action
                                    icon="account-group"
                                    onPress={() => setGroupMenuVisible(true)}
                                    iconColor={theme.colors.primary}
                                />
                            }
                            contentStyle={{ backgroundColor: theme.colors.surface }}
                        >
                            <Menu.Item
                                onPress={() => { setSelectedGroupId('all'); setGroupMenuVisible(false); }}
                                title="All Groups"
                            />
                            {groups.map((group) => (
                                <Menu.Item
                                    key={group.id}
                                    onPress={() => { setSelectedGroupId(group.id); setGroupMenuVisible(false); }}
                                    title={group.name}
                                />
                            ))}
                        </Menu>

                        {/* Filter Menu */}
                        <Menu
                            visible={filterMenuVisible}
                            onDismiss={() => setFilterMenuVisible(false)}
                            anchor={
                                <Appbar.Action
                                    icon="filter-variant"
                                    onPress={() => setFilterMenuVisible(true)}
                                    iconColor={theme.colors.primary}
                                />
                            }
                            contentStyle={{ backgroundColor: theme.colors.surface }}
                        >
                            <Menu.Item onPress={() => { setFilter('all'); setFilterMenuVisible(false); }} title="All" />
                            <Menu.Item onPress={() => { setFilter('expense'); setFilterMenuVisible(false); }} title="Expenses" />
                            <Menu.Item onPress={() => { setFilter('settlement'); setFilterMenuVisible(false); }} title="Settlements" />
                            <Menu.Item onPress={() => { setFilter('member'); setFilterMenuVisible(false); }} title="Members" />
                            <Menu.Item onPress={() => { setFilter('group'); setFilterMenuVisible(false); }} title="Group Changes" />
                        </Menu>

                        {/* Sort Button */}
                        <Appbar.Action
                            icon="sort"
                            iconColor={theme.colors.primary}
                            onPress={() => setSortOrder(prev => prev === 'latest' ? 'oldest' : 'latest')}
                        />

                        {/* Clear Filters (only if filter applied) */}
                        {(filter !== 'all' || selectedGroupId !== 'all' || sortOrder !== 'latest') && (
                            <Appbar.Action
                                icon="filter-remove"
                                iconColor={theme.colors.primary}
                                onPress={() => {
                                    setFilter('all');
                                    setSelectedGroupId('all');
                                    setSortOrder('latest');
                                }}
                            />
                        )}
                    </View>
                </Appbar.Header>

            </View>

            {loading ? null : filteredActivities.length === 0 ? (
                <View style={styles.emptyStateContainer}>
                    <MaterialCommunityIcons
                        name="clipboard-list-outline"
                        size={80}
                        color={theme.colors.placeholder}
                        style={styles.emptyStateIcon}
                    />
                    <Text style={[styles.emptyStateText, { color: theme.colors.text }]}>
                        No activities recorded yet.
                    </Text>
                </View>
            ) : (
                <ScrollView style={styles.activityList} showsVerticalScrollIndicator={false}>
                    <Card.Content>
                        {filteredActivities.map((activity, index) => {
                            const { name: iconName, color: iconColor } = getActivityIconAndColor(activity, currentUser);
                            const activityText = renderActivityText(activity, currentUser);

                            let amountDisplay = null;
                            if (activity.amount !== undefined) {
                                const formattedAmount = `₹${Math.abs(activity.amount)}`;
                                amountDisplay = (
                                    <Text style={{ color: iconColor, fontWeight: "bold", fontSize: 18 }}>
                                        {formattedAmount}
                                    </Text>
                                );
                            }

                            const sharePerPerson = activity.sharePerPerson ? `Share: ₹${activity.sharePerPerson}, ` : '';

                            return (
                                <View key={index} style={{ paddingRight: 0 }}>
                                    <List.Item
                                        title={() => (
                                            <Text style={{ paddingLeft: 0, color: theme.colors.text, fontSize: 15, flexShrink: 1, flexWrap: "wrap" }}>
                                                {activityText}
                                            </Text>
                                        )}
                                        description={`${sharePerPerson}${formatDateTime(activity.createdAt)}`}
                                        titleStyle={{ paddingLeft: 0, color: theme.colors.text, fontSize: 15 }}
                                        descriptionStyle={{ color: theme.colors.placeholder, fontSize: 12 }}
                                        left={() => <MaterialCommunityIcons name={iconName} size={24} color={iconColor} style={styles.listItemIcon} />}
                                        right={() => (<Text style={{ marginRight: -10, verticalAlign: "middle" }}>{amountDisplay}</Text>)}
                                        style={styles.listItem}
                                    />
                                    {index < activities.length - 1 && <Divider style={{ marginLeft: 0 }} />}
                                </View>
                            );
                        })}
                    </Card.Content>
                </ScrollView>
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, alignItems: 'center', padding: 5 },
    activityList: { width: '100%', flexGrow: 1 },
    listItem: { paddingVertical: 8, paddingHorizontal: 0 },
    listItemIcon: { alignSelf: 'center' },
    emptyStateContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 40, marginTop: 50 },
    emptyStateIcon: { marginBottom: 20 },
    emptyStateText: { fontSize: 16, textAlign: 'center', lineHeight: 24 },
});
