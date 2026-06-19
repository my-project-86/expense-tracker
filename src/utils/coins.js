// src/utils/coins.js
// Simple Firestore-backed coin balance helpers.

import { db, auth } from "../firebaseConfig";
import { doc, getDoc, setDoc, updateDoc, increment } from "firebase/firestore";

const USERS = "users";

export async function getUserCoins(uid = auth.currentUser?.uid) {
  if (!uid) return 0;
  const ref = doc(db, USERS, uid);
  const snap = await getDoc(ref);
  if (!snap.exists()) return 0;
  return Number(snap.data()?.coins || 0);
}

export async function ensureUserDoc(uid = auth.currentUser?.uid) {
  if (!uid) return;
  const ref = doc(db, USERS, uid);
  const snap = await getDoc(ref);
  if (!snap.exists()) {
    await setDoc(ref, { coins: 0 }, { merge: true });
  } else if (snap.data()?.coins === undefined) {
    await updateDoc(ref, { coins: 0 });
  }
}

export async function addCoins(amount = 0, uid = auth.currentUser?.uid) {
  if (!uid || !amount) return 0;
  const ref = doc(db, USERS, uid);
  await ensureUserDoc(uid);
  await updateDoc(ref, { coins: increment(amount) });
  return getUserCoins(uid);
}

export async function setCoins(amount = 0, uid = auth.currentUser?.uid) {
  if (!uid) return 0;
  const ref = doc(db, USERS, uid);
  await setDoc(ref, { coins: Number(amount) || 0 }, { merge: true });
  return getUserCoins(uid);
}