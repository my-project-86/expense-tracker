// One-time script to backfill groups.memberUIDs from groups.members
// Usage: npm run backfill:memberUIDs

const admin = require('firebase-admin');

(async function main() {
  try {
    // Initialize using default credentials (same as Cloud Functions admin SDK)
    if (admin.apps.length === 0) {
      admin.initializeApp();
    }

    const db = admin.firestore();

    console.log('Starting backfill of memberUIDs...');
    const groupsSnap = await db.collection('groups').get();

    let updated = 0;
    for (const doc of groupsSnap.docs) {
      const group = doc.data() || {};

      const existing = Array.isArray(group.memberUIDs) ? group.memberUIDs : [];
      const members = Array.isArray(group.members) ? group.members : [];

      // Build UID list from members[] if present
      const fromMembers = members
        .map((m) => (m && typeof m.uid === 'string' ? m.uid : null))
        .filter(Boolean);

      // Skip if already present and matches
      const needsUpdate = fromMembers.length > 0 && (
        existing.length === 0 || existing.sort().join(',') !== fromMembers.sort().join(',')
      );

      if (needsUpdate) {
        await doc.ref.update({ memberUIDs: fromMembers });
        updated += 1;
        console.log(`Updated group ${doc.id} -> memberUIDs count: ${fromMembers.length}`);
      }
    }

    console.log(`Backfill complete. Groups updated: ${updated}`);
    process.exit(0);
  } catch (err) {
    console.error('Backfill failed:', err);
    process.exit(1);
  }
})();