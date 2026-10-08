import type { Metadata } from 'next';
import Link from 'next/link';
import { JsonLd } from '@/components/site';
import { CITIES, cityById } from '@/lib/cities';
import { displayName, listBlogPosts, listEvents, listPosts, listProfiles, postHeadline } from '@/lib/data';
import { graph, toMetadata } from '@/lib/seo/engine';
import { ANDROID_PLAY_STORE_URL, IOS_APP_STORE_URL } from '@/lib/site';

const HOME_FAQ = [
  {
    question: 'Vora nedir?',
    answer: 'Vora, Karadeniz şehirlerindeki insanları, etkinlikleri, hizmetleri ve yerel paylaşımları aynı ağda buluşturan bir şehir platformudur.',
  },
  {
    question: 'Web’de hangi içerikler görünür?',
    answer: 'Yalnızca herkese açık ve yayındaki profiller, paylaşımlar, etkinlikler ve blog yazıları listelenir. Taslaklar ve kapalı hesaplar bu sitede yer almaz.',
  },
  {
    question: 'Şehir sayfası ne işe yarar?',
    answer: 'Her ilin sayfası o şehirdeki herkese açık insanları, paylaşımları, etkinlikleri ve yazıları bir arada gösterir. İlçe sayfası ancak gerçek içerik varsa açılır.',
  },
  {
    question: 'Uygulama şart mı?',
    answer: 'Okumak için değil. Paylaşmak, mesajlaşmak ve şehir odasına katılmak için iOS veya Android uygulaması kullanılır.',
  },
];

export const metadata: Metadata = toMetadata({
  title: 'Vora — Karadeniz’in dijital şehir ağı',
  description: 'Şehrindeki insanları, işletmeleri, etkinlikleri, fırsatları ve günlük yaşamı tek yerde keşfet.',
  path: '/',
  index: true,
  type: 'website',
});

export default async function HomePage() {
  const [posts, people, events, blogs] = await Promise.all([
    listPosts({ limit: 4 }),
    listProfiles(4),
    listEvents({ limit: 4 }),
    listBlogPosts('tr', 3),
  ]);
  const upcoming = events
    .filter((event) => new Date(event.starts_at).getTime() >= Date.now())
    .slice(0, 4);
  const jsonLd = graph([
    {
      '@type': 'FAQPage',
      mainEntity: HOME_FAQ.map((item) => ({
        '@type': 'Question',
        name: item.question,
        acceptedAnswer: { '@type': 'Answer', text: item.answer },
      })),
    },
  ]);

  return (
    <>
      <JsonLd data={jsonLd} />
      <section className="home-hero">
        <div className="wrap">
          <p className="kicker">Vora</p>
          <h1>Karadeniz’in dijital şehir ağı</h1>
          <p className="lead">Şehrindeki insanları, işletmeleri, etkinlikleri, fırsatları ve günlük yaşamı tek yerde keşfet.</p>
          <div className="home-actions">
            <Link className="btn" href="/explore">Vora’yı keşfet</Link>
            <Link className="btn ghost" href="#sehirler">Şehrini seç</Link>
          </div>
        </div>
      </section>

      <section className="band" id="sehirler">
        <div className="wrap">
          <h2>Şehrini seç</h2>
          <p className="lead">On sekiz Karadeniz ili. Her sayfa o ilin kendi metninden ve herkese açık kayıtlarından beslenir.</p>
          <div className="city-grid">
            {CITIES.map((city) => (
              <Link key={city.id} href={`/city/${city.id}`} className="city-tile">
                <strong>{city.name}</strong>
                <span>{city.description}</span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section className="band" id="vora">
        <div className="wrap split">
          <div>
            <h2>Vora nedir?</h2>
            <p>Bir ilçe tanıtım sitesi değil. İnsan, etkinlik, hizmet ve paylaşım aynı şehir kimliği altında durur. Web bu ağın herkese açık yüzüdür; hesap, mesaj ve şehir odası uygulamada kalır.</p>
            <p><Link href="/about">Platformun nasıl çalıştığını oku</Link></p>
          </div>
          <ul className="quiet-list">
            <li><strong>Yerel odak</strong><span>İçerik bir ile bağlıdır. Genel bir akışın içine sıkışmaz.</span></li>
            <li><strong>Gerçek hesaplar</strong><span>Listelenen profiller herkese açık kayıtlardır. Sayı uydurulmaz.</span></li>
            <li><strong>Açık yüzey</strong><span>Kapalı paylaşım, taslak yazı ve özel oda bu sitede indexlenmez.</span></li>
            <li><strong>Topluluk kuralları</strong><span>Platform 18 yaş ve üzeridir. Kurallar herkese aynı şekilde uygulanır.</span></li>
          </ul>
        </div>
      </section>

      <section className="band" id="etkinlikler">
        <div className="wrap">
          <h2>Yaklaşan etkinlikler</h2>
          <p className="lead">Yayındaki herkese açık etkinlikler. Geçmiş kayıtlar silinmez, arşivde kalır.</p>
          {upcoming.length === 0 ? <p className="empty">Şu an yaklaşan herkese açık etkinlik yok.</p> : (
            <div className="row-cards">
              {upcoming.map((event) => (
                <Link key={event.id} href={`/events/${event.id}`} className="row-card">
                  <strong>{event.title}</strong>
                  <span className="meta-line">
                    {new Date(event.starts_at).toLocaleString('tr-TR', { dateStyle: 'medium', timeStyle: 'short' })}
                    {cityById(event.region_id) ? ` · ${cityById(event.region_id)?.name}` : ''}
                  </span>
                </Link>
              ))}
            </div>
          )}
          <p><Link href="/events">Karadeniz etkinlikleri</Link></p>
        </div>
      </section>

      <section className="band" id="insanlar">
        <div className="wrap">
          <h2>İnsanlar</h2>
          <p className="lead">Arama motorunda görünmeyi açmış herkese açık profiller.</p>
          {people.length === 0 ? <p className="empty">Şu an listelenecek profil yok.</p> : (
            <div className="row-cards">
              {people.map((person) => (
                <Link key={person.id} href={`/u/${person.username}`} className="row-card">
                  <strong>{displayName(person.full_name, person.username)}</strong>
                  <span className="meta-line">@{person.username}</span>
                </Link>
              ))}
            </div>
          )}
          <p><Link href="/people">Tüm herkese açık profiller</Link></p>
        </div>
      </section>

      <section className="band" id="is">
        <div className="wrap split">
          <div>
            <h2>İş ve fırsatlar</h2>
            <p>İlanlar şehirle ilişkilidir ve uygulamadaki iş alanında yayınlanır. Web’de karşılığı olmayan boş bir ilan sayfası açılmaz; kayıt herkese açık olduğunda şehir sayfasına bağlanır.</p>
          </div>
          <div>
            <h2 id="hizmetler">Hizmetler</h2>
            <p>Usta, servis ve randevu kayıtları uygulamanın hizmet merkezindedir. Doğrulanmamış bir listeyi arama sonucuna çıkarmak yerine, şehir sayfası yalnızca yayındaki kaydı gösterir.</p>
          </div>
        </div>
      </section>

      <section className="band" id="pazar">
        <div className="wrap split">
          <div>
            <h2>Pazar</h2>
            <p>İkinci el ve yerel satış, hesabın bağlı olduğu şehirde yürür. Kapalı ilanlar bu sitede yer almaz.</p>
          </div>
          <div>
            <h2 id="yolculuk">Yolculuk</h2>
            <p>Paylaşımlı yolculuk ilanları uygulamada açılır. Güzergâh ve koltuk bilgisi ancak ilan sahibi herkese açtıysa görünür.</p>
            <p><Link href="/discover">Ağa uygulamadan devam et</Link></p>
          </div>
        </div>
      </section>

      <section className="band" id="paylasimlar">
        <div className="wrap">
          <h2>Son paylaşımlar</h2>
          {posts.length === 0 ? <p className="empty">Herkese açık paylaşım yok.</p> : (
            <div className="row-cards">
              {posts.map((post) => (
                <Link key={post.id} href={`/p/${post.id}`} className="row-card">
                  <strong>{postHeadline(post)}</strong>
                  <span className="meta-line">
                    {displayName(post.author_name, post.author_username)}
                    {cityById(post.region_id) ? ` · ${cityById(post.region_id)?.name}` : ''}
                  </span>
                </Link>
              ))}
            </div>
          )}
          <p><Link href="/posts">Herkese açık paylaşımlar</Link></p>
        </div>
      </section>

      <section className="band" id="blog">
        <div className="wrap">
          <h2>Şehirlerden yazılar</h2>
          {blogs.length === 0 ? <p className="empty">Yayımlanmış blog yazısı yok.</p> : (
            <div className="row-cards">
              {blogs.map((post) => (
                <Link key={post.id} href={`/blog/${post.slug}`} className="row-card">
                  <strong>{post.title}</strong>
                  <span className="meta-line">{post.excerpt}</span>
                </Link>
              ))}
            </div>
          )}
          <p><Link href="/blog">Blog</Link></p>
        </div>
      </section>

      <section className="band" id="uygulama">
        <div className="wrap split">
          <div>
            <h2>Vora uygulaması</h2>
            <p>Şehir odası, mesaj ve paylaşım telefonda. Web okumak ve bulmak içindir.</p>
            <div className="home-actions">
              <a className="btn" href={IOS_APP_STORE_URL}>App Store</a>
              <a className="btn ghost" href={ANDROID_PLAY_STORE_URL}>Google Play</a>
            </div>
          </div>
          <div>
            <h2>Güvenli kullanım</h2>
            <p>Hesap silme, gizlilik ve topluluk kuralları açık sayfalardadır. Destek adresi support@litxtech.com.</p>
            <p>
              <Link href="/community-rules">Topluluk kuralları</Link>
              {' · '}
              <Link href="/privacy">Gizlilik</Link>
              {' · '}
              <Link href="/account-deletion">Hesap silme</Link>
            </p>
          </div>
        </div>
      </section>

      <section className="band" id="sss">
        <div className="wrap">
          <h2>Sık sorulanlar</h2>
          {HOME_FAQ.map((item) => (
            <article key={item.question} className="row-card">
              <h3>{item.question}</h3>
              <p>{item.answer}</p>
            </article>
          ))}
          <div className="home-actions">
            <Link className="btn" href="/register">Vora’ya katıl</Link>
            <Link className="btn ghost" href="/cities">Şehirlere bak</Link>
          </div>
        </div>
      </section>
    </>
  );
}
