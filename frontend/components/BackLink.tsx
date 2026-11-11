'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { ComponentProps } from 'react';
import { navigateBack } from '@/lib/navigation';

type Props = Omit<ComponentProps<typeof Link>, 'href'> & { fallbackHref?: string };

export default function BackLink({ fallbackHref = '/', onClick, ...props }: Props) {
  const router = useRouter();
  return <Link {...props} href={fallbackHref} onClick={(event) => {
    onClick?.(event);
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    navigateBack(router, fallbackHref);
  }} />;
}
