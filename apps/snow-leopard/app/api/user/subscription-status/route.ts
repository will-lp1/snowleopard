import { NextResponse } from 'next/server';
import { getSession } from '@/app/(auth)/auth'; // Use the aliased path
import { getActiveSubscriptionByUserId } from '@/lib/db/queries';

export const dynamic = 'force-dynamic'; // Ensure fresh data on each request

export async function GET() {
  const session = await getSession();
  if (!session?.user?.id) {
    return NextResponse.json({ hasActiveSubscription: false }, { status: 200 });
  }
  // If Stripe disabled, grant access
  if (process.env.STRIPE_ENABLED !== 'true') {
    return NextResponse.json({ hasActiveSubscription: true }, { status: 200 });
  }
  // Otherwise check active subscription status
  const subscription = await getActiveSubscriptionByUserId({ userId: session.user.id });
  const hasActiveSubscription = subscription?.status === 'active';
  return NextResponse.json({ hasActiveSubscription }, { status: 200 });
} 