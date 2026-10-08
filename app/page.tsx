import { FeedCard } from '@/components/feed-card';
import { JsonLd } from '@/components/site';
import { listPosts } from '@/lib/data';
import { breadcrumbLd, graph, toMetadata, websiteLd } from '@/lib/seo/engine';

export const metadata = toMetadata({
  title: 'Vora — Karadeniz’de şehir, iş, yolculuk ve etkinlik',
  description:
    'Karadeniz’de şehir gündemi, etkinlik, paylaşımlı yolculuk, iş ilanı ve yerel pazar. Vora ile şehrindeki işleri tek hesapta hallet.',
  path: '/',
  index: true,
  type: 'website',
  breadcrumbs: [{ name: 'Ana sayfa', path: '/' }],
});

export default async function HomePage() {
  const posts = await listPosts({ limit: 40 });
  return (
    <section className="block">
      <JsonLd data={graph([websiteLd(), breadcrumbLd([{ name: 'Ana sayfa', path: '/' }])])} />
      <div className="wrap feed-list">
        <h1 className="sr-only">Akış</h1>
        <div className="feed-filters">
          <span>Tüm iller</span>
          <span>Tüm ilçeler</span>
        </div>
        {posts.length === 0 ? <p className="empty">Koşulları sağlayan paylaşım yok.</p> : null}
        {posts.map((post) => (
          <FeedCard key={post.id} post={post} />
        ))}
      </div>
    </section>
  );
}
