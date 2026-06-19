// Dashboard.js (Now functions as Dashboard)
import React, { useState, useEffect, useRef } from "react";
import {
  View,
  StyleSheet,
  ScrollView,
  Alert,
  Platform,
  Dimensions,
  SafeAreaView,
  StatusBar,
} from "react-native";
import {
  Text,
  useTheme,
  FAB,
  Card,
  List,
  Divider,
  ProgressBar,
  IconButton,
  Button,
  Portal,
  Modal,
  ActivityIndicator
} from "react-native-paper";
import { useNavigation } from "@react-navigation/native";
import { auth, db } from "../../firebaseConfig";
import { collection, query, where, onSnapshot, orderBy, doc } from "firebase/firestore";
import { youOweBalance } from "../Groups/Groups.config";
import MaterialCommunityIcons from "react-native-vector-icons/MaterialCommunityIcons";
import { TabBar, SceneMap, TabView } from "react-native-tab-view";
import { getActivityIconAndColor, renderActivityText, formatDateTime } from "../../context/data";

export default function Dashboard() {
  const theme = useTheme();
  const navigation = useNavigation();

  // Safeguard current user to avoid undefined during auth init
  const currentUser = auth.currentUser || { uid: "", displayName: "" };

  // State for modal visibility
  // Removed modal and tab states; using full-screen Breakdown screen instead

  // Realtime values
  const [youOwe, setYouOwe] = useState(0);
  const [youAreOwed, setYouAreOwed] = useState(0);
  const balance = youAreOwed - youOwe; // Calculate balance
  const [ showOweDetailsModal, setShowOweDetailsModal] = useState(false);
  const [ showOwedDetailsModal, setShowOwedDetailsModal ] = useState(false);
  const [ showBalanceDetailsModal, setShowBalanceDetailsModal ] = useState(false);
  const [ oweTabIndex, setOweTabIndex ] = useState(0);
  const [ owedTabIndex, setOwedTabIndex ] = useState(0);
  const [ balanceTabIndex, setBalanceTabIndex ] = useState(0);

  // Loading and data states (no mock data)
  const [isLoading, setIsLoading] = useState(true);
  const [recentActivities, setRecentActivities] = useState([]);
  const [upcomingPayments, setUpcomingPayments] = useState([]);
  const [topGroups, setTopGroups] = useState([]);
  const [spendingCategories, setSpendingCategories] = useState([]);
  const [notifications, setNotifications] = useState([]);

  // Aggregation helpers
  const [groupBalances, setGroupBalances] = useState({}); // { [groupId]: balanceNumber }
  const [groupNames, setGroupNames] = useState({}); // { [groupId]: groupName }
  const [detailsByGroup, setDetailsByGroup] = useState({}); // { [groupId]: { owe:[], owed:[] } }

  // Data for Owe/Owed Details Modals (live from Firestore via useEffect below)
  const [youOweDetails, setYouOweDetails] = useState([]);
  const [youAreOwedDetails, setYouAreOwedDetails] = useState([]);

  // Function to group details by group name
  const groupDetailsByGroup = (details) => {
    const grouped = {};
    details.forEach((item) => {
      if (!grouped[item.group]) {
        grouped[item.group] = [];
      }
      grouped[item.group].push(item);
    });
    return grouped;
  };

  // Function to group details by member name
  const groupDetailsByMember = (details) => {
    const grouped = {};
    details.forEach((item) => {
      if (!grouped[item.member]) {
        grouped[item.member] = [];
      }
      grouped[item.member].push(item);
    });
    return grouped;
  };

  const groupedOweDetailsByGroup = groupDetailsByGroup(youOweDetails);
  const groupedOweDetailsByMember = groupDetailsByMember(youOweDetails);
  const groupedOwedDetailsByGroup = groupDetailsByGroup(youAreOwedDetails);
  const groupedOwedDetailsByMember = groupDetailsByMember(youAreOwedDetails);

  // Load owe/owed details breakdown for modals from current groups/expenses
  useEffect(() => {
    const currentUser = auth.currentUser;
    if (!currentUser) return;

    const groupsRef = collection(db, "groups");
    const q = query(groupsRef, where("memberUIDs", "array-contains", currentUser.uid));

    // subscribe to groups, then for each group subscribe to its expenses to derive details
    const expenseUnsubs = new Map();

    const unsubscribeGroups = onSnapshot(q, (snapshot) => {
      const oweItems = [];
      const owedItems = [];

      // handle added/modified/removed groups
      snapshot.docChanges().forEach((change) => {
        const gId = change.doc.id;
        const gData = { id: gId, ...change.doc.data() };

        if (change.type === 'removed') {
          if (expenseUnsubs.has(gId)) {
            expenseUnsubs.get(gId)();
            expenseUnsubs.delete(gId);
          }
          return;
        }

        if (!expenseUnsubs.has(gId)) {
          const expRef = collection(db, "groups", gId, "expenses");
          const expUnsub = onSnapshot(query(expRef, orderBy("createdAt", "desc")), (expSnap) => {
            const exps = expSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

            const owe = [];
            const owed = [];
            exps.forEach((e) => {
              (e.splitAmong || []).forEach((m) => {
                if (e.paidBy !== currentUser.uid && m.memberUid === currentUser.uid && (m.due || 0) > 0) {
                  const payer = (gData.members || []).find(mm => mm.uid === e.paidBy)?.displayName || "Someone";
                  owe.push({ id: `${gId}_${e.id}_${m.memberUid}_owe`, group: gData.name, member: payer, description: e.title || "Expense", amount: Number(m.due) || 0, date: "" });
                }
                if (e.paidBy === currentUser.uid && m.memberUid !== currentUser.uid && (m.due || 0) > 0) {
                  const mem = (gData.members || []).find(mm => mm.uid === m.memberUid)?.displayName || "Member";
                  owed.push({ id: `${gId}_${e.id}_${m.memberUid}_owed`, group: gData.name, member: mem, description: e.title || "Expense", amount: Number(m.due) || 0, date: "" });
                }
              });
            });

            // merge across groups: we rebuild full arrays each time by concatenating all groups' derived lists
            setYouOweDetails((prev) => {
              const filtered = (prev || []).filter((x) => !x.id.startsWith(`${gId}_`));
              return [...filtered, ...owe];
            });
            setYouAreOwedDetails((prev) => {
              const filtered = (prev || []).filter((x) => !x.id.startsWith(`${gId}_`));
              return [...filtered, ...owed];
            });
          });
          expenseUnsubs.set(gId, expUnsub);
        }
      });
    });

    return () => {
      unsubscribeGroups();
      expenseUnsubs.forEach((unsub) => unsub());
      expenseUnsubs.clear();
    };
  }, []);

  // Load real data from Firestore for the signed-in user
  useEffect(() => {
    const currentUser = auth.currentUser;
    if (!currentUser) return;

    // 1) Groups for the user with live updates
    const groupsRef = collection(db, "groups");
    const q = query(groupsRef, where("memberUIDs", "array-contains", currentUser.uid));

    // keep a quick temp structure to compute balances and top groups
    let allGroups = [];

    const unsubscribeGroups = onSnapshot(q, async (snapshot) => {
      allGroups = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));

      // 1a) For each group, listen expenses to compute balances and categories
      const expenseUnsubs = [];
      let totalYouOwe = 0;
      let totalYouAreOwed = 0;
      const topGroupsComputed = [];
      const spendingByCategory = {};

      await Promise.all(
        allGroups.map(async (g) => {
          const expRef = collection(db, "groups", g.id, "expenses");
          const expQ = query(expRef, orderBy("createdAt", "desc"));
          const unsub = onSnapshot(expQ, (expSnap) => {
            const expenses = expSnap.docs.map((e) => ({ id: e.id, ...e.data() }));

            // compute youOwe/youAreOwed per group using the same helper used in Groups
            const currentUID = currentUser.uid;
            const groupBalance = youOweBalance(expenses, currentUID);

            // tally totals
            if (groupBalance > 0) {
              totalYouAreOwed += groupBalance;
            } else if (groupBalance < 0) {
              totalYouOwe += Math.abs(groupBalance);
            }
            // top groups card mapping
            const status = groupBalance === 0 ? "settled" : groupBalance < 0 ? "owe" : "owed";
            topGroupsComputed.push({ id: g.id, name: g.name, youOwe: Math.abs(Math.min(groupBalance, 0)), youAreOwed: Math.max(groupBalance, 0), status });

            // spending categories (use e.category if present; else "Other"). Only count amounts you paid.
            expenses.forEach((e) => {
              if (e.paidBy === currentUID) {
                const cat = e.category || "Other";
                spendingByCategory[cat] = (spendingByCategory[cat] || 0) + (Number(e.amount) || 0);
              }
            });

            // update state each expenses snapshot to keep UI live
            setYouOwe(Number(totalYouOwe.toFixed(2)));
            setYouAreOwed(Number(totalYouAreOwed.toFixed(2)));
            // normalize categories list to existing UI structure
            const cats = Object.keys(spendingByCategory).map((name) => ({ name, spent: spendingByCategory[name], total: Math.max(spendingByCategory[name], 1), icon: "chart-donut" }));
            setSpendingCategories(cats);

            // compute top groups sorted by abs balance and keep few
            const sortedTop = [...topGroupsComputed].sort((a, b) => Math.abs(b.youAreOwed - b.youOwe) - Math.abs(a.youAreOwed - a.youOwe)).slice(0, 5);
            setTopGroups(sortedTop);
          });
          expenseUnsubs.push(unsub);
        })
      );

      // 2) Recent activities: flatten groups[].activities if present; latest 5
      const acts = [];
      allGroups.forEach((g) => {
        if (Array.isArray(g.activities)) {
          g.activities.forEach((a) => acts.push({ ...a, groupName: g.name }));
        }
      });
      acts.sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0));
      const mappedActs = acts.slice(0, 5)
      setRecentActivities(mappedActs);
      setIsLoading(false);
    });

    return () => {
      // groups unsubscribe covers inner ones via Firestore snapshot cleanup from returned closures above
    };
  }, []);

  // New functions to calculate net balance by member and group
  const calculateNetBalanceByMember = () => {
    const netBalances = {}; // { memberName: netAmount }

    // Deduct amounts you owe to members
    youOweDetails.forEach(item => {
      netBalances[item.member] = (netBalances[item.member] || 0) - item.amount;
    });

    // Add amounts you are owed from members
    youAreOwedDetails.forEach(item => {
      netBalances[item.member] = (netBalances[item.member] || 0) + item.amount;
    });

    // Convert to array of objects and filter out zero balances
    return Object.keys(netBalances)
      .filter(member => netBalances[member] !== 0) // Filter out zero balances
      .map(member => ({
        name: member,
        netAmount: netBalances[member],
      }));
  };

  const calculateNetBalanceByGroup = () => {
    const netBalances = {}; // { groupName: netAmount }

    // Deduct amounts you owe within groups
    youOweDetails.forEach(item => {
      netBalances[item.group] = (netBalances[item.group] || 0) - item.amount;
    });

    // Add amounts you are owed within groups
    youAreOwedDetails.forEach(item => {
      netBalances[item.group] = (netBalances[item.group] || 0) + item.amount;
    });

    // Convert to array of objects and filter out zero balances
    return Object.keys(netBalances)
      .filter(group => netBalances[group] !== 0) // Filter out zero balances
      .map(group => ({
        name: group,
        netAmount: netBalances[group],
      }));
  };

  const netBalanceByMember = calculateNetBalanceByMember();
  const netBalanceByGroup = calculateNetBalanceByGroup();


  // Determine balance text color
  const getBalanceColor = () => {
    if (balance > 0) return theme.colors.success; // Green for positive balance (theme-aware)
    if (balance < 0) return theme.colors.error; // Red for negative balance
    return theme.colors.primary; // Default for zero balance
  };

  // Define specific colors for the cards for clear visual distinction
  const youOweAccentColor = theme.colors.error; // Red for 'You Owe'
  const youAreOwedAccentColor = theme.colors.success; // Green for 'You Are Owed' (theme-aware)

  // Tab routes for the modals
  const oweRoutes = [
    { key: "byGroups", title: "By Groups" },
    { key: "byMembers", title: "By Members" },
  ];

  const owedRoutes = [
    { key: "byGroups", title: "By Groups" },
    { key: "byMembers", title: "By Members" },
  ];

  const balanceRoutes = [ // New routes for Balance modal
    { key: "byMembers", title: "By Members" },
    { key: "byGroups", title: "By Groups" },
  ];

  // Render scenes for "You Owe" modal tabs
  const renderOweScene = SceneMap({
    byGroups: () => (
      <ScrollView contentContainerStyle={styles.modalScrollContent}>
        {Object.keys(groupedOweDetailsByGroup).length > 0 ? (
          Object.keys(groupedOweDetailsByGroup).map((groupName, index) => (
            <List.Accordion
              key={index}
              title={groupName}
              left={(props) => (
                <MaterialCommunityIcons
                  name="folder-multiple-outline"
                  size={24}
                  color={theme.colors.icon}
                  style={{ verticalAlign: "middle" }}
                />
              )}
              titleStyle={{ color: theme.colors.text }}
              style={styles.accordionHeader}
            >
              {groupedOweDetailsByGroup[groupName].map((item) => (
                <List.Item
                  key={item.id}
                  title={`${item.member}: ${item.description}`}
                  description={`₹${item.amount.toFixed(2)} • ${item.date}`}
                  titleStyle={{ color: theme.colors.text }}
                  descriptionStyle={{ color: theme.colors.placeholder }}
                  left={(props) => (
                    <MaterialCommunityIcons
                      name="currency-inr"
                      size={20}
                      color={theme.colors.error}
                      style={{ verticalAlign: "middle" }}
                    />
                  )}
                  style={styles.accordionItem}
                />
              ))}
            </List.Accordion>
          ))
        ) : (
          <Text
            style={[styles.noDataText, { color: theme.colors.placeholder }]}
          >
            No outstanding debts by group.
          </Text>
        )}
      </ScrollView>
    ),
    byMembers: () => (
      <ScrollView contentContainerStyle={styles.modalScrollContent} showsVerticalScrollIndicator={false} showsHorizontalScrollIndicator={false}>
        {Object.keys(groupedOweDetailsByMember).length > 0 ? (
          Object.keys(groupedOweDetailsByMember).map((memberName, index) => (
            <List.Accordion
              key={index}
              title={memberName}
              left={(props) => (
                <MaterialCommunityIcons
                  name="account-circle-outline"
                  size={24}
                  color={theme.colors.icon}
                  style={{ verticalAlign: "middle" }}
                />
              )}
              titleStyle={{ color: theme.colors.text }}
              style={styles.accordionHeader}
              descriptionStyle={{ color: theme.colors.placeholder }}
            >
              {groupedOweDetailsByMember[memberName].map((item) => (
                <List.Item
                  key={item.id}
                  title={`${item.description} in ${item.group}`}
                  description={`₹${item.amount.toFixed(2)} • ${item.date}`}
                  titleStyle={{ color: theme.colors.text }}
                  descriptionStyle={{ color: theme.colors.placeholder }}
                  left={(props) => (
                    <MaterialCommunityIcons
                      name="currency-inr"
                      size={20}
                      color={theme.colors.error}
                      style={{ verticalAlign: "middle" }}
                    />
                  )}
                  style={styles.accordionItem}
                />
              ))}
            </List.Accordion>
          ))
        ) : (
          <Text
            style={[styles.noDataText, { color: theme.colors.placeholder }]}
          >
            No outstanding debts by member.
          </Text>
        )}
      </ScrollView>
    ),
  });

  // Render scenes for "You Are Owed" modal tabs
  const renderOwedScene = SceneMap({
    byGroups: () => (
      <ScrollView contentContainerStyle={styles.modalScrollContent} showsVerticalScrollIndicator={false} showsHorizontalScrollIndicator={false}>
        {Object.keys(groupedOwedDetailsByGroup).length > 0 ? (
          Object.keys(groupedOwedDetailsByGroup).map((groupName, index) => (
            <List.Accordion
              key={index}
              title={groupName}
              left={(props) => (
                <MaterialCommunityIcons
                  name="folder-multiple-outline"
                  size={24}
                  color={theme.colors.icon}
                />
              )}
              titleStyle={{ color: theme.colors.text }}
              style={styles.accordionHeader}
            >
              {groupedOwedDetailsByGroup[groupName].map((item) => (
                <List.Item
                  key={item.id}
                  title={`${item.member}: ${item.description}`}
                  description={`₹${item.amount.toFixed(2)} • ${item.date}`}
                  titleStyle={{ color: theme.colors.text }}
                  descriptionStyle={{ color: theme.colors.placeholder }}
                  left={(props) => (
                    <MaterialCommunityIcons
                      name="currency-inr"
                      size={20}
                      color={youAreOwedAccentColor}
                    />
                  )}
                  style={styles.accordionItem}
                />
              ))}
            </List.Accordion>
          ))
        ) : (
          <Text
            style={[styles.noDataText, { color: theme.colors.placeholder }]}
          >
            No money owed to you by group.
          </Text>
        )}
      </ScrollView>
    ),
    byMembers: () => (
      <ScrollView contentContainerStyle={styles.modalScrollContent} showsVerticalScrollIndicator={false} showsHorizontalScrollIndicator={false}>
        {Object.keys(groupedOwedDetailsByMember).length > 0 ? (
          Object.keys(groupedOwedDetailsByMember).map((memberName, index) => (
            <List.Accordion
              key={index}
              title={memberName}
              left={(props) => (
                <MaterialCommunityIcons
                  name="account-circle-outline"
                  size={24}
                  color={theme.colors.icon}
                />
              )}
              titleStyle={{ color: theme.colors.text }}
              style={styles.accordionHeader}
            >
              {groupedOwedDetailsByMember[memberName].map((item) => (
                <List.Item
                  key={item.id}
                  title={`${item.description} in ${item.group}`}
                  description={`₹${item.amount.toFixed(2)} • ${item.date}`}
                  titleStyle={{ color: theme.colors.text }}
                  descriptionStyle={{ color: theme.colors.placeholder }}
                  left={props => <MaterialCommunityIcons name="currency-inr" size={20} color={youAreOwedAccentColor} />}
                  style={styles.accordionItem}
                />
              ))}
            </List.Accordion>
          ))
        ) : (
          <Text
            style={[styles.noDataText, { color: theme.colors.placeholder }]}
          >
            No money owed to you by member.
          </Text>
        )}
      </ScrollView>
    ),
  });

  // Render scenes for "Balance Details" modal tabs
  const renderBalanceScene = SceneMap({
    byMembers: () => (
      <ScrollView contentContainerStyle={styles.modalScrollContent}>
        {netBalanceByMember.length > 0 ? (
          netBalanceByMember.map((item, index) => (
            <List.Item
              key={index}
              title={`${item.name}`}
              description={
                item.netAmount > 0
                  ? `Owes you: ₹${item.netAmount.toFixed(2)}`
                  : `You owe them: ₹${Math.abs(item.netAmount).toFixed(2)}`
              }
              titleStyle={{ color: theme.colors.text, fontWeight: 'bold' }}
              descriptionStyle={{
                color: item.netAmount > 0 ? '#4CAF50' : theme.colors.error, // Green for positive, red for negative
              }}
              left={props => (
                <MaterialCommunityIcons
                  name={item.netAmount > 0 ? "arrow-down-circle-outline" : "arrow-up-circle-outline"} // Down for owed to you, up for you owe
                  size={24}
                  color={item.netAmount > 0 ? '#4CAF50' : theme.colors.error}
                  style={{ verticalAlign: "middle" }}
                />
              )}
              style={styles.listItem}
            />
          ))
        ) : (
          <Text style={[styles.noDataText, { color: theme.colors.placeholder }]}>
            No net balances with members.
          </Text>
        )}
      </ScrollView>
    ),
    byGroups: () => (
      <ScrollView contentContainerStyle={styles.modalScrollContent}>
        {netBalanceByGroup.length > 0 ? (
          netBalanceByGroup.map((item, index) => (
            <List.Item
              key={index}
              title={`${item.name}`}
              description={
                item.netAmount > 0
                  ? `You are owed: ₹${item.netAmount.toFixed(2)}`
                  : `You owe: ₹${Math.abs(item.netAmount).toFixed(2)}`
              }
              titleStyle={{ color: theme.colors.text, fontWeight: 'bold' }}
              descriptionStyle={{
                color: item.netAmount > 0 ? '#4CAF50' : theme.colors.error, // Green for positive, red for negative
              }}
              left={props => (
                <MaterialCommunityIcons
                  name={item.netAmount > 0 ? "arrow-down-circle-outline" : "arrow-up-circle-outline"} // Down for owed to you, up for you owe
                  size={24}
                  color={item.netAmount > 0 ? '#4CAF50' : theme.colors.error}
                  style={{ verticalAlign: "middle" }}
                />
              )}
              style={styles.listItem}
            />
          ))
        ) : (
          <Text style={[styles.noDataText, { color: theme.colors.placeholder }]}>
            No net balances with groups.
          </Text>
        )}
      </ScrollView>
    ),
  });

  if (isLoading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="small" color={theme.colors.primary} />
      </View>
    );
  }

  return (
    <View
      style={[styles.container, { backgroundColor: theme.colors.background, maxWidth: "100%" }]}
    >
      {/* --- Scrollable Content Area --- */}
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false} showsHorizontalScrollIndicator={false}>
        {/* --- Owe/Owed Cards Section --- */}
        <View style={styles.summaryCardsContainer}>
          {/* You Owe Card */}
          <Card
            style={[
              styles.summaryCard,
              { backgroundColor: theme.colors.surface },
            ]}
            // onPress removed from Card, now only the button opens the modal
            rippleColor={theme.colors.primary + "33"} // Subtle ripple effect
          >
            <Card.Content style={styles.cardContent}>
              <View style={styles.textAndAmountContainer}>
                {/* Title and arrow on the same line, split left/right */}
                <View style={styles.titleAndArrowRow}>
                  <Text
                    style={[styles.cardTitle, { color: theme.colors.text }]}
                  >
                    You Owe
                  </Text>
                  <MaterialCommunityIcons
                    name="arrow-top-right"
                    size={20}
                    color={youOweAccentColor}
                  />
                </View>
                {/* Amount below the title/arrow row */}
                <Text style={[styles.cardAmount, { color: youOweAccentColor }]}>
                  ₹{youOwe.toFixed(2)}
                </Text>
              </View>
              {/* Added View button for opening modal */}
            </Card.Content>
            <View style={{ alignItems: "flex-end", marginTop: "-10px" }}>
              <Button
                mode="text"
                onPress={() => navigation.navigate('Breakdown', { mode: 'owe', youOweDetails, youAreOwedDetails, themeColors: theme.colors })}
                labelStyle={{ color: theme.colors.primary }}
              >
                View
              </Button>
            </View>
          </Card>

          {/* You Are Owed Card */}
          <Card
            style={[
              styles.summaryCard,
              { backgroundColor: theme.colors.surface },
            ]}
            // onPress removed from Card, now only the button opens the modal
            rippleColor={theme.colors.primary + "33"} // Subtle ripple effect
          >
            <Card.Content style={styles.cardContent}>
              {/* Main money icon on the left */}
              {/* Container for the text and arrow on the right */}
              <View style={styles.textAndAmountContainer}>
                {/* Title and arrow on the same line, split left/right */}
                <View style={styles.titleAndArrowRow}>
                  <Text
                    style={[styles.cardTitle, { color: theme.colors.text }]}
                  >
                    You Are Owed
                  </Text>
                  {/* Keeping arrow-up-bold as per user's last provided immersive */}
                  <MaterialCommunityIcons
                    name="arrow-bottom-left"
                    size={20}
                    color={youAreOwedAccentColor}
                  />
                </View>
                {/* Amount below the title/arrow row */}
                <Text
                  style={[styles.cardAmount, { color: youAreOwedAccentColor }]}
                >
                  ₹{youAreOwed.toFixed(2)}
                </Text>
              </View>
              {/* Added View button for opening modal */}
            </Card.Content>
            <View style={{ alignItems: "flex-end", marginTop: "-10px" }}>
              <Button
                mode="text"
                onPress={() => navigation.navigate('Breakdown', { mode: 'owed', youOweDetails, youAreOwedDetails, themeColors: theme.colors })}
                labelStyle={{ color: theme.colors.primary }}
              >
                View
              </Button>
            </View>
          </Card>
        </View>

        {/* --- Balance Card --- */}
        <Card
          style={[
            styles.balanceCard,
            { backgroundColor: theme.colors.surface, minHeight: 100 },
          ]}
        >
          <Card.Content style={styles.cardContent}>
            {/* Main balance icon on the left */}
            <MaterialCommunityIcons
              name="scale-balance"
              size={32}
              color={getBalanceColor()}
              style={styles.mainCardIcon}
            />
            {/* Container for the text and amount on the right */}
            <View style={[styles.textAndAmountContainer, {verticalAlign: "center"} ]}>
              {/* Title on one line */}
              <Text
                style={[
                  styles.cardTitle,
                  { color: theme.colors.text, textAlign: "right" },
                ]}
              >
                Balance
              </Text>
              {/* Amount below the title */}
              <Text style={[styles.cardAmount, { color: getBalanceColor() }]}>
                ₹{balance.toFixed(2)}
              </Text>
            </View>
          </Card.Content>
          {/* <View style={{ alignItems: "flex-end" }}>
            <Button
              mode="text"
              onPress={() => navigation.navigate('Breakdown', { mode: 'balance', youOweDetails, youAreOwedDetails, themeColors: theme.colors })}
              labelStyle={{ color: theme.colors.primary }}
            >
              View
            </Button>
          </View> */}
        </Card>

        {/* --- Quick Actions Section --- */}
        {/* <Card
          style={[
            styles.sectionCard,
            { backgroundColor: theme.colors.surface },
          ]}
        >
          <Card.Title
            title="Quick Actions"
            titleStyle={[styles.sectionTitle, { color: theme.colors.text }]}
            left={(props) => (
              <MaterialCommunityIcons
                name="lightbulb-on-outline"
                size={24}
                color={theme.colors.primary}
              />
            )}
          />
          <Card.Content style={styles.quickActionsContent}>
            <View style={styles.quickActionButtonContainer}>
              <IconButton
                icon="cash-minus"
                size={30}
                iconColor={theme.colors.placeholder}
                color={theme.colors.primary}
                onPress={() => Alert.alert("Action", "Request Money clicked!")}
                style={styles.iconButton}
              />
              <Text
                style={[styles.quickActionText, { color: theme.colors.text }]}
              >
                Request Money
              </Text>
            </View>
            <View style={styles.quickActionButtonContainer}>
              <IconButton
                icon="email-send-outline"
                size={30}
                iconColor={theme.colors.placeholder}
                color={theme.colors.primary}
                onPress={() => Alert.alert("Action", "Send Reminder clicked!")}
                style={styles.iconButton}
              />
              <Text
                style={[styles.quickActionText, { color: theme.colors.text }]}
              >
                Send Reminder
              </Text>
            </View>
            <View style={styles.quickActionButtonContainer}>
              <IconButton
                icon="handshake-outline"
                size={30}
                iconColor={theme.colors.placeholder}
                color={theme.colors.primary}
                onPress={() => Alert.alert("Action", "Settle Up clicked!")}
                style={styles.iconButton}
              />
              <Text
                style={[styles.quickActionText, { color: theme.colors.text }]}
              >
                Settle Up
              </Text>
            </View>
          </Card.Content>
        </Card> */}

                {/* --- Group Highlights Section --- */}
        <Card
          style={[
            styles.sectionCard,
            { backgroundColor: theme.colors.surface },
          ]}
        >
          <Card.Title
            title="Your Groups"
            titleStyle={[styles.sectionTitle, { color: theme.colors.text }]}
            left={(props) => (
              <MaterialCommunityIcons
                name="office-building-outline"
                size={24}
                color={theme.colors.icon}
              />
            )}
          />
          <Divider style={{ marginTop: -10 }} />
          <Card.Content style={{ paddingTop: 10 }}>
            {console.log("topGroups", topGroups)}
            {topGroups.map((group) => (
              <List.Item
                key={group.id}
                title={group.name}
                description={
                  group.status === "owe"
                    ? `You owe ₹${group.youOwe.toFixed(2)}`
                    : group.status === "settled"
                    ? "Settled up"
                    : `You are owed ₹${group.youAreOwed.toFixed(2)}`
                }
                titleStyle={{ color: theme.colors.text }}
                descriptionStyle={{
                  color:
                    group.status === "owe" ? theme.colors.error : group.status === "owed" ? theme.colors.success : group.status === "settled" ? "grey" : theme.colors.text,
                }}
                left={(props) => (
                  <MaterialCommunityIcons
                    name="account-group-outline"
                    size={20}
                    color={theme.colors.icon}
                  />
                )}
                style={styles.listItem}
                onPress={() => navigation.navigate("Group Details", { id: group.id })}
              />
            ))}
            
          </Card.Content>
          <Card.Actions style={{ justifyContent: "center" }}>
            <Button
              mode="text"
              onPress={() => navigation.navigate("Groups")}
              labelStyle={{ color: theme.colors.primary }}
            >
              View All Groups
            </Button>
          </Card.Actions>
        </Card>

        {/* --- Recent Activity Section --- */}
        <Card
          style={[
            styles.sectionCard,
            { backgroundColor: theme.colors.surface, maxWidth: "100%" },
          ]}
        >
          <Card.Title
            title="Recent Activity"
            titleStyle={[styles.sectionTitle, { color: theme.colors.text, paddingBottom: 0 }]}
            left={(props) => (
              <MaterialCommunityIcons
                name="history"
                size={24}
                color={theme.colors.icon}
              />
            )}
          />
          <Divider style={{ marginTop: -10 }} />

          <Card.Content style={{ paddingTop: 10 }}>
            {recentActivities.map((activity, index) => {
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
                    right={() => (<Text style={{ marginRight: -20, verticalAlign: "middle" }}>{amountDisplay}</Text>)}
                    style={styles.listItem}
                  />
                  {index < recentActivities.length - 1 && <Divider style={{ marginLeft: 0 }} />}
                </View>
              );
            })}
          </Card.Content>
          <Card.Actions style={{ justifyContent: "center" }}>
            <Button mode="text" onPress={() => navigation.navigate("Activity")} labelStyle={{ color: theme.colors.primary }}>
              View All Activity
            </Button>
          </Card.Actions>
        </Card>



        {/* --- Spending Breakdown Section --- */}
        {/* <Card
          style={[
            styles.sectionCard,
            { backgroundColor: theme.colors.surface },
          ]}
        >
          <Card.Title
            title="Spending by Category (This Month)"
            titleStyle={[styles.sectionTitle, { color: theme.colors.text }]}
            left={(props) => (
              <MaterialCommunityIcons
                name="chart-pie"
                size={24}
                color={theme.colors.primary}
              />
            )}
          />
          <Divider />
          <Card.Content>
            {spendingCategories.map((category) => (
              <View key={category.name} style={styles.categoryItem}>
                <View style={styles.categoryTextRow}>
                  <MaterialCommunityIcons
                    name={category.icon}
                    size={20}
                    color={theme.colors.placeholder}
                  />
                  <Text
                    style={[styles.categoryName, { color: theme.colors.text }]}
                  >
                    {category.name}
                  </Text>
                  <Text
                    style={[
                      styles.categoryAmount,
                      { color: theme.colors.text },
                    ]}
                  >
                    ₹{category.spent.toFixed(2)}
                  </Text>
                </View>
                <ProgressBar
                  progress={category.spent / category.total}
                  color={theme.colors.primary}
                  style={styles.progressBar}
                />
              </View>
            ))}
            <Button
              mode="text"
              onPress={() =>
                Alert.alert(
                  "Spending Report",
                  "Navigate to detailed spending report."
                )
              }
              labelStyle={{ color: theme.colors.primary }}
            >
              View Full Report
            </Button>
          </Card.Content>
        </Card> */}
      </ScrollView>

      {/* Floating Action Button for Add Expense */}
      {/* <FAB
        style={[styles.fab, { backgroundColor: theme.colors.primary }]}
        icon="plus"
        label="Add Expense"
        color="white"
        onPress={() => navigation.navigate("Activity")}
        small={false}
      /> */}

      {/* --- You Owe Details Modal --- */}
      <Portal>
        <Modal
          visible={showOweDetailsModal}
          contentContainerStyle={styles.modalContent}
        >
          {/* SafeAreaView ensures content respects notch/status bar area */}
          <SafeAreaView
            style={{ flex: 1, backgroundColor: theme.colors.surface }}
          >
            {/* Modal Header */}
            <View
              style={[
                styles.modalHeader,
                { backgroundColor: theme.colors.primary },
              ]}
            >
              <Text
                style={[styles.modalTitle, { color: theme.colors.surface }]}
              >
                You Owe Details
              </Text>
              {/* Close button removed; onDismiss handles back navigation */}
            </View>

            {/* TabView for 'By Groups' and 'By Members' */}
            <TabView
              navigationState={{ index: oweTabIndex, routes: oweRoutes }}
              renderScene={renderOweScene}
              onIndexChange={setOweTabIndex}
              initialLayout={{ width: Dimensions.get("window").width }}
              renderTabBar={(props) => (
                <TabBar
                  {...props}
                  indicatorStyle={{ backgroundColor: theme.colors.accent }}
                  style={{ backgroundColor: theme.colors.primary }}
                  labelStyle={{ fontWeight: "bold" }}
                  activeColor={theme.colors.accent}
                  inactiveColor={theme.colors.surface}
                />
              )}
            />
          </SafeAreaView>
        </Modal>
      </Portal>

      {/* --- You Are Owed Details Modal --- */}
      <Portal>
        <Modal
          visible={showOwedDetailsModal}
          onDismiss={() => setShowOwedDetailsModal(false)}
          contentContainerStyle={styles.modalContent}
        >
          {/* SafeAreaView ensures content respects notch/status bar area */}
          <SafeAreaView
            style={{ flex: 1, backgroundColor: theme.colors.surface }}
          >
            {/* Modal Header */}
            <View
              style={[
                styles.modalHeader,
                { backgroundColor: theme.colors.primary },
              ]}
            >
              <Text
                style={[styles.modalTitle, { color: theme.colors.surface }]}
              >
                You Are Owed Details
              </Text>
              {/* Close button removed; onDismiss handles back navigation */}
            </View>

            {/* TabView for 'By Groups' and 'By Members' */}
            <TabView
              navigationState={{ index: owedTabIndex, routes: owedRoutes }}
              renderScene={renderOwedScene}
              onIndexChange={setOwedTabIndex}
              initialLayout={{ width: Dimensions.get("window").width }}
              renderTabBar={(props) => (
                <TabBar
                  {...props}
                  indicatorStyle={{ backgroundColor: theme.colors.accent }}
                  style={{ backgroundColor: theme.colors.primary }}
                  labelStyle={{ fontWeight: "bold" }}
                  activeColor={theme.colors.accent}
                  inactiveColor={theme.colors.surface}
                />
              )}
            />
          </SafeAreaView>
        </Modal>
      </Portal>

      {/* --- Balance Details Modal --- */}
      <Portal>
        <Modal
          visible={showBalanceDetailsModal}
          contentContainerStyle={styles.modalContent}
        >
          <SafeAreaView
            style={{ flex: 1, backgroundColor: theme.colors.surface }}
          >
            <View
              style={[
                styles.modalHeader,
                { backgroundColor: theme.colors.primary },
              ]}
            >
              <Text
                style={[styles.modalTitle, { color: theme.colors.surface }]}
              >
                Overall Balance Details
              </Text>
            </View>
            <TabView
              navigationState={{ index: balanceTabIndex, routes: balanceRoutes }}
              renderScene={renderBalanceScene}
              onIndexChange={setBalanceTabIndex}
              initialLayout={{ width: Dimensions.get("window").width }}
              renderTabBar={(props) => (
                <TabBar
                  {...props}
                  indicatorStyle={{ backgroundColor: theme.colors.accent }}
                  style={{ backgroundColor: theme.colors.primary }}
                  labelStyle={{ fontWeight: "bold" }}
                  activeColor={theme.colors.accent}
                  inactiveColor={theme.colors.surface}
                />
              )}
            />
          </SafeAreaView>
        </Modal>
      </Portal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    // padding: 10,
    paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight + 10 || 0 : 0,
    paddingBottom: 0,
  },
  scrollContent: {
    flexGrow: 1,
    width: "100%",
    padding: 10,
    paddingBottom: 80,
  },
  title: {
    fontSize: 28,
    fontWeight: "bold",
    textAlign: "left",
    width: "100%",
    paddingBottom: 15,
  },
  subtitle: {
    fontSize: 16,
    marginBottom: 10,
    textAlign: "left",
    lineHeight: 24,
    width: "100%",
  },
  summaryCardsContainer: {
    width: "100%",
    flexDirection: "row",
    justifyContent: "space-between",
    flexWrap: "wrap",
    paddingHorizontal: 2, // small padding to prevent edge clipping
  },
  summaryCard: {
    width: "47.5%", // reduce slightly to avoid wrapping/overflow on small screens
    borderRadius: 10,
    marginBottom: 15,
    overflow: "hidden",
  },
  balanceCard: {
    width: "100%",
    borderRadius: 12,
    marginBottom: 15,
    overflow: "hidden",
  },
  cardAccentStripe: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    width: 8,
    borderTopLeftRadius: 12,
    borderBottomLeftRadius: 12,
  },
  cardContent: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    width: "100%",
    paddingVertical: 5,
    paddingHorizontal: 15,
    paddingLeft: 18,
  },
  mainCardIcon: {
    marginRight: 15,
  },
  textAndAmountContainer: {
    flexDirection: "column",
    alignItems: "flex-start",
    flexShrink: 1,
  },
  titleAndArrowRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    width: "100%",
    marginBottom: 5,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: "600",
  },
  cardAmount: {
    fontSize: 22,
  },
  sectionCard: {
    minWidth: "100%",
    borderRadius: 12,
    marginBottom: 15,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "bold",
    verticalAlign: "middle",
    marginLeft: -15,
  },
  listItem: {
    paddingVertical: 0,
    paddingLeft: 0,
  },
  quickActionsContent: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    flexWrap: "wrap",
    marginTop: -25
  },
  quickActionButtonContainer: {
    alignItems: "center",
  },
  iconButton: {
    marginBottom: 4,
  },
  quickActionText: {
    fontSize: 12,
    textAlign: "center",
    lineHeight: 16,
  },
  categoryItem: {
    marginBottom: 15,
  },
  categoryTextRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 5,
  },
  categoryName: {
    fontSize: 15,
    fontWeight: "600",
    flex: 1,
    marginLeft: 8,
  },
  categoryAmount: {
    fontSize: 15,
    fontWeight: "bold",
  },
  progressBar: {
    height: 8,
    borderRadius: 4,
  },
  infoText: {
    fontSize: 14,
    marginTop: 20,
    textAlign: "center",
    paddingHorizontal: 10,
    marginBottom: 20,
  },
  fab: {
    position: "absolute",
    margin: 16,
    right: 0,
    bottom: 0,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  // Modal specific styles
  modalContent: {
    flex: 0,
    backgroundColor: "white",
    marginHorizontal: 12,
    marginVertical: 18,
    borderRadius: 16,
    overflow: 'hidden',
    justifyContent: "flex-start",
    alignItems: "stretch",
    maxHeight: Math.round(Dimensions.get('window').height * 0.9),
    width: '96%',
    alignSelf: 'center',
  },
  modalHeader: {
    width: "100%",
    flexDirection: "row",
    justifyContent: "center", // Centered title when no close button
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 15,
    elevation: 2,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 1.5,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: "bold",
  },
  modalBody: {
    flex: 1,
    width: "100%",
  },
  modalScrollContent: {
    flexGrow: 1,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  accordionHeader: {
    backgroundColor: "white",
    paddingLeft: 0,
  },
  accordionItem: {
    paddingLeft: 30,
  },
  noDataText: {
    textAlign: "center",
    marginTop: 20,
    fontStyle: "italic",
  },
  balanceSummaryText: {
    fontSize: 24,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 5,
  },
  balanceSummarySubtext: {
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 3,
  },
});
