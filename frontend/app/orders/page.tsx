'use client';

import { Suspense } from 'react';
import OrdersPage from '@/views/pages/OrdersPage';

export default function Page() {
  return (
    <Suspense>
      <OrdersPage />
    </Suspense>
  );
}
