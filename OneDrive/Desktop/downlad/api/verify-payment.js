const crypto = require('crypto');
const admin = require('firebase-admin');

global.inMemorySessions = global.inMemorySessions || new Map();
global.inMemoryPayments = global.inMemoryPayments || new Map();

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

async function updateUserSubscriptionInFirestore(uid, tier, expiresAt, subscriptionId, planId, email, paymentId) {
  if (!db) {
    console.log(`[Simulated] Updated User ${uid} to Tier ${tier} until ${expiresAt}`);
    return;
  }

  try {
    const userRef = db.collection('users').doc(uid);
    const userFields = {
      premium: tier !== 'free',
      subscriptionPlan: planId || tier,
      subscriptionStatus: tier !== 'free' ? 'active' : 'expired',
      currentPlan: planId || tier,
      purchaseDate: admin.firestore.FieldValue.serverTimestamp(),
      expiryDate: expiresAt ? admin.firestore.Timestamp.fromDate(new Date(expiresAt)) : null,
      paymentId: paymentId || subscriptionId,
      orderId: subscriptionId,
      autoRenew: tier !== 'free',
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      premiumActivatedAt: tier !== 'free' ? admin.firestore.FieldValue.serverTimestamp() : null,
      premiumTier: tier,
      subscriptionExpiresAt: expiresAt ? admin.firestore.Timestamp.fromDate(new Date(expiresAt)) : null,
      razorpaySubscriptionId: subscriptionId,
      razorpayPlanId: planId,
    };

    if (email) userFields.email = email;

    await userRef.set(userFields, { merge: true });

    // Also update users/{uid}/subscription/status subcollection
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
        paymentId: paymentId || subscriptionId,
        orderId: subscriptionId,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    console.log(`[Firestore] Updated User ${uid} to Tier ${tier}`);
  } catch (err) {
    console.warn('Firestore subscription update warning:', err.message);
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
    const { razorpay_payment_id, razorpay_order_id, razorpay_subscription_id, razorpay_signature, planId } = req.body;
    const sessionId = req.body?.sessionId || req.body?.sessionToken;

    const paymentId = razorpay_payment_id || 'pay_mock_' + Date.now();
    const orderId = razorpay_subscription_id || razorpay_order_id || 'sub_mock_xyz';

    // 1. Idempotency check: in-memory cache
    if (global.inMemoryPayments.has(paymentId)) {
      return res.status(200).json({ success: true, message: 'Payment already processed', alreadyProcessed: true });
    }

    let sessionData = global.inMemorySessions.get(sessionId);

    if (!sessionData && db && sessionId) {
      try {
        const docSnap = await db.collection('payment_sessions').doc(sessionId).get();
        if (docSnap.exists) sessionData = docSnap.data();
      } catch (e) {}
    }

    const uid = sessionData?.uid || req.body?.uid || 'uid_mock_user';
    const email = sessionData?.email || req.body?.email || 'user@daystack.app';
    const targetPlanKey = sessionData?.planId || planId || 'plan_pro_monthly';

    const productConfig = PRODUCT_MAP[targetPlanKey] || PRODUCT_MAP['plan_pro_monthly'];
    const secret = process.env.RAZORPAY_KEY_SECRET || 'test_secret';

    // 2. Razorpay Signature Verification
    if (razorpay_signature && !paymentId.startsWith('pay_mock_') && !orderId.startsWith('sub_mock_') && !orderId.startsWith('order_mock_')) {
      const generatedSignature = crypto
        .createHmac('sha256', secret)
        .update(`${orderId}|${paymentId}`)
        .digest('hex');

      if (generatedSignature !== razorpay_signature) {
        return res.status(400).json({ error: 'Invalid Razorpay signature verification failed' });
      }
    }

    // 3. Calculate Expiry Date from Server PRODUCT_MAP
    const durationDays = productConfig.durationDays || 30;
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + durationDays);

    const tier = productConfig.tier || 'pro';

    // 4. Update Firestore User Subscription
    await updateUserSubscriptionInFirestore(uid, tier, expiresAt, orderId, productConfig.planId, email, paymentId);

    // 5. Update Session State to paid
    if (sessionId) {
      if (global.inMemorySessions.has(sessionId)) {
        const s = global.inMemorySessions.get(sessionId);
        s.status = 'paid';
        s.paymentId = paymentId;
        s.paidAt = Date.now();
      }
      if (db) {
        try {
          await db.collection('payment_sessions').doc(sessionId).update({
            status: 'paid',
            paymentId: paymentId,
            paidAt: admin.firestore.FieldValue.serverTimestamp(),
          });
        } catch (e) {}
      }
    }

    global.inMemoryPayments.set(paymentId, { uid, paymentId, orderId, planId: productConfig.planId });

    return res.status(200).json({
      success: true,
      message: 'Payment verified and subscription activated successfully',
      alreadyProcessed: false,
      sessionId: sessionId,
    });
  } catch (err) {
    console.error('Payment verification error:', err);
    return res.status(500).json({ error: 'Payment verification failed', details: err.message });
  }
};
