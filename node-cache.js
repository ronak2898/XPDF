"use strict";
const NodeCache = require("node-cache");
const nc = new NodeCache();

const {
  initializeApp,
  applicationDefault,
  cert,
} = require("firebase-admin/app");
const {
  getFirestore,
  Timestamp,
  FieldValue,
  Filter,
} = require("firebase-admin/firestore");
const serviceAccount = require("./skynet-12246-df9a6a776eea.json");
initializeApp({
  credential: cert(serviceAccount),
});

const db = getFirestore();

module.exports = {
  setCache: async function (key, value) {
    try {
      const docRef = db.collection("users").doc(key.toString());
      await docRef.set(value);
    } catch (error) {
      console.log(error);
    }
    return true;
  },

  getCache: async function (key) {
    const users = db.collection("users").doc(key.toString());
    const doc = await users.get();
    return doc.exists ? doc.data() : false;
  },

  deleteCache: async function (key) {
    await db.collection("users").doc(key.toString()).delete();
    return true;
  },

  flushAllCache: async function () {
    // const collectionRef = db.collection("users");
    // const snapshot = await collectionRef.get();
    // if (snapshot.size) {
    //   const batch = db.batch();
    //   snapshot.docs.forEach((doc) => {
    //     batch.delete(doc.ref);
    //   });
    //   await batch.commit();
    // }
    return true;
  },
};
