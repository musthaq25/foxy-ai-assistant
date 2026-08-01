const admin = require('firebase-admin');

// Polyfill for bundler compatibility
if (!admin.apps || admin.apps.length === 0) {
  try {
    if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
      const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
      });
    } else {
      admin.initializeApp();
    }
  } catch (err) {
    console.warn('Firebase Admin failed to initialize:', err.message);
  }
}

if (!admin.auth) {
  try {
    const { getAuth } = require('firebase-admin/auth');
    admin.auth = getAuth;
  } catch (e) {}
}
if (!admin.firestore) {
  try {
    const { getFirestore, FieldValue, Timestamp } = require('firebase-admin/firestore');
    const firestoreFn = getFirestore;
    firestoreFn.FieldValue = FieldValue;
    firestoreFn.Timestamp = Timestamp;
    admin.firestore = firestoreFn;
  } catch (e) {}
}

const db = (admin.apps && admin.apps.length > 0) ? admin.firestore() : null;

async function updateUserSubscriptionInFirestore(uid, tier, expiresAt, subscriptionId, planId, email) {
  if (!db) return;

  const userRef = db.collection('users').doc(uid);
  const userFields = {
    premium: tier !== 'free',
    subscriptionPlan: planId || tier,
    subscriptionStatus: tier !== 'free' ? 'active' : 'expired',
    currentPlan: planId || tier,
    purchaseDate: admin.firestore.FieldValue.serverTimestamp(),
    expiryDate: expiresAt ? admin.firestore.Timestamp.fromDate(new Date(expiresAt)) : null,
    paymentId: subscriptionId,
    orderId: subscriptionId,
    autoRenew: tier !== 'free',
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    premiumActivatedAt: tier !== 'free' ? admin.firestore.FieldValue.serverTimestamp() : null,
  };

  if (email) userFields.email = email;
  userFields.premiumTier = tier;
  userFields.subscriptionExpiresAt = expiresAt ? admin.firestore.Timestamp.fromDate(new Date(expiresAt)) : null;
  userFields.razorpaySubscriptionId = subscriptionId;
  userFields.razorpayPlanId = planId;

  await userRef.set(userFields, { merge: true });

  const subRef = userRef.collection('subscription').doc('status');
  await subRef.set(
    {
      plan: tier,
      isPro: tier === 'pro',
      subscriptionStatus: tier !== 'free' ? 'active' : 'expired',
      currentPlan: planId || tier,
      purchaseDate: admin.firestore.FieldValue.serverTimestamp(),
      expiryDate: expiresAt ? admin.firestore.Timestamp.fromDate(new Date(expiresAt)) : null,
      isAutoRenewing: tier !== 'free',
      autoRenew: tier !== 'free',
      razorpaySubscriptionId: subscriptionId,
      razorpayPlanId: planId,
      paymentId: subscriptionId,
      orderId: subscriptionId,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true }
  );
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).send('Method Not Allowed');
  }

  try {
    const { uid } = req.body;

    if (!uid) {
      return res.status(400).json({ error: 'uid is required' });
    }

    if (!db) {
      return res.status(200).json({ success: true, message: 'Simulated trial start.' });
    }

    const subDoc = await db.collection('users').doc(uid).collection('subscription').doc('status').get();
    if (subDoc.exists) {
      const data = subDoc.data();
      if (data.trialStartedAt || data.plan !== 'free') {
        return res.status(400).json({ error: 'This account has already used their free trial or is currently subscribed.' });
      }
    }

    const expiryDate = new Date();
    expiryDate.setDate(expiryDate.getDate() + 14); // 14-day trial

    await updateUserSubscriptionInFirestore(uid, 'pro', expiryDate, 'trial_subscription', 'plan_pro_monthly');

    await db.collection('users').doc(uid).collection('subscription').doc('status').set({
      isTrial: true,
      trialStartedAt: admin.firestore.FieldValue.serverTimestamp(),
      expiryDate: admin.firestore.Timestamp.fromDate(expiryDate),
      isLifetime: false,
      isFounder: false,
    }, { merge: true });

    return res.status(200).json({ success: true, message: '14-Day Pro Free Trial started successfully.' });
  } catch (err) {
    console.error('Failed to start trial:', err);
    return res.status(500).json({ error: 'Failed to initialize free trial.', details: err.message });
  }
};
