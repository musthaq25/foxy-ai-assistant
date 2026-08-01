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

function generateOtp() {
  return Math.floor(100000 + Math.random() * 900000).toString();
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
    const { email } = req.body;

    if (!email || typeof email !== 'string') {
      return res.status(400).json({ error: 'Email is required' });
    }

    const cleanEmail = email.trim().toLowerCase();
    const otp = generateOtp();
    const expiryTime = Date.now() + 5 * 60 * 1000; // 5 minutes
    const expiryDate = new Date(expiryTime);

    if (db) {
      await db.collection('otp_codes').doc(cleanEmail).set({
        otp,
        expiry: admin.firestore.Timestamp.fromDate(expiryDate),
        createdAt: admin.firestore.FieldValue.serverTimestamp()
      });
      console.log(`[AUTH] Saved OTP for ${cleanEmail} to Firestore: ${otp}`);
    }

    const serviceId = process.env.EMAILJS_SERVICE_ID || 'foxy';
    const templateId = process.env.EMAILJS_TEMPLATE_ID || 'template_hc21mln';
    const publicKey = process.env.EMAILJS_PUBLIC_KEY || 'YvhNw5hmQqMlcYM4y';

    const response = await fetch('https://api.emailjs.com/api/v1.0/email/send', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        service_id: serviceId,
        template_id: templateId,
        user_id: publicKey,
        template_params: {
          otp: otp,
          user_email: cleanEmail,
        },
      }),
    });

    if (response.ok) {
      console.log(`[AUTH] OTP sent successfully to ${cleanEmail}`);
      return res.status(200).json({ success: true });
    } else {
      const errText = await response.text();
      console.error(`[AUTH] EmailJS failed: ${response.status} - ${errText}`);
      return res.status(500).json({ error: 'Failed to send verification email' });
    }
  } catch (err) {
    console.error('[AUTH] Send OTP error:', err);
    return res.status(500).json({ error: 'Internal failure sending OTP', details: err.message });
  }
};
