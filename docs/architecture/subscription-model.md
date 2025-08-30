Subscription Model
1. Subscription Architecture Overview
1.1 Subscription Flow
graph TD
    A[User Sign Up] --> B[Choose Plan]
    B --> C[Free Trial Activation]
    C --> D[Billing Cycle Start]
    D --> E[Usage Monitoring]
    E --> F[Invoice Generation]
    F --> G[Payment Processing]
    G --> H[Subscription Renewal]
    H --> I[Upgrade/Downgrade Handling]
    I --> D

    J[Subscription Expiry] --> K[Grace Period]
    K --> L[Deactivation]

1.2 Plan Structure

Free/Trial: Limited features, usage caps.
Basic: Essential features for small schools.
Premium: Advanced features for larger institutions.
Enterprise: Custom features, unlimited usage.

2. Subscription Configuration
2.1 Plan Model
// src/domain/models/platform/plan.model.js
import mongoose from 'mongoose';

const planSchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true },
  description: String,
  price: {
    monthly: Number,
    yearly: Number,
  },
  features: [String],
  limits: {
    maxSchools: Number,
    maxStudents: Number,
    maxStorage: Number,
  },
  status: { type: String, enum: ['active', 'inactive'], default: 'active' },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

planSchema.index({ name: 1 }, { unique: true });
export default mongoose.model('Plan', planSchema);

2.2 Subscription Model
// src/domain/models/platform/subscription.model.js
import mongoose from 'mongoose';
import { SUBSCRIPTION_STATUS } from '#domain/enums/subscription-status.enum.js';

const subscriptionSchema = new mongoose.Schema({
  organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true },
  planId: { type: mongoose.Schema.Types.ObjectId, ref: 'Plan', required: true },
  status: { type: String, enum: Object.values(SUBSCRIPTION_STATUS), default: SUBSCRIPTION_STATUS.ACTIVE },
  startDate: { type: Date, default: Date.now },
  endDate: Date,
  billingCycle: { type: String, enum: ['monthly', 'yearly'], required: true },
  nextBillingDate: Date,
  features: [String],
  limits: {
    maxSchools: Number,
    maxStudents: Number,
    maxStorage: Number,
  },
  usage: {
    currentSchools: Number,
    currentStudents: Number,
    currentStorage: Number,
  },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

subscriptionSchema.index({ organizationId: 1 }, { unique: true });
subscriptionSchema.index({ status: 1, nextBillingDate: 1 });
export default mongoose.model('Subscription', subscriptionSchema);

3. Feature Access Control
3.1 Subscription Middleware
// src/shared/middleware/subscription.middleware.js
import { Subscription } from '#domain/models/platform/subscription.model.js';
import { BusinessException } from '#shared/exceptions/business.exception.js';

export const requireSubscriptionFeature = (feature) => async (req, res, next) => {
  try {
    const tenantId = req.context.tenantId;
    const subscription = await Subscription.findOne({ tenantId });
    
    if (!subscription || subscription.status !== 'active') {
      throw new BusinessException('Active subscription required', 403);
    }
    
    if (!subscription.features.includes(feature)) {
      throw new BusinessException('Feature not available in your plan', 403);
    }
    
    next();
  } catch (error) {
    next(error);
  }
};

3.2 Usage Limit Enforcement
// src/shared/middleware/usage-limit.middleware.js
import { Subscription } from '#domain/models/platform/subscription.model.js';
import { BusinessException } from '#shared/exceptions/business.exception.js';

export const checkUsageLimit = (resource, increment = 1) => async (req, res, next) => {
  try {
    const tenantId = req.context.tenantId;
    const subscription = await Subscription.findOne({ tenantId });
    
    if (!subscription) {
      throw new BusinessException('No subscription found', 403);
    }
    
    const currentUsage = subscription.usage[`current${resource}`];
    const maxLimit = subscription.limits[`max${resource}`];
    
    if (currentUsage + increment > maxLimit) {
      throw new BusinessException(`${resource} limit exceeded`, 429);
    }
    
    next();
  } catch (error) {
    next(error);
  }
};

4. Billing & Payment Integration
4.1 Billing Service
// src/core/services/billing.service.js
import { Invoice } from '#domain/models/invoice.model.js';
import { Payment } from '#domain/models/payment.model.js';
import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

class BillingService {
  async createInvoice(subscriptionId, amount) {
    const invoice = new Invoice({
      subscriptionId,
      amount,
      status: 'pending',
      dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
    });
    
    await invoice.save();
    return invoice;
  }

  async processPayment(invoiceId, paymentData) {
    const charge = await stripe.charges.create({
      amount: paymentData.amount * 100,
      currency: 'usd',
      source: paymentData.token,
      description: `Payment for invoice ${invoiceId}`
    });
    
    const payment = new Payment({
      invoiceId,
      amount: paymentData.amount,
      status: 'completed',
      transactionId: charge.id
    });
    
    await payment.save();
    return payment;
  }
}

export default new BillingService();

4.2 Subscription Renewal Job
// src/jobs/subscription-renewal.job.js
import { Subscription } from '#domain/models/platform/subscription.model.js';
import { BillingService } from '#core/services/billing.service.js';

async function renewSubscriptions() {
  const subscriptions = await Subscription.find({
    status: 'active',
    nextBillingDate: { $lte: new Date() }
  });
  
  for (const sub of subscriptions) {
    const amount = sub.plan.price[sub.billingCycle];
    const invoice = await BillingService.createInvoice(sub._id, amount);
    // Send invoice notification
    // Process automatic payment if enabled
  }
}

Last Updated: August 25, 2025Version: 1.0