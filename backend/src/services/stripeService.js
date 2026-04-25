const Stripe = require('stripe');
const STRIPE_KEY = process.env.STRIPE_SECRET_KEY || 'sk_test_placeholder';
const stripe = new Stripe(STRIPE_KEY);
if (!process.env.STRIPE_SECRET_KEY) {
  console.warn('⚠️ STRIPE_SECRET_KEY is not set in .env. Payment features will fail.');
}
const prisma = require('../config/database');

class StripeService {
  static async createCheckoutSession(userId, planType) {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new Error('User not found');

    const priceId = planType === 'pro' 
      ? process.env.STRIPE_PRO_PRICE_ID 
      : process.env.STRIPE_BASIC_PRICE_ID;

    const session = await stripe.checkout.sessions.create({
      customer_email: user.email,
      payment_method_types: ['card'],
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      mode: 'subscription',
      success_url: `${process.env.FRONTEND_URL}/dashboard?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.FRONTEND_URL}/billing`,
      metadata: {
        userId: user.id,
        plan: planType,
      },
    });

    return session;
  }

  static async handleWebhook(event) {
    const session = event.data.object;

    switch (event.type) {
      case 'checkout.session.completed':
        await this.updateUserSubscription(session.metadata.userId, session.metadata.plan, session.customer);
        break;
      case 'customer.subscription.deleted':
        await this.cancelUserSubscription(session.customer);
        break;
    }
  }

  static async updateUserSubscription(userId, plan, stripeCustomerId) {
    return prisma.user.update({
      where: { id: userId },
      data: {
        plan: plan,
        stripeCustomerId: stripeCustomerId,
      },
    });
  }

  static async cancelUserSubscription(stripeCustomerId) {
    return prisma.user.updateMany({
      where: { stripeCustomerId: stripeCustomerId },
      data: {
        plan: 'free',
      },
    });
  }
}

module.exports = StripeService;
