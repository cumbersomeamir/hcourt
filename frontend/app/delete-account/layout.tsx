import { publicPageMetadata } from '@/lib/seo';

export const metadata = publicPageMetadata('/delete-account', 'Delete Your Account', 'Request deletion of your Courtlens account and associated data.');

export default function DeleteAccountLayout({ children }: { children: React.ReactNode }) {
  return children;
}
