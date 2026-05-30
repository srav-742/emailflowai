const stripeKey = process.env.STRIPE_SECRET_KEY;
const stripe = stripeKey ? require('stripe')(stripeKey) : null;

const prisma = require('../config/database');

const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';

/**
 * Maps plan names to their respective Stripe Price IDs
 */
const getPriceId = (plan) => {
  if (!plan) throw new Error('Plan is required');
  if (plan.startsWith('price_')) return plan; // Raw Price ID

  const p = plan.toLowerCase().trim();
  switch (p) {
    case 'free':
      // Free plan typically doesn't have a checkout, but if it does, handle it
      throw new Error('Free plan does not require checkout');
    case 'pro':
    case 'pro-monthly':
      if (!process.env.STRIPE_PRO_MONTHLY_PRICE_ID && !process.env.STRIPE_PRO_PRICE_ID) {
        throw new Error('STRIPE_PRO_MONTHLY_PRICE_ID is not configured');
      }
      return process.env.STRIPE_PRO_MONTHLY_PRICE_ID || process.env.STRIPE_PRO_PRICE_ID;
    case 'pro-annual':
      if (!process.env.STRIPE_PRO_ANNUAL_PRICE_ID) {
        throw new Error('STRIPE_PRO_ANNUAL_PRICE_ID is not configured');
      }
      return process.env.STRIPE_PRO_ANNUAL_PRICE_ID;
    case 'enterprise':
    case 'enterprise-monthly':
      if (!process.env.STRIPE_ENTERPRISE_PRICE_ID) {
        throw new Error('STRIPE_ENTERPRISE_PRICE_ID is not configured');
      }
      return process.env.STRIPE_ENTERPRISE_PRICE_ID;
    default:
      throw new Error(`Unknown plan identifier: ${plan}`);
  }
};

/**
 * Creates Stripe Checkout session
 */
const createCheckoutSession = async (userId, planOrPriceId) => {
  if (!stripe) {
    throw new Error('Stripe is not initialized. Check your STRIPE_SECRET_KEY.');
  }

  const priceId = getPriceId(planOrPriceId);

  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { subscription: true }
  });

  if (!user) {
    throw new Error('User not found');
  }

  // Identify or create Stripe Customer
  const billingCust = await prisma.billingCustomer.findUnique({
    where: { userId }
  });
  
  let customerId = billingCust?.stripeCustomerId || user.subscription?.stripeCustomerId;

  if (!customerId) {
    const customer = await stripe.customers.create({
      email: user.email,
      metadata: { userId }
    });
    customerId = customer.id;

    await prisma.billingCustomer.upsert({
      where: { userId },
      update: { stripeCustomerId: customerId },
      create: { userId, stripeCustomerId: customerId }
    });
  }

  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    payment_method_types: ['card'],
    line_items: [{ price: priceId, quantity: 1 }],
    mode: 'subscription',
    success_url: `${FRONTEND_URL}/billing?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${FRONTEND_URL}/pricing-v2`,
    metadata: { userId },
    subscription_data: {
      trial_period_days: 14 // 14-day trial period
    }
  });

  return session;
};

/**
 * Creates Stripe Customer Billing Portal Session
 */
const createPortalSession = async (userId) => {
  if (!stripe) {
    throw new Error('Stripe is not initialized.');
  }

  const billingCust = await prisma.billingCustomer.findUnique({
    where: { userId }
  });

  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { subscription: true }
  });

  const customerId = billingCust?.stripeCustomerId || user?.subscription?.stripeCustomerId;

  if (!customerId) {
    throw new Error('No Stripe customer active for this account. Please subscribe first.');
  }

  const session = await stripe.billingPortal.sessions.create({
    customer: customerId,
    return_url: `${FRONTEND_URL}/billing` // Return to the new billing page
  });

  return session;
};

/**
 * Sync subscription to Database
 */
const syncSubscription = async (userId, stripeCustomerId, subscription, forcePlan = null) => {
  let user = null;

  if (userId) {
    user = await prisma.user.findUnique({ where: { id: userId } });
  }

  if (!user && stripeCustomerId) {
    const billingCust = await prisma.billingCustomer.findUnique({ where: { stripeCustomerId } });
    if (billingCust) user = await prisma.user.findUnique({ where: { id: billingCust.userId } });
  }

  if (!user && stripeCustomerId) {
    const sub = await prisma.subscription.findFirst({
      where: { stripeCustomerId },
      include: { user: true }
    });
    if (sub) user = sub.user;
  }

  if (!user) {
    console.error(`[Stripe V2] User details not found for customer ${stripeCustomerId}`);
    return;
  }

  const finalUserId = user.id;
  const priceId = subscription.items?.data[0]?.price?.id || subscription.plan?.id || '';
  
  let plan = 'free';
  if (forcePlan) {
    plan = forcePlan;
  } else {
    // Resolve plan securely based on exact matches of env vars, no loose mocks
    const proMonthly = process.env.STRIPE_PRO_MONTHLY_PRICE_ID || process.env.STRIPE_PRO_PRICE_ID;
    const proAnnual = process.env.STRIPE_PRO_ANNUAL_PRICE_ID;
    const enterprisePrice = process.env.STRIPE_ENTERPRISE_PRICE_ID;
    
    if (priceId === proMonthly || priceId === proAnnual) {
      plan = 'pro';
    } else if (priceId === enterprisePrice) {
      plan = 'enterprise';
    } else if (priceId) {
      plan = 'pro'; // Fallback for unknown active subscriptions if any exist
    }
  }

  const status = subscription.status; // active, trialing, past_due, canceled, unpaid

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

  await prisma.user.update({
    where: { id: finalUserId },
    data: { plan }
  });
};

/**
 * Handles Webhook logic (idempotent, strictly processing required events)
 */
const handleWebhook = async (event) => {
  if (!stripe) throw new Error('Stripe is not initialized.');

  const { id: stripeEventId, type, data } = event;

  // Idempotency: Prevent duplicate webhook processing
  const alreadyProcessed = await prisma.processedWebhook.findUnique({
    where: { stripeEventId }
  });

  if (alreadyProcessed) {
    console.log(`[Stripe V2] Webhook ${stripeEventId} already processed.`);
    return;
  }

  await prisma.processedWebhook.create({
    data: { stripeEventId }
  });

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
    
    case 'customer.subscription.updated': {
      const subscription = data.object;
      const stripeCustomerId = subscription.customer;
      await syncSubscription(null, stripeCustomerId, subscription);
      break;
    }

    case 'customer.subscription.deleted': {
      const subscription = data.object;
      const stripeCustomerId = subscription.customer;
      // On deletion, revert to free
      await syncSubscription(null, stripeCustomerId, subscription, 'free');
      break;
    }

    case 'invoice.paid': {
      const invoice = data.object;
      const stripeCustomerId = invoice.customer;
      
      const billingCust = await prisma.billingCustomer.findFirst({
        where: { stripeCustomerId }
      });
      const userId = billingCust?.userId || 
        (invoice.subscription ? (await prisma.subscription.findFirst({ where: { stripeSubscriptionId: invoice.subscription } }))?.userId : null);

      if (userId) {
        await prisma.invoice.create({
          data: {
            userId,
            stripeInvoiceId: invoice.id,
            amount: invoice.amount_paid,
            currency: invoice.currency,
            status: invoice.status,
            invoicePdf: invoice.invoice_pdf || invoice.hosted_invoice_url
          }
        });
      }
      break;
    }

    case 'invoice.payment_failed': {
      const invoice = data.object;
      const stripeCustomerId = invoice.customer;
      const subscriptionId = invoice.subscription;
      
      // Payment failure might lead to past_due or canceled, sync it directly
      if (subscriptionId) {
        const subscription = await stripe.subscriptions.retrieve(subscriptionId);
        await syncSubscription(null, stripeCustomerId, subscription);
      }
      break;
    }
    
    default:
      console.log(`[Stripe V2] Unhandled event type ${type}`);
  }
};

module.exports = {
  createCheckoutSession,
  createPortalSession,
  handleWebhook,
  stripe
};
