import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import Clarity from "@/components/Clarity";
import ClientErrorReporter from "@/components/ClientErrorReporter";
import GlobalMobileNavigation from "@/views/components/GlobalMobileNavigation";
import RoutePrefetcher from "@/views/components/RoutePrefetcher";
import WebAccountLink from "@/components/WebAccountLink";
import { siteUrl } from "@/lib/seo";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "Courtlens | Allahabad High Court & Lucknow Bench Tools",
    template: "%s | Courtlens",
  },
  description: "Access Allahabad High Court and Lucknow Bench court activity boards, cause lists, orders, judgments, and case tracking tools with Courtlens.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'WebSite',
            name: 'Courtlens',
            url: siteUrl,
            description: 'Independent tools for Allahabad High Court and Lucknow Bench court activity, cause lists, orders, and case tracking.',
          }) }}
        />
        <Clarity />
        <ClientErrorReporter />
        <GlobalMobileNavigation />
        <RoutePrefetcher />
        <WebAccountLink />
        {children}
      </body>
    </html>
  );
}
