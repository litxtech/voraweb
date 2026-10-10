import { CITIES } from '@/lib/cities';
import { listBlogPosts, listEvents, listPosts, listProfiles, postSeo, profileSeo } from '@/lib/data';
import { editorialPaths } from '@/lib/seo/routes';
import { absoluteUrl, isIndexableDeployment } from '@/lib/site';

export const dynamic = 'force-dynamic';

type Entry = { path: string; lastmod?: string | null };

function escapeXml(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
}

function xml(entries: Entry[]): string {
  const urls = entries
    .map((entry) => {
      const lastmod = entry.lastmod && !Number.isNaN(Date.parse(entry.lastmod))
        ? `<lastmod>${entry.lastmod.slice(0, 10)}</lastmod>`
        : '';
      return `  <url><loc>${escapeXml(absoluteUrl(entry.path))}</loc>${lastmod}<changefreq>weekly</changefreq></url>`;
    })
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<?xml-stylesheet type="text/xsl" href="/sitemap.xsl"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>`;
}

async function entries(): Promise<Entry[]> {
  const [blogs, posts, profiles, events] = await Promise.all([
    listBlogPosts('tr', 200),
    listPosts({ limit: 200 }),
    listProfiles(200),
    listEvents({ limit: 200 }),
  ]);
  const pages = editorialPaths()
    .filter((path) => !path.startsWith('/city/'))
    .map((path) => ({ path }));
  const cities = [
    '/cities',
    ...CITIES.map((city) => `/city/${city.id}`),
    ...CITIES.flatMap((city) => city.topics.map((topic) => `/city/${city.id}/${topic.slug}`)),
  ].map((path) => ({ path }));
  const blog = [
    { path: '/blog' },
    ...blogs
      .filter((post) => post.content.trim().length > 80 && post.seo_indexable)
      .map((post) => ({ path: `/blog/${post.slug}`, lastmod: post.updated_at })),
  ];
  const postEntries = posts
    .filter((post) => postSeo(post).index)
    .map((post) => ({ path: `/p/${post.id}`, lastmod: post.updated_at }));
  const profileEntries = profiles
    .filter((profile) => profileSeo(profile, posts.filter((post) => post.author_id === profile.id).length).index)
    .map((profile) => ({ path: `/u/${profile.username}`, lastmod: profile.created_at }));
  const eventEntries = [
    { path: '/events' },
    ...events
      .filter((event) => event.description.trim().length >= 80)
      .map((event) => ({ path: `/events/${event.id}`, lastmod: event.updated_at })),
  ];
  const unique = new Map<string, Entry>();
  for (const entry of [...pages, ...cities, ...blog, ...postEntries, ...profileEntries, ...eventEntries]) {
    if (!unique.has(entry.path)) unique.set(entry.path, entry);
  }
  return [...unique.values()];
}

export async function GET() {
  const body = isIndexableDeployment() ? xml(await entries()) : xml([]);
  return new Response(body, { headers: { 'content-type': 'application/xml; charset=utf-8' } });
}
