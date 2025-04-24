import { redirect } from 'next/navigation';
import { getSession } from '@/app/(auth)/auth'; 
import { DocumentsView } from '@/components/documents-view'; 

export default async function Page() {
  const session = await getSession();

  if (!session?.user?.id) {
    redirect('/'); 
  }

  const subscription = session.subscription;
  
  const hasActiveSubscription = process.env.STRIPE_ENABLED !== 'true' || 
                                subscription?.status === 'active' || 
                                subscription?.status === 'trialing';

  return (
    <DocumentsView 
      userId={session.user.id}
      hasActiveSubscription={hasActiveSubscription} 
    />
  );
} 