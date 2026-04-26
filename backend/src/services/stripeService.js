const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const prisma = require('../config/database');

const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';

const createCheckoutSession = async (userId, priceId) => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { subscription: true }
  });

  let customerId = user.subscription?.stripeCustomerId;

  if (!customerId) {
    const customer = await stripe.customers.create({
      email: user.email,
      metadata: { userId }
    });
    customerId = customer.id;
  }

  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    payment_method_types: ['card'],
    line_items: [{ price: priceId, quantity: 1 }],
    mode: 'subscription',
    success_url: `${FRONTEND_URL}/dashboard?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${FRONTEND_URL}/pricing`,
    metadata: { userId }
  });

  return session;
};

const createPortalSession = async (userId) => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { subscription: true }
  });

  if (!user.subscription?.stripeCustomerId) {
    throw new Error('No Stripe customer found for this user.');
  }

  const session = await stripe.billingPortal.sessions.create({
    customer: user.subscription.stripeCustomerId,
    return_url: `${FRONTEND_URL}/settings/billing`
  });

  return session;
};

const handleWebhook = async (event) => {
  const { type, data } = event;

  switch (type) {
    case 'checkout.session.completed': {
      const session = data.object;
      await updateSubscription(session.customer, session.subscription);
      break;
    }
    case 'customer.subscription.updated':
    case 'customer.subscription.deleted': {
      const subscription = data.object;
      await updateSubscription(subscription.customer, subscription.id);
      break;
    }
    default:
      console.log(`Unhandled event type ${type}`);
  }
};

const updateSubscription = async (customerId, subscriptionId) => {
  const subscription = await stripe.subscriptions.retrieve(subscriptionId);
  const user = await prisma.user.findFirst({
    where: { 
      OR: [
        { subscription: { stripeCustomerId: customerId } },
        { stripeCustomerId: customerId } // fallback
      ]
    },
    include: { subscription: true }
  });

  if (!user) {
    // Try to find by metadata in customer if not found in DB
    const customer = await stripe.customers.retrieve(customerId);
    const userId = customer.metadata?.userId;
    if (userId) {
      // Logic to sync
    } else {
      console.error(`User not found for customer ${customerId}`);
      return;
    }
  }

  const userId = user.id;
  const priceId = subscription.items.data[0].price.id;
  
  let plan = 'free';
  if (priceId === process.env.STRIPE_PRO_MONTHLY_PRICE_ID || priceId === process.env.STRIPE_PRO_ANNUAL_PRICE_ID) {
    plan = 'pro';
  }

  await prisma.subscription.upsert({
    where: { userId },
    update: {
      stripeSubscriptionId: subscription.id,
      stripeCustomerId: customerId,
      stripePriceId: priceId,
      plan,
      status: subscription.status,
      currentPeriodStart: new Date(subscription.current_period_start * 1000),
      currentPeriodEnd: new Date(subscription.current_period_end * 1000),
      cancelAtPeriodEnd: subscription.cancel_at_period_end,
    },
    create: {
      userId,
      stripeSubscriptionId: subscription.id,
      stripeCustomerId: customerId,
      stripePriceId: priceId,
      plan,
      status: subscription.status,
      currentPeriodStart: new Date(subscription.current_period_start * 1000),
      currentPeriodEnd: new Date(subscription.current_period_end * 1000),
      cancelAtPeriodEnd: subscription.cancel_at_period_end,
    }
  });

  // Sync back to User table for legacy/easy access
  await prisma.user.update({
    where: { id: userId },
    data: { plan }
  });
};

module.exports = {
  createCheckoutSession,
  createPortalSession,
  handleWebhook,
  stripe // Export stripe client just in case
};
