export const getActivityIconAndColor = (activity, currentUser) => {
    const { type, paidBy } = activity;
    const isCurrentUserPaid = paidBy === currentUser.uid;

    switch (type) {
        case "group_created": return { name: "account-group-outline", color: "#1E88E5" };
        case "group_renamed": return { name: "pencil-outline", color: "#757575" };
        case "group_description_updated": return { name: "text-box-outline", color: "#8E24AA" };
        case "expense_added": return { name: "arrow-up", color: isCurrentUserPaid ? "#4CAF50" : "#D32F2F" };
        case "expense_deleted": return { name: "delete-outline", color: "#757575" };
        case "expense_settled": return { name: "check", color: "#4CAF50" };
        case "expense_partially_settled": return { name: "check", color: "#FFB74D" };
        case "expense_title_updated": return { name: "pencil-outline", color: "#757575" };
        case "expense_amount_updated": return { name: "currency-inr-outline", color: "#009688" };
        case "expense_share_updated": return { name: "account-cash-outline", color: "#42A5F5" };
        case "expense_paidBy_updated": return { name: "swap-horizontal-outline", color: "#AB47BC" };
        case "expense_notes_updated": return { name: "note-text-outline", color: "#6D4C41" };
        case "expense_member_added": return { name: "account-plus-outline", color: "#4CAF50" };
        case "expense_member_removed": return { name: "account-minus-outline", color: "#D32F2F" };
        case "member_added_to_group": return { name: "account-plus-outline", color: "#1E88E5" };
        case "member_removed_from_group": return { name: "account-minus-outline", color: "#E53935" };
        case "group_all_expenses_settled": return { name: "check", color: "#4CAF50" };
        case "member_all_expenses_settled": return { name: "check", color: "#4CAF50" };
        default: return { name: "information-outline", color: "#757575" };
    }
};

export const renderActivityText = (activity, currentUser) => {
    const isCurrentUser = activity?.createdBy === currentUser.uid;
    const paidByYou = activity?.paidBy === currentUser.uid;
    const settledByYou = activity?.settledBy === currentUser.uid;
    const isUpdatingSelf = activity.targetUserId === currentUser.uid;

    switch (activity.type) {
        case "group_created":
            return isCurrentUser
                ? `You created the group "${activity.groupName}"`
                : `${activity.createdByName} created the group "${activity.groupName}"`;

        case "group_renamed":
            return isCurrentUser
                ? `You renamed the group from "${activity.oldName}" to "${activity.newName}"`
                : `${activity.createdByName} renamed the group from "${activity.oldName}" to "${activity.newName}"`;

        case "group_description_updated":
            return isCurrentUser
                ? `You updated the description of "${activity.groupName}" to "${activity.newDescription}"`
                : `${activity.createdByName} updated the description of "${activity.groupName}" to "${activity.newDescription}"`;

        case "expense_added":
            return paidByYou
                ? `You paid for ${activity.expenseName} in "${activity.groupName}"`
                : `${activity.paidByName} paid for ${activity.expenseName} in "${activity.groupName}"`;

        case "expense_deleted":
            return isCurrentUser
                ? `You deleted the expense "${activity.expenseName}" in "${activity.groupName}"`
                : `${activity.createdByName} deleted the expense "${activity.expenseName}" in "${activity.groupName}"`;

        case "expense_settled":
            return isCurrentUser
                ? `You marked "${activity.expenseName}" as fully settled in "${activity.groupName}"`
                : `${activity.createdByName} marked "${activity.expenseName}" as fully settled in "${activity.groupName}"`;

        case "expense_partially_settled":
            return settledByYou
                ? `You settled ${activity.amount} for "${activity.expenseName}" in "${activity.groupName}"`
                : `${activity.createdByName} settled ${activity.amount} for "${activity.expenseName}" in "${activity.groupName}"`;

        case "expense_title_updated":
            return isCurrentUser
                ? `You renamed the expense from "${activity.oldName}" to "${activity.newName}" in "${activity.groupName}"`
                : `${activity.createdByName} renamed the expense from "${activity.oldName}" to "${activity.newName}" in "${activity.groupName}"`;

        case "expense_amount_updated":
            return isCurrentUser
                ? `You changed the amount from ₹${activity.oldAmount} to ₹${activity.newAmount} for "${activity.expenseName}"`
                : `${activity.createdByName} changed the amount from ₹${activity.oldAmount} to ₹${activity.newAmount} for "${activity.expenseName}"`;

        case "expense_share_updated":
            return isUpdatingSelf
                ? `You updated your share from ₹${activity.oldShare} to ₹${activity.newShare} in "${activity.expenseName}"`
                : isCurrentUser
                    ? `You updated ${activity.targetUserName}'s share from ₹${activity.oldShare} to ₹${activity.newShare} in "${activity.expenseName}"`
                    : `${activity.createdByName} updated ${activity.targetUserName}'s share from ₹${activity.oldShare} to ₹${activity.newShare} in "${activity.expenseName}"`;

        case "expense_paidBy_updated":
            return isCurrentUser
                ? `You changed the payer from "${activity.oldPayer}" to "${activity.newPayer}" for "${activity.expenseName}"`
                : `${activity.createdByName} changed the payer from "${activity.oldPayer}" to "${activity.newPayer}" for "${activity.expenseName}"`;

        case "expense_notes_updated":
            return isCurrentUser
                ? `You updated the notes for "${activity.expenseName}"`
                : `${activity.createdByName} updated the notes for "${activity.expenseName}"`;

        case "expense_member_added":
            return isCurrentUser
                ? `You added ${activity.targetUserName} to the expense "${activity.expenseName}"`
                : `${activity.createdByName} added ${activity.targetUserName} to the expense "${activity.expenseName}"`;

        case "expense_member_removed":
            return isCurrentUser
                ? `You removed ${activity.targetUserName} from the expense "${activity.expenseName}"`
                : `${activity.createdByName} removed ${activity.targetUserName} from the expense "${activity.expenseName}"`;

        case "member_added_to_group":
            return isCurrentUser
                ? `You added ${activity.targetUserName} to "${activity.groupName}"`
                : `${activity.createdByName} added ${activity.targetUserName} to "${activity.groupName}"`;

        case "member_removed_from_group":
            return isCurrentUser
                ? `You removed ${activity.targetUserName} from "${activity.groupName}"`
                : `${activity.createdByName} removed ${activity.targetUserName} from "${activity.groupName}"`;

        case "group_all_expenses_settled":
            return isCurrentUser
                ? `You settled all expenses in "${activity.groupName}" (${activity.count || 0} updated)`
                : `${activity.createdByName} settled all expenses in "${activity.groupName}" (${activity.count || 0} updated)`;

        case "member_all_expenses_settled":
            return isCurrentUser
                ? `You settled all dues with ${activity.targetUserName} in "${activity.groupName}" (${activity.count || 0} expense${(activity.count||0)===1?"":"s"})`
                : `${activity.createdByName} settled all dues with ${activity.targetUserName} in "${activity.groupName}" (${activity.count || 0} expense${(activity.count||0)===1?"":"s"})`;

        default:
            return activity.description || "Unknown activity";
    }
};

export  const formatDateTime = (timestamp) => {
        if (!timestamp) return '';
        return new Intl.DateTimeFormat('en-US', {
            month: 'short', day: '2-digit', year: 'numeric',
            hour: 'numeric', minute: '2-digit', hour12: true,
        }).format(new Date(timestamp.seconds * 1000));
    };
