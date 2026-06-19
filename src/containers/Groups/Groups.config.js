import { StyleSheet } from 'react-native';

export const youOweBalance = (expenses, currentUID) => {

  const ispentForMembers = expenses?.filter(expense => expense?.paidBy === currentUID)?.map(expense => (expense.splitAmong)).flat()?.reduce((sum, member) => {
    return sum + (member?.due || 0);
  }, 0) || 0;

  const membersSpentForMe = expenses?.filter(expense => expense?.paidBy !== currentUID)?.map(expense => (expense.splitAmong)).flat()?.reduce((sum, member) => {
    return sum + (member?.due || 0);
  }, 0) || 0;

  return ispentForMembers - membersSpentForMe;
};

export const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    paddingTop: 60, // Adjust for status bar
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    marginBottom: 15,
    textAlign: "left",
    width: '100%',
  },
  subtitle: {
    fontSize: 16,
    textAlign: 'left',
    marginBottom: 20,
    width: '100%',
  },
  groupList: {
    width: '100%',
    flexGrow: 1,
    padding: 10
  },
  groupCard: {
    width: '100%',
    borderRadius: 12,
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 3,
    marginBottom: 15,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 5,
  },
  groupName: {
    fontSize: 20,
    fontWeight: 'bold',
    flexShrink: 1,
    marginRight: 10,
  },
  groupMembers: {
    fontSize: 14,
  },
  balanceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
     marginTop: 4,
  },
  groupBalance: {
    fontSize: 16,
    fontWeight: '600',
  },
  lastActivity: {
    fontSize: 12,
    fontStyle: 'italic',
  },
  emptyStateContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
    marginTop: 50,
  },
  emptyStateIcon: {
    marginBottom: 20,
  },
  emptyStateText: {
    fontSize: 16,
    textAlign: 'center',
    lineHeight: 24,
  },
  fab: {
    position: 'absolute',
    margin: 16,
    right: 0,
    bottom: 0,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
//   cardHeader: {
//   flexDirection: 'row',
//   alignItems: 'center',
//   marginBottom: 12,
// },
avatar: {
  marginRight: 12,
  backgroundColor: 'transparent',
},
headerText: {
  flex: 1,
},
cardHeader: {
  marginBottom: 12,
},

avatar: {
  backgroundColor: 'transparent', // overridden inline with theme color
},
});