import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import { DashboardClient } from './dashboard-client';

export default async function HomePage() {
  const session = await auth();
  // El familiar solo tiene el portal de su residente.
  if (session?.user.role === 'FAMILIAR') redirect('/portal');
  return <DashboardClient />;
}
