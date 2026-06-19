// Logs a group activity into groups/{groupId}/activity to trigger push notifications
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { db, auth } from '../firebaseConfig';

/**
 * Log an activity. The Cloud Function listens here and sends notifications.
 *
 * @param {string} groupId - Group document id
 * @param {object} activity - { type, ...extraFields }
 *  Common types:
 *   - 'group_created'      { newName }
 *   - 'group_renamed'      { newName }
 *   - 'member_added'       { memberUid, memberName }
 *   - 'member_removed'     { memberUid, memberName }
 *   - 'expense_created'    { expenseId, expenseTitle, amount }
 *   - 'expense_updated'    { expenseId, expenseTitle }
 *   - 'expense_deleted'    { expenseId, expenseTitle }
 *   - 'settlement_recorded'{ amount }
 *   - 'comment_added'      { comment }
 */
export async function logGroupActivity(groupId, activity) {
  const user = auth.currentUser;
  if (!groupId || !user || !activity?.type) return;

  const payload = {
    ...activity,
    groupId,
    createdAt: serverTimestamp(),
    createdBy: user.uid,
    createdByName: user.displayName || user.email || 'Someone',
  };

  await addDoc(collection(db, 'groups', groupId, 'activity'), payload);
}