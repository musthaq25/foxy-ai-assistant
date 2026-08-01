const Razorpay = require('razorpay');
const crypto = require('crypto');
const admin = require('firebase-admin');

global.inMemorySessions = global.inMemorySessions || new Map();

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

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID || 'rzp_test_TEaZoQs4IIFazC',
  key_secret: process.env.RAZORPAY_KEY_SECRET || 'test_secret'
});

const PRODUCT_MAP = {
  'plan_basic_monthly': { planId: 'plan_basic_monthly', amount: 9900, durationDays: 30, tier: 'basic', name: 'Basic Monthly' },
  'plan_basic_annual': { planId: 'plan_basic_annual', amount: 69900, durationDays: 365, tier: 'basic', name: 'Basic Annual' },
  'plan_basic_lifetime': { planId: 'plan_basic_lifetime', amount: 199900, durationDays: 36500, tier: 'basic', name: 'Basic Lifetime' },
  'plan_pro_monthly': { planId: 'plan_pro_monthly', amount: 14900, durationDays: 30, tier: 'pro', name: 'Pro Monthly' },
  'plan_pro_annual': { planId: 'plan_pro_annual', amount: 149900, durationDays: 365, tier: 'pro', name: 'Pro Annual' },
  'plan_pro_lifetime': { planId: 'plan_pro_lifetime', amount: 399900, durationDays: 36500, tier: 'pro', name: 'Pro Lifetime' },
  'pass_exam_season': { planId: 'pass_exam_season', amount: 49900, durationDays: 60, tier: 'pro', name: 'Exam Season Pass' },
  'pro_monthly': { planId: 'plan_pro_monthly', amount: 14900, durationDays: 30, tier: 'pro', name: 'Pro Monthly' },
  'pro_annual': { planId: 'plan_pro_annual', amount: 149900, durationDays: 365, tier: 'pro', name: 'Pro Annual' },
  'basic_monthly': { planId: 'plan_basic_monthly', amount: 9900, durationDays: 30, tier: 'basic', name: 'Basic Monthly' },
};

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
    const sessionId = req.body?.sessionId || req.body?.sessionToken;
    const clientPlanId = req.body?.planId || 'plan_pro_monthly';

    let sessionData = global.inMemorySessions.get(sessionId);

    if (!sessionData && db && sessionId) {
      try {
        const docSnap = await db.collection('payment_sessions').doc(sessionId).get();
        if (docSnap.exists) sessionData = docSnap.data();
      } catch (e) {}
    }

    const targetPlanKey = sessionData?.planId || clientPlanId;
    const productConfig = PRODUCT_MAP[targetPlanKey] || PRODUCT_MAP['plan_pro_monthly'];
    const isSubscriptionPlan = targetPlanKey.includes('monthly') || targetPlanKey.includes('annual');

    // If it's a one-time plan (e.g. lifetime or exam pass), create standard order instead
    if (!isSubscriptionPlan) {
      const orderRes = await fetch(`${req.headers.origin || 'https://daystack-mu.vercel.app'}/api/create-order`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, planId: targetPlanKey })
      });
      const orderData = await orderRes.json();
      return res.status(200).json(orderData);
    }

    let subscriptionId;
    try {
      // Create Razorpay Plan & Subscription
      const rzpPlan = await razorpay.plans.create({
        period: targetPlanKey.includes('annual') ? 'yearly' : 'monthly',
        interval: 1,
        item: {
          name: `DayStack ${productConfig.name}`,
          amount: productConfig.amount,
          currency: 'INR',
          description: `DayStack ${productConfig.name} Access`
        }
      });

      const subscription = await razorpay.subscriptions.create({
        plan_id: rzpPlan.id,
        total_count: targetPlanKey.includes('annual') ? 5 : 12,
        quantity: 1,
        customer_notify: 1,
        notes: {
          sessionId: sessionId || '',
          uid: sessionData?.uid || '',
          planId: productConfig.planId,
        }
      });
      subscriptionId = subscription.id;
    } catch (rzpErr) {
      console.warn('Razorpay subscription fallback to mock mode:', rzpErr.message);
      subscriptionId = 'sub_mock_' + Math.random().toString(36).substring(2, 14);
    }

    // Update Session State to order_created
    if (sessionId) {
      if (global.inMemorySessions.has(sessionId)) {
        const s = global.inMemorySessions.get(sessionId);
        s.status = 'order_created';
        s.subscriptionId = subscriptionId;
      }
      if (db) {
        try {
          await db.collection('payment_sessions').doc(sessionId).update({
            status: 'order_created',
            subscriptionId: subscriptionId,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          });
        } catch (e) {}
      }
    }

    return res.status(200).json({
      success: true,
      key_id: process.env.RAZORPAY_KEY_ID || 'rzp_test_TEaZoQs4IIFazC',
      subscriptionId: subscriptionId,
      subscription_id: subscriptionId,
      orderId: subscriptionId,
      amount: productConfig.amount,
      currency: 'INR',
      planId: productConfig.planId,
      email: sessionData?.email || 'user@daystack.app',
    });
  } catch (err) {
    console.error('Create subscription failed:', err);
    return res.status(500).json({ error: 'Failed to create subscription', details: err.message });
  }
};
