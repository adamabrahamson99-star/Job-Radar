import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { getStripe, tierFromPriceId } from "@/lib/stripe";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Stripe requires the raw request body for signature verification —
// Next.js must NOT parse it as JSON first.
export async function POST(req: NextRequest) {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    console.error("[STRIPE WEBHOOK] STRIPE_WEBHOOK_SECRET is not set");
    return NextResponse.json({ error: "Webhook secret not configured" }, { status: 500 });
  }

  const sig = req.headers.get("stripe-signature");
  if (!sig) {
    return NextResponse.json({ error: "Missing stripe-signature header" }, { status: 400 });
  }

  let event: Stripe.Event;
  const rawBody = await req.text();

  try {
    event = getStripe().webhooks.constructEvent(rawBody, sig, webhookSecret);
  } catch (err) {
    console.error("[STRIPE WEBHOOK] Signature verification failed:", err);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  try {
    switch (event.type) {
      // ── Checkout completed — subscription is now active ──────────────────────
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        if (session.mode !== "subscription") break;

        const userId =
          session.metadata?.radar_user_id ??
          (await resolveUserIdFromCustomer(session.customer as string));

        if (!userId) {
          console.error("[STRIPE WEBHOOK] checkout.session.completed: no radar_user_id found");
          break;
        }

        // Retrieve the subscription to get the price ID
        const subscription = await getStripe().subscriptions.retrieve(
          session.subscription as string
        );
        const priceId = subscription.items.data[0]?.price.id ?? "";
        const tier = tierFromPriceId(priceId);

        if (!tier) {
          console.error(`[STRIPE WEBHOOK] Unknown price_id: ${priceId}`);
          break;
        }

        await prisma.user.update({
          where: { id: userId },
          data: {
            subscription_tier: tier as any,
            subscription_status: "ACTIVE",
            trial_ends_at: null,
            stripe_customer_id: session.customer as string,
          },
        });

        console.log(`[STRIPE WEBHOOK] checkout.session.completed — user=${userId} tier=${tier}`);
        break;
      }

      // ── Subscription updated — plan change or renewal ─────────────────────────
      case "customer.subscription.updated": {
        const subscription = event.data.object as Stripe.Subscription;
        const userId =
          subscription.metadata?.radar_user_id ??
          (await resolveUserIdFromCustomer(subscription.customer as string));

        if (!userId) {
          console.error("[STRIPE WEBHOOK] subscription.updated: no radar_user_id found");
          break;
        }

        const priceId = subscription.items.data[0]?.price.id ?? "";
        const tier = tierFromPriceId(priceId);

        if (!tier) {
          console.error(`[STRIPE WEBHOOK] Unknown price_id: ${priceId}`);
          break;
        }

        const stripeStatus = subscription.status;
        const dbStatus = mapStripeStatus(stripeStatus);

        await prisma.user.update({
          where: { id: userId },
          data: {
            subscription_tier: tier as any,
            subscription_status: dbStatus,
          },
        });

        console.log(
          `[STRIPE WEBHOOK] subscription.updated — user=${userId} tier=${tier} status=${dbStatus}`
        );
        break;
      }

      // ── Subscription deleted — cancellation or non-payment ───────────────────
      case "customer.subscription.deleted": {
        const subscription = event.data.object as Stripe.Subscription;
        const userId =
          subscription.metadata?.radar_user_id ??
          (await resolveUserIdFromCustomer(subscription.customer as string));

        if (!userId) {
          console.error("[STRIPE WEBHOOK] subscription.deleted: no radar_user_id found");
          break;
        }

        await prisma.user.update({
          where: { id: userId },
          data: {
            subscription_tier: "FREE",
            subscription_status: "CANCELED",
            trial_ends_at: null,
          },
        });

        console.log(`[STRIPE WEBHOOK] subscription.deleted — user=${userId} downgraded to FREE`);
        break;
      }

      // ── Invoice payment failed ────────────────────────────────────────────────
      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice;
        const customerId = invoice.customer as string;
        const userId = await resolveUserIdFromCustomer(customerId);

        if (!userId) break;

        await prisma.user.update({
          where: { id: userId },
          data: { subscription_status: "PAST_DUE" },
        });

        console.log(`[STRIPE WEBHOOK] invoice.payment_failed — user=${userId} marked PAST_DUE`);
        break;
      }

      default:
        // Unhandled event type — acknowledge and ignore
        break;
    }
  } catch (err) {
    console.error("[STRIPE WEBHOOK] Handler error:", err);
    // Return 200 anyway so Stripe doesn't keep retrying for DB errors
    return NextResponse.json({ received: true, warning: "Handler error, check logs" });
  }

  return NextResponse.json({ received: true });
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Fall back to looking up the user by their Stripe customer ID when the
 * metadata.radar_user_id field is absent (e.g. for subscriptions created
 * before we added the metadata).
 */
async function resolveUserIdFromCustomer(customerId: string): Promise<string | null> {
  if (!customerId) return null;
  const user = await prisma.user.findFirst({
    where: { stripe_customer_id: customerId },
    select: { id: true },
  });
  return user?.id ?? null;
}

/** Map Stripe subscription status strings to our SubscriptionStatus enum values */
function mapStripeStatus(
  stripeStatus: Stripe.Subscription.Status
): "ACTIVE" | "TRIALING" | "CANCELED" | "PAST_DUE" {
  switch (stripeStatus) {
    case "active":
      return "ACTIVE";
    case "trialing":
      return "TRIALING";
    case "canceled":
    case "incomplete_expired":
      return "CANCELED";
    case "past_due":
    case "unpaid":
    case "incomplete":
      return "PAST_DUE";
    default:
      return "ACTIVE";
  }
}
