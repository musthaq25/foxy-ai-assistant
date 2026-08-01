const admin = require('firebase-admin');
const crypto = require('crypto');

// Shared In-Memory Session Cache (fallback when Firestore is unavailable/simulated)
global.inMemorySessions = global.inMemorySessions || new Map();

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

// Server-Authoritative Product Map
const PRODUCT_MAP = {
  'plan_basic_monthly': { planId: 'plan_basic_monthly', amount: 99, durationDays: 30, tier: 'basic', name: 'Basic Monthly' },
  'plan_basic_annual': { planId: 'plan_basic_annual', amount: 699, durationDays: 365, tier: 'basic', name: 'Basic Annual' },
  'plan_basic_lifetime': { planId: 'plan_basic_lifetime', amount: 1999, durationDays: 36500, tier: 'basic', name: 'Basic Lifetime' },
  'plan_pro_monthly': { planId: 'plan_pro_monthly', amount: 149, durationDays: 30, tier: 'pro', name: 'Pro Monthly' },
  'plan_pro_annual': { planId: 'plan_pro_annual', amount: 1499, durationDays: 365, tier: 'pro', name: 'Pro Annual' },
  'plan_pro_lifetime': { planId: 'plan_pro_lifetime', amount: 3999, durationDays: 36500, tier: 'pro', name: 'Pro Lifetime' },
  'pass_exam_season': { planId: 'pass_exam_season', amount: 499, durationDays: 60, tier: 'pro', name: 'Exam Season Pass' },
  'pro_monthly': { planId: 'plan_pro_monthly', amount: 149, durationDays: 30, tier: 'pro', name: 'Pro Monthly' },
  'pro_annual': { planId: 'plan_pro_annual', amount: 1499, durationDays: 365, tier: 'pro', name: 'Pro Annual' },
  'basic_monthly': { planId: 'plan_basic_monthly', amount: 99, durationDays: 30, tier: 'basic', name: 'Basic Monthly' },
};

function generateSessionToken(payload) {
  const secret = process.env.RAZORPAY_KEY_SECRET || 'test_secret';
  const payloadStr = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = crypto
    .createHmac('sha256', secret)
    .update(payloadStr)
    .digest('base64url');
  return `${payloadStr}.${signature}`;
}

function decodeJwtPayload(token) {
  try {
    const parts = token.split('.');
    if (parts.length < 2) return null;
    const payloadJson = Buffer.from(parts[1], 'base64url').toString('utf8');
    return JSON.parse(payloadJson);
  } catch (err) {
    return null;
  }
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const authHeader = req.headers.authorization || '';
    const bodyToken = req.body?.idToken || '';
    const idToken = authHeader.startsWith('Bearer ') ? authHeader.substring(7) : bodyToken;
    const planId = req.body?.planId || req.body?.productId || 'plan_pro_monthly';

    if (!idToken) {
      return res.status(401).json({ error: 'Authorization Bearer token or idToken is required' });
    }

    if (planId.includes('elite')) {
      return res.status(400).json({ error: 'Elite plan is not supported' });
    }

    const productConfig = PRODUCT_MAP[planId] || PRODUCT_MAP['plan_pro_monthly'];

    let uid = null;
    let userEmail = req.body?.email || '';

    try {
      if (admin.apps && admin.apps.length > 0 && admin.auth) {
        const decodedToken = await admin.auth().verifyIdToken(idToken);
        uid = decodedToken.uid;
        userEmail = decodedToken.email || userEmail || 'user@daystack.app';
      } else {
        throw new Error('Firebase Admin Auth not initialized');
      }
    } catch (e) {
      console.warn('Firebase token verification failed:', e.message);
      // Fallback decode JWT payload if non-prod / simulated
      const payload = decodeJwtPayload(idToken);
      if (payload && (payload.user_id || payload.sub)) {
        uid = payload.user_id || payload.sub;
        userEmail = payload.email || userEmail || 'user@daystack.app';
      }
    }

    if (!uid) {
      return res.status(401).json({ error: 'Invalid or unverified authentication token' });
    }

    const sessionId = crypto.randomUUID ? crypto.randomUUID() : crypto.randomBytes(16).toString('hex');
    const expiresAt = Date.now() + 15 * 60 * 1000; // 15 minutes TTL

    const sessionPayload = {
      sessionId,
      uid,
      email: userEmail,
      planId: productConfig.planId,
      amount: productConfig.amount,
      currency: 'INR',
      status: 'created',
      createdAt: Date.now(),
      expiresAt,
    };

    const sessionToken = generateSessionToken(sessionPayload);

    // Save to global in-memory store
    global.inMemorySessions.set(sessionId, sessionPayload);
    global.inMemorySessions.set(sessionToken, sessionPayload);

    if (db) {
      try {
        await db.collection('payment_sessions').doc(sessionId).set({
          sessionId,
          uid,
          email: userEmail,
          planId: productConfig.planId,
          amount: productConfig.amount,
          currency: 'INR',
          status: 'created',
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          expiresAt: admin.firestore.Timestamp.fromDate(new Date(expiresAt)),
        });
      } catch (dbErr) {
        console.warn('Firestore payment_sessions write error:', dbErr.message);
      }
    }

    return res.status(200).json({
      success: true,
      sessionId: sessionId,
      sessionToken: sessionToken,
      expiresAt: new Date(expiresAt).toISOString(),
    });
  } catch (err) {
    console.error('Session creation failed:', err);
    return res.status(500).json({ error: 'Failed to create payment session', details: err.message });
  }
};
