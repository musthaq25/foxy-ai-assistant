const admin = require('firebase-admin');
const Razorpay = require('razorpay');

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

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID || 'rzp_test_TEaZoQs4IIFazC',
  key_secret: process.env.RAZORPAY_KEY_SECRET || 'test_secret'
});

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
      return res.status(200).json({ success: true, message: 'Simulated subscription cancellation.' });
    }

    const docSnap = await db.collection('users').doc(uid).get();
    if (docSnap.exists) {
      const data = docSnap.data();
      const subId = data.razorpaySubscriptionId;

      if (subId && !subId.startsWith('sub_mock_') && !subId.startsWith('trial_')) {
        try {
          await razorpay.subscriptions.cancel(subId);
        } catch (e) {
          console.warn('Failed to cancel subscription directly on Razorpay:', e.message);
        }
      }
    }

    await db.collection('users').doc(uid).collection('subscription').doc('status').set({
      isAutoRenewing: false,
    }, { merge: true });

    return res.status(200).json({ success: true, message: 'Subscription auto-renew cancelled.' });
  } catch (err) {
    console.error('Failed to cancel subscription:', err);
    return res.status(500).json({ error: 'Failed to cancel subscription.', details: err.message });
  }
};
