import React, { useMemo, useState } from 'react';
import { View, ScrollView, Dimensions } from 'react-native';
import { Text, Appbar, List } from 'react-native-paper';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import { TabBar, SceneMap, TabView } from 'react-native-tab-view';

/*
  A clean, full-screen breakdown screen with tabs to show:
  - You Owe (By Groups / By Members)
  - You Are Owed (By Groups / By Members)
  - Balance (By Groups / By Members)

  Props (route.params):
  {
    mode: 'owe' | 'owed' | 'balance',
    youOweDetails: Array<{ id, group, member, description, amount }>,
    youAreOwedDetails: Array<{ id, group, member, description, amount }>,
    themeColors: any
  }
*/
export default function BreakdownScreen({ route, navigation }) {
  const { mode, youOweDetails = [], youAreOwedDetails = [], themeColors } = route.params || {};
  const [tabIndex, setTabIndex] = useState(0);

  const groupBy = (arr, key) => arr.reduce((acc, it) => {
    const k = it[key] || 'Unknown';
    (acc[k] ||= []).push(it);
    return acc;
  }, {});

  const grouped = useMemo(() => ({
    oweByGroup: groupBy(youOweDetails, 'group'),
    oweByMember: groupBy(youOweDetails, 'member'),
    owedByGroup: groupBy(youAreOwedDetails, 'group'),
    owedByMember: groupBy(youAreOwedDetails, 'member'),
  }), [youOweDetails, youAreOwedDetails]);

  const net = useMemo(() => {
    const byGroup = {};
    const byMember = {};
    youAreOwedDetails.forEach((it) => { byGroup[it.group] = (byGroup[it.group] || 0) + it.amount; byMember[it.member] = (byMember[it.member] || 0) + it.amount; });
    youOweDetails.forEach((it) => { byGroup[it.group] = (byGroup[it.group] || 0) - it.amount; byMember[it.member] = (byMember[it.member] || 0) - it.amount; });
    return { byGroup, byMember };
  }, [youOweDetails, youAreOwedDetails]);

  const title = mode === 'owe' ? 'You Owe'
              : mode === 'owed' ? 'You Are Owed'
              : 'Balance';

  const routes = [
    { key: 'groups', title: 'By Groups' },
    { key: 'members', title: 'By Members' },
  ];

  const renderGroups = () => {
    if (mode === 'balance') {
      const entries = Object.entries(net.byGroup || {});
      return (
        <ScrollView contentContainerStyle={{ padding: 16 }}>
          {entries.length ? entries.map(([groupName, amount]) => (
            <List.Item
              key={groupName}
              title={groupName}
              description={`₹${Math.abs(amount).toFixed(2)} ${amount >= 0 ? '(They owe you)' : '(You owe)'}`}
              left={() => (
                <MaterialCommunityIcons
                  name={amount >= 0 ? 'arrow-down-circle-outline' : 'arrow-up-circle-outline'}
                  size={24}
                  color={amount >= 0 ? '#4CAF50' : themeColors?.error}
                  style={{ alignSelf: 'center' }}
                />
              )}
            />
          )) : (
            <Text style={{ textAlign: 'center', color: themeColors?.placeholder, marginTop: 24 }}>No net balances with groups.</Text>
          )}
        </ScrollView>
      );
    }

    const source = mode === 'owe' ? grouped.oweByGroup : grouped.owedByGroup;
    const entries = Object.entries(source || {});
    return (
      <ScrollView contentContainerStyle={{ padding: 8 }}>
        {entries.length ? entries.map(([groupName, items]) => (
          <List.Accordion
            key={groupName}
            title={groupName}
            left={() => (
              <MaterialCommunityIcons name="folder-multiple-outline" size={24} color={themeColors?.primary} style={{ alignSelf: 'center' }} />
            )}
            titleStyle={{ color: themeColors?.text }}
          >
            {items.map((it) => (
              <List.Item
                key={it.id}
                title={it.description}
                description={`₹${it.amount.toFixed(2)} • ${mode === 'owe' ? it.member : it.member}`}
                left={() => (
                  <MaterialCommunityIcons name="currency-inr" size={20} color={mode === 'owe' ? themeColors?.error : '#4CAF50'} style={{ alignSelf: 'center' }} />
                )}
              />
            ))}
          </List.Accordion>
        )) : (
          <Text style={{ textAlign: 'center', color: themeColors?.placeholder, marginTop: 24 }}>No items.</Text>
        )}
      </ScrollView>
    );
  };

  const renderMembers = () => {
    if (mode === 'balance') {
      const entries = Object.entries(net.byMember || {});
      return (
        <ScrollView contentContainerStyle={{ padding: 16 }}>
          {entries.length ? entries.map(([memberName, amount]) => (
            <List.Item
              key={memberName}
              title={memberName}
              description={`₹${Math.abs(amount).toFixed(2)} ${amount >= 0 ? '(They owe you)' : '(You owe)'}`}
              left={() => (
                <MaterialCommunityIcons
                  name={amount >= 0 ? 'arrow-down-circle-outline' : 'arrow-up-circle-outline'}
                  size={24}
                  color={amount >= 0 ? '#4CAF50' : themeColors?.error}
                  style={{ alignSelf: 'center' }}
                />
              )}
            />
          )) : (
            <Text style={{ textAlign: 'center', color: themeColors?.placeholder, marginTop: 24 }}>No net balances with members.</Text>
          )}
        </ScrollView>
      );
    }

    const source = mode === 'owe' ? grouped.oweByMember : grouped.owedByMember;
    const entries = Object.entries(source || {});
    return (
      <ScrollView contentContainerStyle={{ padding: 8 }}>
        {entries.length ? entries.map(([memberName, items]) => (
          <List.Accordion
            key={memberName}
            title={memberName}
            left={() => (
              <MaterialCommunityIcons name="account-circle-outline" size={24} color={themeColors?.primary} style={{ alignSelf: 'center' }} />
            )}
            titleStyle={{ color: themeColors?.text }}
          >
            {items.map((it) => (
              <List.Item
                key={it.id}
                title={it.description}
                description={`₹${it.amount.toFixed(2)} • ${it.group}`}
                left={() => (
                  <MaterialCommunityIcons name="currency-inr" size={20} color={mode === 'owe' ? themeColors?.error : '#4CAF50'} style={{ alignSelf: 'center' }} />
                )}
              />
            ))}
          </List.Accordion>
        )) : (
          <Text style={{ textAlign: 'center', color: themeColors?.placeholder, marginTop: 24 }}>No items.</Text>
        )}
      </ScrollView>
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: themeColors?.background }}>
      <Appbar.Header mode="center-aligned" style={{ backgroundColor: themeColors?.surface }}>
        <Appbar.BackAction color={themeColors?.text} onPress={() => navigation.goBack()} />
        <Appbar.Content title={title} color={themeColors?.text} />
      </Appbar.Header>

      <TabView
        navigationState={{ index: tabIndex, routes }}
        renderScene={SceneMap({ groups: renderGroups, members: renderMembers })}
        onIndexChange={setTabIndex}
        initialLayout={{ width: Dimensions.get('window').width }}
        renderTabBar={(props) => (
          <TabBar
            {...props}
            indicatorStyle={{ backgroundColor: themeColors?.primary }}
            style={{ backgroundColor: themeColors?.surface }}
            labelStyle={{ color: themeColors?.text }}
          />
        )}
      />
    </View>
  );
}