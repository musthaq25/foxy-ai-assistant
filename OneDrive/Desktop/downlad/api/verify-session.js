const admin = require('firebase-admin');
const crypto = require('crypto');

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

function verifySessionToken(token) {
  if (!token) throw new Error('Session token is required');
  const parts = token.split('.');
  if (parts.length !== 2) throw new Error('Invalid token format');
  const [payloadStr, signature] = parts;
  const secret = process.env.RAZORPAY_KEY_SECRET || 'test_secret';
  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(payloadStr)
    .digest('base64url');
  if (signature !== expectedSignature) throw new Error('Signature mismatch');
  const payload = JSON.parse(Buffer.from(payloadStr, 'base64url').toString('utf8'));
  if (Date.now() > payload.expiresAt) throw new Error('Token expired');
  return payload;
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST' && req.method !== 'GET') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const sessionIdParam = req.query?.session || req.body?.sessionId;
    const sessionTokenParam = req.body?.sessionToken;
    const sessionId = sessionIdParam || sessionTokenParam;

    if (!sessionId) {
      return res.status(400).json({ error: 'Session ID is required' });
    }

    let sessionData = null;

    // 1. Check in-memory store
    if (global.inMemorySessions.has(sessionId)) {
      sessionData = global.inMemorySessions.get(sessionId);
    }

    // 2. Check signed JWT session token format
    if (!sessionData && sessionId.includes('.')) {
      try {
        sessionData = verifySessionToken(sessionId);
      } catch (err) {
        console.warn('JWT session verify error:', err.message);
      }
    }

    // 3. Check Firestore
    if (!sessionData && db) {
      try {
        const docSnap = await db.collection('payment_sessions').doc(sessionId).get();
        if (docSnap.exists) {
          sessionData = docSnap.data();
          const expiresAtMs = sessionData.expiresAt?.toMillis ? sessionData.expiresAt.toMillis() : new Date(sessionData.expiresAt).getTime();
          sessionData.expiresAt = expiresAtMs;
        }
      } catch (e) {
        console.warn('Firestore session fetch error:', e.message);
      }
    }

    if (!sessionData) {
      return res.status(404).json({ error: 'Invalid or non-existent payment session' });
    }

    if (Date.now() > sessionData.expiresAt) {
      return res.status(400).json({ error: 'Payment session has expired' });
    }

    const productConfig = PRODUCT_MAP[sessionData.planId] || PRODUCT_MAP['plan_pro_monthly'];

    return res.status(200).json({
      success: true,
      session: {
        sessionId: sessionData.sessionId || sessionId,
        uid: sessionData.uid,
        email: sessionData.email || 'user@daystack.app',
        planId: productConfig.planId,
        planName: productConfig.name,
        amount: productConfig.amount,
        currency: 'INR',
        status: sessionData.status || 'created',
        expiresAt: sessionData.expiresAt,
      }
    });
  } catch (err) {
    console.error('Session verification failed:', err);
    return res.status(400).json({ error: 'Session expired or invalid', details: err.message });
  }
};
