import type { Metadata } from 'next';
import { Analytics } from '@/components/analytics';
import { OpenInApp } from '@/components/open-in-app';
import { SiteFooter, SiteHeader } from '@/components/site';
import { graph, organizationLd, softwareLd, websiteLd } from '@/lib/seo/engine';
import { isIndexableDeployment, siteUrl, SITE_NAME } from '@/lib/site';
import './globals.css';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl()),
  title: { default: `${SITE_NAME} — Karadeniz'in dijital şehir ağı`, template: `%s · ${SITE_NAME}` },
  description: 'Vora, Karadeniz şehirlerindeki insanları, işletmeleri, etkinlikleri ve yerel yaşamı aynı ağda buluşturur.',
  robots: isIndexableDeployment() ? { index: true, follow: true } : { index: false, follow: false },
  icons: { icon: '/vora-logo.png' },
  openGraph: {
    title: `${SITE_NAME} — Karadeniz'in dijital şehir ağı`,
    description: 'Şehrindeki insanları, işletmeleri, etkinlikleri ve günlük yaşamı tek yerde keşfet.',
    url: siteUrl(),
    siteName: SITE_NAME,
    locale: 'tr_TR',
    type: 'website',
    images: [{ url: '/vora-logo.png', alt: 'Vora' }],
  },
  twitter: {
    card: 'summary',
    title: `${SITE_NAME} — Karadeniz'in dijital şehir ağı`,
    description: 'Şehrindeki insanları, işletmeleri, etkinlikleri ve günlük yaşamı tek yerde keşfet.',
    images: ['/vora-logo.png'],
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const jsonLd = graph([organizationLd(), websiteLd(), softwareLd()]);
  return (
    <html lang="tr">
      <body>
        <a className="skip" href="#icerik">
          İçeriğe geç
        </a>
        <SiteHeader />
        <main id="icerik">{children}</main>
        <SiteFooter />
        <OpenInApp />
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
        <Analytics />
      </body>
    </html>
  );
}
