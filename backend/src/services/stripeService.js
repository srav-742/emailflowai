const stripeKey = process.env.STRIPE_SECRET_KEY;
const stripe = stripeKey ? require('stripe')(stripeKey) : null;

if (!stripe) {
  console.warn('⚠️ [Stripe] STRIPE_SECRET_KEY is missing. Stripe features will run in Mock Mode.');
}

const prisma = require('../config/database');

const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';

/**
 * Maps plan names/slugs to active Stripe Price IDs from env
 */
const getPriceId = (plan) => {
  if (!plan) return null;
  if (plan.startsWith('price_')) return plan; // Raw Price ID passed directly

  const p = plan.toLowerCase().trim();
  switch (p) {
    case 'basic':
    case 'basic-monthly':
      return process.env.STRIPE_BASIC_PRICE_ID || 'price_basic_mock';
    case 'pro':
    case 'pro-monthly':
      return process.env.STRIPE_PRO_MONTHLY_PRICE_ID || process.env.STRIPE_PRO_PRICE_ID || 'price_pro_monthly_mock';
    case 'pro-annual':
      return process.env.STRIPE_PRO_ANNUAL_PRICE_ID || 'price_pro_annual_mock';
    case 'team':
    case 'team-monthly':
      return process.env.STRIPE_PRO_MONTHLY_PRICE_ID || 'price_team_monthly_mock'; // Fallback to pro monthly or custom team price
    case 'enterprise':
    case 'enterprise-monthly':
      return process.env.STRIPE_ENTERPRISE_PRICE_ID || 'price_enterprise_mock';
    default:
      return process.env.STRIPE_PRO_MONTHLY_PRICE_ID || 'price_pro_monthly_mock';
  }
};

/**
 * Creates Stripe Checkout session for a specific plan tier
 */
const createCheckoutSession = async (userId, planOrPriceId) => {
  const priceId = getPriceId(planOrPriceId);

  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { subscription: true }
  });

  if (!user) {
    throw new Error('User not found');
  }

  // Look for customer ID from BillingCustomer table or Subscription table
  const billingCust = await prisma.billingCustomer.findUnique({
    where: { userId }
  });
  let customerId = billingCust?.stripeCustomerId || user.subscription?.stripeCustomerId;

  // Failure resilience: if stripe is not configured, redirect straight to mock success callback
  if (!stripe) {
    console.warn(`[Stripe Mock] Simulating checkout session for plan/price: ${planOrPriceId}`);
    return {
      url: `${FRONTEND_URL}/dashboard?session_id=mock_session_${Date.now()}`
    };
  }

  try {
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email,
        metadata: { userId }
      });
      customerId = customer.id;

      // Save Stripe Customer mapping in database
      await prisma.billingCustomer.upsert({
        where: { userId },
        update: { stripeCustomerId: customerId },
        create: { userId, stripeCustomerId: customerId }
      });
    }

    // Determine quantity/seats (Default is 1, but Team plan could customize)
    const isTeam = planOrPriceId.includes('team');
    const quantity = isTeam ? 5 : 1; // Team plan comes with baseline of 5 seats

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      payment_method_types: ['card'],
      line_items: [{ price: priceId, quantity }],
      mode: 'subscription',
      success_url: `${FRONTEND_URL}/dashboard?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${FRONTEND_URL}/pricing`,
      metadata: { userId },
      subscription_data: {
        trial_period_days: 14 // 14-day free trial
      }
    });

    return session;
  } catch (error) {
    console.error('[Stripe Service] Error creating checkout session:', error);
    // Fallback to mock session in development if Stripe throws credentials error
    if (process.env.NODE_ENV === 'development') {
      console.warn('[Stripe Service] Fallback to Mock Session in development');
      return {
        url: `${FRONTEND_URL}/dashboard?session_id=mock_session_${Date.now()}`
      };
    }
    throw error;
  }
};

/**
 * Creates Stripe Customer Billing Portal Session
 */
const createPortalSession = async (userId) => {
  const billingCust = await prisma.billingCustomer.findUnique({
    where: { userId }
  });

  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { subscription: true }
  });

  const customerId = billingCust?.stripeCustomerId || user?.subscription?.stripeCustomerId;

  if (!stripe) {
    console.warn(`[Stripe Mock] Simulating Billing Portal redirect for user: ${userId}`);
    return {
      url: `${FRONTEND_URL}/pricing`
    };
  }

  if (!customerId) {
    throw new Error('No Stripe customer active for this account. Please subscribe first.');
  }

  const session = await stripe.billingPortal.sessions.create({
    customer: customerId,
    return_url: `${FRONTEND_URL}/settings/accounts` // return to settings page
  });

  return session;
};

/**
 * Handles incoming webhooks from Stripe (verify signature & handle events)
 */
const handleWebhook = async (event) => {
  if (!stripe) return;

  const { id: stripeEventId, type, data } = event;

  // 1. Idempotency Safeguard
  const alreadyProcessed = await prisma.processedWebhook.findUnique({
    where: { stripeEventId }
  });

  if (alreadyProcessed) {
    console.log(`[Stripe Webhook] Event ${stripeEventId} already processed. Skipping.`);
    return;
  }

  // 2. Register event as processed
  await prisma.processedWebhook.create({
    data: { stripeEventId }
  });

  console.log(`[Stripe Webhook] Processing event ${stripeEventId} of type ${type}`);

  switch (type) {
    case 'checkout.session.completed': {
      const session = data.object;
      const userId = session.metadata?.userId;
      const stripeCustomerId = session.customer;
      const subscriptionId = session.subscription;

      if (subscriptionId) {
        const subscription = await stripe.subscriptions.retrieve(subscriptionId);
        await syncSubscription(userId, stripeCustomerId, subscription);
      }
      break;
    }
    case 'customer.subscription.created':
    case 'customer.subscription.updated': {
      const subscription = data.object;
      const stripeCustomerId = subscription.customer;
      await syncSubscription(null, stripeCustomerId, subscription);
      break;
    }
    case 'customer.subscription.deleted': {
      const subscription = data.object;
      const stripeCustomerId = subscription.customer;
      await syncSubscription(null, stripeCustomerId, subscription, 'free');
      break;
    }
    case 'invoice.paid': {
      const invoice = data.object;
      const stripeCustomerId = invoice.customer;
      const stripeInvoiceId = invoice.id;
      const amount = invoice.amount_paid;
      const currency = invoice.currency;
      const status = invoice.status;
      const invoicePdf = invoice.invoice_pdf || invoice.hosted_invoice_url;

      // Locate user mapping
      const billingCust = await prisma.billingCustomer.findFirst({
        where: { stripeCustomerId }
      });
      const userId = billingCust?.userId || 
        (invoice.subscription ? (await prisma.subscription.findFirst({ where: { stripeSubscriptionId: invoice.subscription } }))?.userId : null);

      if (userId) {
        await prisma.invoice.create({
          data: {
            userId,
            stripeInvoiceId,
            amount,
            currency,
            status,
            invoicePdf
          }
        });
      }
      break;
    }
    case 'invoice.payment_failed': {
      const invoice = data.object;
      const stripeCustomerId = invoice.customer;
      const subscriptionId = invoice.subscription;
      
      if (subscriptionId) {
        const subscription = await stripe.subscriptions.retrieve(subscriptionId);
        await syncSubscription(null, stripeCustomerId, subscription);
      }
      break;
    }
    default:
      console.log(`[Stripe Webhook] Unhandled event type ${type}`);
  }
};

/**
 * Synchronizes the subscription status in the Postgres database
 */
const syncSubscription = async (userId, stripeCustomerId, subscription, forcePlan = null) => {
  let user = null;

  if (userId) {
    user = await prisma.user.findUnique({
      where: { id: userId }
    });
  }

  if (!user && stripeCustomerId) {
    const billingCust = await prisma.billingCustomer.findUnique({
      where: { stripeCustomerId }
    });
    if (billingCust) {
      user = await prisma.user.findUnique({
        where: { id: billingCust.userId }
      });
    }
  }

  if (!user && stripeCustomerId) {
    const sub = await prisma.subscription.findFirst({
      where: { stripeCustomerId },
      include: { user: true }
    });
    if (sub) {
      user = sub.user;
    }
  }

  if (!user) {
    console.error(`[Stripe Service] User details not found for customer ${stripeCustomerId}`);
    return;
  }

  const finalUserId = user.id;

  // Map Customer relationship
  if (stripeCustomerId) {
    await prisma.billingCustomer.upsert({
      where: { userId: finalUserId },
      update: { stripeCustomerId },
      create: { userId: finalUserId, stripeCustomerId }
    });
  }

  const priceId = subscription.items?.data[0]?.price?.id || subscription.plan?.id || '';
  
  let plan = 'free';
  if (forcePlan) {
    plan = forcePlan;
  } else {
    const lowerPrice = priceId.toLowerCase();
    const proMonthly = (process.env.STRIPE_PRO_MONTHLY_PRICE_ID || 'price_pro_monthly').toLowerCase();
    const proAnnual = (process.env.STRIPE_PRO_ANNUAL_PRICE_ID || 'price_pro_annual').toLowerCase();
    const proPrice = (process.env.STRIPE_PRO_PRICE_ID || 'price_pro').toLowerCase();
    const enterprisePrice = (process.env.STRIPE_ENTERPRISE_PRICE_ID || 'price_enterprise').toLowerCase();
    const basicPrice = (process.env.STRIPE_BASIC_PRICE_ID || 'price_basic').toLowerCase();

    if (priceId === proMonthly || priceId === proPrice) {
      plan = 'pro';
    } else if (priceId === proAnnual) {
      plan = 'pro';
    } else if (priceId === enterprisePrice) {
      plan = 'enterprise';
    } else if (priceId === basicPrice) {
      plan = 'basic';
    } else if (lowerPrice.includes('pro')) {
      plan = 'pro';
    } else if (lowerPrice.includes('team')) {
      plan = 'team';
    } else if (lowerPrice.includes('enterprise')) {
      plan = 'enterprise';
    } else if (lowerPrice.includes('basic')) {
      plan = 'basic';
    }
  }

  const status = subscription.status; // active, trialing, past_due, canceled, unpaid

  // Upsert subscription status
  await prisma.subscription.upsert({
    where: { userId: finalUserId },
    update: {
      stripeSubscriptionId: subscription.id,
      stripeCustomerId,
      stripePriceId: priceId,
      plan,
      status,
      currentPeriodStart: subscription.current_period_start ? new Date(subscription.current_period_start * 1000) : null,
      currentPeriodEnd: subscription.current_period_end ? new Date(subscription.current_period_end * 1000) : null,
      cancelAtPeriodEnd: subscription.cancel_at_period_end || false,
      trialEnd: subscription.trial_end ? new Date(subscription.trial_end * 1000) : null
    },
    create: {
      userId: finalUserId,
      stripeSubscriptionId: subscription.id,
      stripeCustomerId,
      stripePriceId: priceId,
      plan,
      status,
      currentPeriodStart: subscription.current_period_start ? new Date(subscription.current_period_start * 1000) : null,
      currentPeriodEnd: subscription.current_period_end ? new Date(subscription.current_period_end * 1000) : null,
      cancelAtPeriodEnd: subscription.cancel_at_period_end || false,
      trialEnd: subscription.trial_end ? new Date(subscription.trial_end * 1000) : null
    }
  });

  // Keep the flat `plan` field on User synchronized
  await prisma.user.update({
    where: { id: finalUserId },
    data: { plan }
  });
};

module.exports = {
  createCheckoutSession,
  createPortalSession,
  handleWebhook,
  stripe // export raw stripe SDK client
};
