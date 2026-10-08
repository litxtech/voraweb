import type { Metadata } from 'next';
import Link from 'next/link';
import { CITIES } from '@/lib/cities';
import { toMetadata } from '@/lib/seo/engine';

export const metadata: Metadata = toMetadata({
  title: 'Karadeniz şehirleri',
  description: 'Vora’daki Karadeniz illeri. Her şehrin özgün tanıtımı, herkese açık paylaşımları ve etkinlikleri.',
  path: '/cities',
  index: true,
  type: 'website',
});

export default function CitiesPage() {
  return (
    <section className="block">
      <div className="wrap">
        <h1>Şehirler</h1>
        <div className="city-list">
          {CITIES.map((city) => (
            <Link key={city.id} href={`/city/${city.id}`}>
              <strong>{city.name}</strong>
              <span>{city.intro}</span>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
