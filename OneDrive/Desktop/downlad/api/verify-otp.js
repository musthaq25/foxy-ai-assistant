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
    console.warn('Firebase Admin initialization failure:', err.message);
  }
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
    const { email, otp } = req.body;

    if (!email || !otp) {
      return res.status(400).json({ error: 'Email and OTP are required' });
    }

    const cleanEmail = email.trim().toLowerCase();

    if (!db) {
      // Simulate verification if DB is not initialized
      if (otp.trim() === '123456') {
        return res.status(200).json({ success: true });
      }
      return res.status(400).json({ error: 'Invalid verification code (Simulation requires 123456)' });
    }

    const docSnap = await db.collection('otp_codes').doc(cleanEmail).get();

    if (!docSnap.exists) {
      return res.status(400).json({ error: 'No verification code found for this email' });
    }

    const data = docSnap.data();
    const expiry = data.expiry.toDate();

    if (Date.now() > expiry.getTime()) {
      await db.collection('otp_codes').doc(cleanEmail).delete();
      return res.status(400).json({ error: 'Verification code has expired' });
    }

    const isValid = data.otp === otp.trim();
    if (isValid) {
      await db.collection('otp_codes').doc(cleanEmail).delete();
      return res.status(200).json({ success: true });
    } else {
      return res.status(400).json({ error: 'Invalid verification code' });
    }
  } catch (err) {
    console.error('[AUTH] Verify OTP error:', err);
    return res.status(500).json({ error: 'Internal failure verifying OTP', details: err.message });
  }
};
