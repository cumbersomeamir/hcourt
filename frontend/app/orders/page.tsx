import { Suspense } from 'react';
import OrdersPage from '@/views/pages/OrdersPage';
import { publicPageMetadata } from '@/lib/seo';

export const metadata = publicPageMetadata('/orders', 'Allahabad High Court & Lucknow Bench Orders and Judgments', 'Search Allahabad High Court and Lucknow Bench case orders and judgments, and view or download available PDFs with Courtlens.');

export default function Page() {
  return (
    <Suspense>
      <OrdersPage />
    </Suspense>
  );
}
