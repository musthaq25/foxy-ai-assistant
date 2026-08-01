const admin = require('firebase-admin');

// Initialize Firebase Admin
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

// Polyfill admin properties
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

function decodeJwtPayload(token) {
  try {
    const parts = token.split('.');
    if (parts.length < 2) return null;
    return JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
  } catch (err) {
    return null;
  }
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).send('Method Not Allowed');
  }

  try {
    const { idToken, deviceId, action } = req.body;

    if (!idToken || !deviceId) {
      return res.status(400).json({ error: 'idToken and deviceId are required' });
    }

    let uid = null;
    try {
      if (admin.auth && admin.apps && admin.apps.length > 0) {
        const decoded = await admin.auth().verifyIdToken(idToken);
        uid = decoded.uid;
      }
    } catch (e) {
      console.warn('Firebase ID Token verification failed:', e.message);
    }

    // Fallback decoding
    if (!uid) {
      const payload = decodeJwtPayload(idToken);
      if (payload && payload.user_id) {
        uid = payload.user_id;
      }
    }

    if (!uid) {
      return res.status(401).json({ error: 'Unauthorized: Invalid ID Token' });
    }

    if (!db) {
      return res.status(200).json({ success: true, allowed: true, message: 'Database offline' });
    }

    // Route based on action
    if (action === 'replace') {
      // ---- REPLACE DEVICE ----
      const devicesRef = db.collection('users').doc(uid).collection('active_devices');
      
      // Batch delete all existing devices
      const snap = await devicesRef.get();
      const batch = db.batch();
      snap.docs.forEach((doc) => {
        batch.delete(doc.ref);
      });
      await batch.commit();

      // Register new device
      await devicesRef.doc(deviceId).set({
        registeredAt: admin.firestore.FieldValue.serverTimestamp(),
        lastActive: admin.firestore.FieldValue.serverTimestamp()
      });

      return res.status(200).json({ success: true });
    } else {
      // ---- CHECK DEVICE (default) ----
      // 1. Get user subscription status
      const userDoc = await db.collection('users').doc(uid).get();
      const userData = userDoc.exists ? userDoc.data() : {};
      
      const isPremium = userData.premium === true;
      const currentPlan = userData.currentPlan || 'free';
      const isPro = currentPlan.includes('pro') || currentPlan.includes('lifetime') || currentPlan.includes('pass');
      const isBasic = currentPlan.includes('basic') && !isPro;
      const tier = isPro ? 'pro' : (isBasic ? 'basic' : 'free');

      // Free limit = 1 device, Basic/Pro = 5 devices
      const deviceLimit = tier === 'free' ? 1 : 5;

      // 2. Check active devices
      const devicesRef = db.collection('users').doc(uid).collection('active_devices');
      const deviceDoc = await devicesRef.doc(deviceId).get();

      if (deviceDoc.exists) {
        // Device is already registered, update last active
        await devicesRef.doc(deviceId).update({
          lastActive: admin.firestore.FieldValue.serverTimestamp()
        });
        return res.status(200).json({ success: true, allowed: true, tier, deviceLimit });
      }

      // New device registration check
      const allDevicesSnap = await devicesRef.get();
      const activeDeviceCount = allDevicesSnap.size;

      if (activeDeviceCount >= deviceLimit) {
        return res.status(200).json({
          success: true,
          allowed: false,
          replaceRequired: true,
          tier,
          deviceLimit,
          activeDeviceCount
        });
      }

      // Within limit, register it
      await devicesRef.doc(deviceId).set({
        registeredAt: admin.firestore.FieldValue.serverTimestamp(),
        lastActive: admin.firestore.FieldValue.serverTimestamp()
      });

      return res.status(200).json({ success: true, allowed: true, tier, deviceLimit });
    }
  } catch (err) {
    console.error('Device endpoint failed:', err);
    return res.status(500).json({ error: 'Internal failure in device endpoint', details: err.message });
  }
};
