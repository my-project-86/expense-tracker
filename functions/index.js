const admin = require("firebase-admin");
const { onDocumentCreated, onDocumentUpdated } = require("firebase-functions/v2/firestore");
const logger = require("firebase-functions/logger");

admin.initializeApp();

// --- Helpers ---
function chunkArray(arr, size) {
  const res = [];
  for (let i = 0; i < arr.length; i += size) res.push(arr.slice(i, i + size));
  return res;
}

async function fetchExpoPush(messages) {
  const res = await fetch("https://exp.host/--/api/v2/push/send", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(messages),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    logger.error("Expo push send failed", { status: res.status, text });
    return null;
  }
  const json = await res.json().catch(() => ({}));
  if (json?.data) {
    const hasErrors = json.data.some((t) => t.status !== "ok");
    if (hasErrors) logger.warn("Expo push tickets contain errors", json.data);
  }
  return json;
}

async function getGroupMemberTokens(groupId, excludeUid) {
  const groupSnap = await admin.firestore().collection("groups").doc(groupId).get();
  const groupData = groupSnap.data() || {};
  const memberUIDs = Array.isArray(groupData.memberUIDs) ? groupData.memberUIDs : [];
  if (memberUIDs.length === 0) return [];

  const expoTokens = [];
  for (const batch of chunkArray(memberUIDs, 10)) {
    const qs = await admin
      .firestore()
      .collection("users")
      .where(admin.firestore.FieldPath.documentId(), "in", batch)
      .get();
    qs.forEach((doc) => {
      const uid = doc.id;
      if (excludeUid && uid === excludeUid) return; // skip actor
      const data = doc.data() || {};
      const tokens = Array.isArray(data.expoPushTokens) ? data.expoPushTokens : [];
      tokens.forEach((t) => {
        if (typeof t === "string" && t.startsWith("ExponentPushToken")) expoTokens.push(t);
      });
    });
  }
  return expoTokens;
}

function formatActivityMessage(activity, groupName) {
  const actor = activity.createdByName || "Someone";
  const title = groupName ? `${groupName}` : "Group Update";

  switch (activity.type) {
    case "expense_created":
      return { title, body: `${actor} added ${activity.expenseTitle || "an expense"} (₹${activity.amount ?? ""})` };
    case "expense_updated":
      return { title, body: `${actor} updated ${activity.expenseTitle || "an expense"}` };
    case "expense_deleted":
      return { title, body: `${actor} deleted ${activity.expenseTitle || "an expense"}` };

    case "member_added":
      return { title, body: `${actor} added ${activity.memberName || "a member"}` };
    case "member_removed":
      return { title, body: `${actor} removed ${activity.memberName || "a member"}` };

    case "group_renamed":
      return { title, body: `${actor} renamed the group to ${activity.newName || "new name"}` };
    case "settlement_recorded":
      return { title, body: `${actor} recorded a settlement of ₹${activity.amount ?? ""}` };
    case "comment_added":
      return { title, body: `${actor} commented: ${activity.comment?.slice(0, 80) || "New comment"}` };

    default:
      return { title, body: `${actor} made a change in the group` };
  }
}

// --- Trigger: Expense created (legacy direct trigger) ---
exports.notifyGroupMembers = onDocumentCreated(
  "groups/{groupId}/expenses/{expenseId}",
  async (event) => {
    const snap = event.data; // QueryDocumentSnapshot
    if (!snap) return null;
    const expense = snap.data();
    const { groupId, expenseId } = event.params;

    try {
      const groupSnap = await admin.firestore().collection("groups").doc(groupId).get();
      const groupData = groupSnap.data() || {};
      const groupName = groupData.name || "Group";

      const expoTokens = await getGroupMemberTokens(groupId, expense.paidBy);
      if (expoTokens.length === 0) return null;

      const title = groupName;
      const body = `${expense.paidByName || "Someone"} added ${expense.title || "an expense"} (${expense.amount ?? ""})`;

      for (const chunk of chunkArray(expoTokens, 100)) {
        const messages = chunk.map((to) => ({
          to,
          title,
          body,
          sound: "default",
          channelId: "default",
          data: { groupId, expenseId, type: "expense_created" },
        }));
        await fetchExpoPush(messages);
      }
      return null;
    } catch (err) {
      logger.error("notifyGroupMembers error", err);
      return null;
    }
  }
);

// --- Generic Trigger: Any activity logged under groups/{groupId}/activity ---
exports.notifyOnActivity = onDocumentCreated(
  "groups/{groupId}/activity/{activityId}",
  async (event) => {
    const snap = event.data;
    if (!snap) return null;
    const activity = snap.data() || {};
    const { groupId, activityId } = event.params;

    try {
      const groupSnap = await admin.firestore().collection("groups").doc(groupId).get();
      const groupData = groupSnap.data() || {};
      const groupName = groupData.name || "Group";

      const expoTokens = await getGroupMemberTokens(groupId, activity.createdBy);
      if (expoTokens.length === 0) return null;

      const { title, body } = formatActivityMessage(activity, groupName);

      for (const chunk of chunkArray(expoTokens, 100)) {
        const messages = chunk.map((to) => ({
          to,
          title,
          body,
          sound: "default",
          channelId: "default",
          data: {
            groupId,
            activityId,
            type: activity.type || "group_activity",
            meta: { expenseId: activity.expenseId || null },
          },
        }));
        await fetchExpoPush(messages);
      }

      return null;
    } catch (err) {
      logger.error("notifyOnActivity error", err);
      return null;
    }
  }
);

// --- NEW: Propagate user displayName changes across denormalized data ---
async function updateMemberNamesInGroup(groupRef, uid, newName) {
  const snap = await groupRef.get();
  if (!snap.exists) return;
  const data = snap.data() || {};
  const members = Array.isArray(data.members) ? data.members : [];

  let changed = false;
  const updatedMembers = members.map((m) => {
    if (m?.uid === uid && m?.displayName !== newName) {
      changed = true;
      return { ...m, displayName: newName };
    }
    return m;
  });

  if (changed) {
    await groupRef.update({ members: updatedMembers });
  }
}

async function updateActivityNamesForUser(groupId, uid, newName) {
  const db = admin.firestore();
  const activityCol = db.collection("groups").doc(groupId).collection("activity");

  const batches = [];
  let batch = db.batch();
  let ops = 0;

  const applyUpdate = (ref, data) => {
    batch.update(ref, data);
    ops += 1;
    if (ops >= 450) {
      batches.push(batch);
      batch = db.batch();
      ops = 0;
    }
  };

  // createdByName
  const createdBySnap = await activityCol.where("createdBy", "==", uid).get();
  createdBySnap.forEach((docSnap) => {
    const d = docSnap.data() || {};
    if (d.createdByName !== newName) applyUpdate(docSnap.ref, { createdByName: newName });
  });

  // memberName
  const memberUidSnap = await activityCol.where("memberUid", "==", uid).get();
  memberUidSnap.forEach((docSnap) => {
    const d = docSnap.data() || {};
    if (d.memberName !== newName) applyUpdate(docSnap.ref, { memberName: newName });
  });

  // targetUserName
  const targetUserSnap = await activityCol.where("targetUserId", "==", uid).get();
  targetUserSnap.forEach((docSnap) => {
    const d = docSnap.data() || {};
    if (d.targetUserName !== newName) applyUpdate(docSnap.ref, { targetUserName: newName });
  });

  if (ops > 0) batches.push(batch);
  for (const b of batches) await b.commit().catch(() => {});
}

async function updateExpensePayerNamesForUser(groupId, uid, newName) {
  const db = admin.firestore();
  const expensesCol = db.collection("groups").doc(groupId).collection("expenses");
  const qs = await expensesCol.where("paidBy", "==", uid).get();

  const batches = [];
  let batch = db.batch();
  let ops = 0;
  qs.forEach((docSnap) => {
    const d = docSnap.data() || {};
    if (d.paidByName !== newName) {
      batch.update(docSnap.ref, { paidByName: newName });
      ops += 1;
      if (ops >= 450) {
        batches.push(batch);
        batch = db.batch();
        ops = 0;
      }
    }
  });
  if (ops > 0) batches.push(batch);
  for (const b of batches) await b.commit().catch(() => {});
}

async function updateInlineActivitiesInGroup(groupRef, uid, newName) {
  const snap = await groupRef.get();
  if (!snap.exists) return;
  const data = snap.data() || {};
  const activities = Array.isArray(data.activities) ? data.activities : [];

  if (activities.length === 0) return;

  let changed = false;
  const updated = activities.map((a) => {
    const c = { ...a };
    if (c.createdBy === uid && c.createdByName !== newName) {
      c.createdByName = newName;
      changed = true;
    }
    if (c.memberUid === uid && c.memberName !== newName) {
      c.memberName = newName;
      changed = true;
    }
    if (c.targetUserId === uid && c.targetUserName !== newName) {
      c.targetUserName = newName;
      changed = true;
    }
    return c;
  });

  if (changed) {
    await groupRef.update({ activities: updated });
  }
}

exports.propagateUserDisplayName = onDocumentUpdated("users/{uid}", async (event) => {
  const before = event.data?.before?.data() || {};
  const after = event.data?.after?.data() || {};
  const uid = event.params.uid;

  const oldName = before.displayName || "";
  const newName = after.displayName || "";

  if (!uid || !newName || newName === oldName) return null;

  const db = admin.firestore();

  try {
    const groupsSnap = await db
      .collection("groups")
      .where("memberUIDs", "array-contains", uid)
      .get();

    for (const groupDoc of groupsSnap.docs) {
      const groupRef = db.collection("groups").doc(groupDoc.id);

      // 1) Update members[].displayName
      await updateMemberNamesInGroup(groupRef, uid, newName);

      // 2) Update expenses payer name
      await updateExpensePayerNamesForUser(groupDoc.id, uid, newName);

      // 3) Update activity subcollection docs
      await updateActivityNamesForUser(groupDoc.id, uid, newName);

      // 4) Optional: Update inline activities array (if used for UI)
      await updateInlineActivitiesInGroup(groupRef, uid, newName);
    }
  } catch (err) {
    logger.error("propagateUserDisplayName error", err);
  }

  return null;
});
