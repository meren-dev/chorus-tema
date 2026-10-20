import Component from "@glimmer/component";
import { tracked } from "@glimmer/tracking";
import { service } from "@ember/service";
import { htmlSafe } from "@ember/template";
import { ajax } from "discourse/lib/ajax";
import { on } from "@ember/modifier";
import { fn } from "@ember/helper";
import { action } from "@ember/object";
import { extractError } from "discourse/lib/ajax-error";
import { apiInitializer } from "discourse/lib/api";

// Chorus · Odalar
// Sitenin dört odası: Dinle · Oku · Oyna · Takıl.
// Menüde odalar (masaüstünde header'da, mobilde header'ın altında şerit),
// bulunduğun oda işaretli; oda sayfasının başında kısa giriş;
// ana sayfada Bugün ve Takıl'da konuşulanlar blokları.

const ANAHTARLAR = ["dinle", "oku", "oyna", "takil"];
const RADYO_YOLU = "/chat/c/kepenk-radyosu";
const RADYO_URL = "/chat/c/kepenk-radyosu/3";

function odalar() {
  return [
    {
      key: "dinle",
      ad: "Dinle",
      id: settings.oda_dinle,
      alt: "Radyo, seçkiler, listeler. Burada sadece dinlemek de katılmak sayılır.",
      bos: "Raflar daha boş. İlk seçki yolda; o gelene kadar radyo açık.",
    },
    {
      key: "oku",
      ad: "Oku",
      id: settings.oda_oku,
      alt: "Common Hours'tan uzun soluklu yazılar. Okumak serbest, yazmak ekipte.",
      bos: "Kepenk okuma gözlüğünü arıyor. İlk yazılar yolda.",
    },
    {
      key: "oyna",
      ad: "Oyna",
      id: settings.oda_oyna,
      alt: "Günün sorusu, her gün bir Kör Dinleme, ayda bir Dört Dörtlük. Bilmek şart değil, kulak yeter.",
      bos: "Masa kuruluyor. İlk soruyu Kepenk saklıyor, yakında ortaya döker.",
    },
    {
      key: "takil",
      ad: "Takıl",
      id: settings.oda_takil,
      alt: "Yeni gelenler, açık masalar, ne dinlediğin, yarım işlerin. Kepenk de burada.",
      bos: "Burası henüz sessiz. İlk lafı sen at, Kepenk tepki vermeye hazır.",
    },
  ];
}

function kategori(site, id) {
  return (site.categories || []).find((c) => c.id === id);
}

// Kategori tanım konuları ("About the ... category") listelere karışmasın
function tanimKonulari(site) {
  return new Set(
    (site.categories || [])
      .map((c) => parseInt(String(c.topic_url || "").split("/").pop(), 10))
      .filter(Boolean)
  );
}

function odaUrl(site, id) {
  return kategori(site, id)?.url || `/c/${id}`;
}

// Şu an hangi odadayız? Kategori sayfası, konu sayfası ya da radyo.
function aktifOda(router, site) {
  const url = router.currentURL || "";
  if (url.startsWith(RADYO_YOLU)) {
    return "dinle";
  }
  let node = router.currentRoute;
  let catId = null;
  while (node && !catId) {
    const a = node.attributes;
    catId = a?.category?.id || a?.category_id || null;
    node = node.parent;
  }
  if (!catId) {
    return null;
  }
  const cat = kategori(site, catId);
  const kok = cat?.parent_category_id || catId;
  return odalar().find((o) => o.id === kok)?.key || null;
}

function ne_zaman(tarih) {
  const gun = Math.floor((Date.now() - new Date(tarih).getTime()) / 86400000);
  if (gun <= 0) {
    return "bugün";
  }
  if (gun === 1) {
    return "dün";
  }
  return `${gun} gün önce`;
}

// Kepenk yüzü şablonlara doğrudan gömülü (ayrı bileşen olarak hata veriyordu)

// Masaüstü: header'da Dinle · Oku · Oyna (Takıl, Kepenk'iyle ayrı bileşen)
class OdaMenu extends Component {
  @service site;

  get odalar() {
    return odalar()
      .filter((o) => o.key !== "takil")
      .map((o) => ({ ...o, url: odaUrl(this.site, o.id) }));
  }

  <template>
    <li class="chorus-odalar-li">
      <nav class="chorus-odalar" aria-label="Odalar">
        {{#each this.odalar key="key" as |o|}}
          <a href={{o.url}} class="chorus-oda chorus-oda--{{o.key}}">{{o.ad}}</a>
        {{/each}}
      </nav>
    </li>
  </template>
}

// Mobil: header'ın altında dört odalı şerit
class OdaSerit extends Component {
  @service site;

  get odalar() {
    return odalar().map((o) => ({ ...o, url: odaUrl(this.site, o.id) }));
  }

  <template>
    <nav class="chorus-oda-serit" aria-label="Odalar">
      {{#each this.odalar key="key" as |o|}}
        <a href={{o.url}} class="chorus-oda chorus-oda--{{o.key}}">{{o.ad}}</a>
      {{/each}}
    </nav>
  </template>
}

// Oda sayfasının başı: başlık, Kepenk sesiyle tek satır, alt bölümler.
// Veri render sırasında değil, sayfa değişince bir kez hesaplanır; böylece
// bileşen yeniden çizilse bile DOM aynı kalır (oda sayfalarındaki donmanın çaresi).
class OdaDurumu {
  @tracked giris = null;
}
const durum = new OdaDurumu();

function girisHesapla(router, site) {
  if (!(router.currentRouteName || "").startsWith("discovery.")) {
    return null;
  }
  const catId = router.currentRoute?.attributes?.category?.id;
  const o = odalar().find((x) => x.id === catId);
  if (!o) {
    return null;
  }
  const altlar = (site.categories || [])
    .filter((c) => c.parent_category_id === o.id)
    .sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
  const toplam = [kategori(site, o.id), ...altlar].reduce(
    (n, c) => n + (c?.topic_count || 0),
    0
  );
  return {
    key: o.key,
    ad: o.ad,
    alt: o.alt,
    altlar: altlar.map((c) => ({ ad: c.name, url: c.url })),
    radyo: o.key === "dinle" ? RADYO_URL : null,
    bos: toplam === 0 ? o.bos : null,
  };
}

function imza(g) {
  return g ? [g.key, g.bos || "", ...g.altlar.map((a) => a.url)].join("|") : "";
}

class OdaGiris extends Component {
  get html() {
    const g = durum.giris;
    if (!g) {
      return null;
    }
    const e = (x) => String(x).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
    const radyo = g.radyo
      ? `<a class="chorus-oda-giris__kapi is-radyo" href="${e(g.radyo)}"><span class="chorus-oda-giris__nokta" aria-hidden="true"></span>Kepenk Radyosu</a>`
      : "";
    const kapilar = g.altlar.map((a) => `<a class="chorus-oda-giris__kapi" href="${e(a.url)}">${e(a.ad)}</a>`).join("");
    const bos = g.bos ? `<p class="chorus-oda-giris__bos"><svg class="kepenk-yuz kepenk-yuz--kucuk" viewBox="0 0 24 24" aria-hidden="true" focusable="false" xmlns="http://www.w3.org/2000/svg"> <g fill="#F3EEE4" stroke="#F45139" stroke-width="1.9" stroke-linejoin="round"> <path d="M4.2 11.4 L5.2 3 L10.9 7.3 Z"/> <path d="M19.8 11.4 L18.8 3 L13.1 7.3 Z"/> <ellipse cx="12" cy="13.9" rx="8.7" ry="7.5"/> </g> <path d="M10.6 7.4v1.5M12 7.1v1.8M13.4 7.4v1.5" stroke="#F45139" stroke-width="1.1" stroke-linecap="round"/> <circle cx="8.4" cy="13.4" r="1.55" fill="#1b1b1a"/> <path d="M6 10.6H10.9V13.35L6 12.35Z" fill="#F3EEE4"/> <path d="M6.5 12.4L10.3 13.2" stroke="#1b1b1a" stroke-width="1.4" stroke-linecap="round"/> <circle cx="15.6" cy="13.3" r="1.55" fill="#1b1b1a"/> <path d="M13.1 10.6H18V12.25L13.1 12.75Z" fill="#F3EEE4"/> <path d="M13.7 12.7L17.5 12.3" stroke="#1b1b1a" stroke-width="1.4" stroke-linecap="round"/> <path d="M10.4 16.9q1.1.9 2.2 0q.8-.3 1.3-.9" stroke="#1b1b1a" stroke-width="1.2" fill="none" stroke-linecap="round"/> </svg><span>${e(g.bos)}</span></p>` : "";
    return htmlSafe(
      `<section class="chorus-oda-giris chorus-oda-giris--${e(g.key)}"><h1>${e(g.ad)}</h1><p class="chorus-oda-giris__alt">${e(g.alt)}</p><div class="chorus-oda-giris__kapilar">${radyo}${kapilar}</div>${bos}</section>`
    );
  }

  <template>
    {{#if this.html}}
      {{this.html}}
    {{/if}}
  </template>
}

// Ana sayfa: Bugün. Son 36 saatteki Günün Sorusu ve Kör Dinleme, son beş haftanın Dört Dörtlük'ü.
// Hiçbiri yoksa blok görünmez.
class Bugun extends Component {
  @service site;
  @tracked satirlar = [];

  constructor() {
    super(...arguments);
    this.yukle();
  }

  async sonKonu(catId, saat) {
    const cat = kategori(this.site, catId);
    if (!cat) {
      return null;
    }
    const j = await ajax(`${cat.url}/l/latest.json`, {
      data: { order: "created", per_page: 5 },
    });
    const sinir = Date.now() - saat * 3600 * 1000;
    const tanim = tanimKonulari(this.site);
    return (
      (j.topic_list?.topics || []).find(
        (x) => !tanim.has(x.id) && new Date(x.created_at).getTime() > sinir
      ) || null
    );
  }

  async yukle() {
    const isler = [
      { id: settings.gunun_sorusu, saat: 36, tur: "soru" },
      { id: settings.kor_dinleme, saat: 36, tur: "kor" },
      { id: settings.dort_dortluk, saat: 24 * 35, tur: "dortluk" },
    ];
    const sonuc = await Promise.all(
      isler.map(async (is) => {
        try {
          const t = await this.sonKonu(is.id, is.saat);
          if (!t) {
            return null;
          }
          const url = `/t/${t.slug}/${t.id}`;
          const kisi = Math.max(0, (t.posts_count || 1) - 1);
          if (is.tur === "soru") {
            const d = await ajax(`/t/${t.id}.json`).catch(() => null);
            const ilk = d?.post_stream?.posts?.[0];
            const bilgi = /data-wrap="bilgi"/.test(ilk?.cooked || "");
            const oy = (ilk?.polls || [])[0]?.voters || 0;
            return {
              key: "soru",
              etiket: bilgi ? "BİLİYOR MUYDUN?" : "SEN NE DERSİN?",
              baslik: t.fancy_title || t.title,
              url,
              alt: oy ? `${oy} kişi oy verdi` : "ilk oy senden",
              git: "Cevapla →",
            };
          }
          if (is.tur === "kor") {
            return {
              key: "kor",
              etiket: "KÖR DİNLEME",
              baslik: "Bugünün şarkısı kapalı. Bir saniyeden başla, bulabilir misin?",
              url,
              alt: kisi ? `${kisi} kişi tek kelime bıraktı` : "ilk kelime senden",
              git: "Dinle →",
            };
          }
          return {
            key: "dortluk",
            etiket: "DÖRT DÖRTLÜK",
            baslik: t.fancy_title || t.title,
            url,
            alt: kisi ? `ayın bulmacası · ${kisi} kişi sonucunu yazdı` : "ayın bulmacası",
            git: "Oyna →",
          };
        } catch {
          return null;
        }
      })
    );
    this.satirlar = sonuc.filter(Boolean);
  }

  <template>
    {{#if this.satirlar.length}}
      <div class="chorus-vitrin__block chorus-bugun">
        <h2>Bugün</h2>
        {{#each this.satirlar key="key" as |s|}}
          <div class="chorus-bugun__satir">
            <p class="chorus-vitrin__sub"><span class="chorus-bugun__bicim">{{s.etiket}}</span>{{s.alt}}</p>
            <a class="chorus-bugun__soru" href={{s.url}}>{{s.baslik}}</a>
            <a class="chorus-bugun__git" href={{s.url}}>{{s.git}}</a>
          </div>
        {{/each}}
      </div>
    {{/if}}
  </template>
}

// Ana sayfa: Takıl'da konuşulanlar (beşliler hariç, onlar "Kapıdan son girenler"de)
// Takıl masası: son açılan konular, kısa bağlam ve sayfadan çıkmadan cevap
function metne(html, sinir) {
  const m = (new DOMParser().parseFromString(html || "", "text/html").body.textContent || "")
    .replace(/\s+/g, " ")
    .trim();
  if (m.length <= sinir) {
    return m;
  }
  return m.slice(0, sinir).replace(/\s+\S*$/, "") + "…";
}

function avatarUrl(tpl, boy = 48) {
  return tpl ? tpl.replace("{size}", boy) : null;
}

class MasaKonusu {
  @tracked taslak = "";
  @tracked hata = null;
  @tracked gonderiliyor = false;
  @tracked tamam = false;
  @tracked bekliyor = false;
  @tracked son = null;
  @tracked cevapSayisi = 0;

  constructor(d) {
    this.id = d.id;
    this.baslik = d.baslik;
    this.url = d.url;
    this.yer = d.yer;
    this.zaman = d.zaman;
    this.ozet = d.ozet;
    this.son = d.son;
    this.cevapSayisi = d.cevapSayisi;
  }
}

function konuHazirla(site, t, d) {
  const postlar = d?.post_stream?.posts || [];
  const ilk = postlar[0];
  const sonPost = postlar.length > 1 ? postlar[postlar.length - 1] : null;
  return new MasaKonusu({
    id: t.id,
    baslik: t.title,
    url: `/t/${t.slug}/${t.id}`,
    yer: kategori(site, t.category_id)?.name || "",
    zaman: ne_zaman(t.created_at),
    ozet: ilk ? metne(ilk.cooked, 150) : "",
    son: sonPost
      ? {
          kim: sonPost.username,
          resim: avatarUrl(sonPost.avatar_template),
          metin: metne(sonPost.cooked, 110),
        }
      : null,
    cevapSayisi: Math.max(0, (t.posts_count || 1) - 1),
  });
}

class TakildaKonusulanlar extends Component {
  @service site;
  @service currentUser;
  @tracked konular = null;

  constructor() {
    super(...arguments);
    this.yukle();
  }

  get takilUrl() {
    return odaUrl(this.site, settings.oda_takil);
  }

  async yukle() {
    const takil = kategori(this.site, settings.oda_takil);
    if (!takil) {
      this.konular = [];
      return;
    }
    const tanim = tanimKonulari(this.site);
    try {
      const j = await ajax(`${takil.url}/l/latest.json`, {
        data: { order: "created", per_page: 12 },
      });
      const secili = (j.topic_list?.topics || [])
        .filter(
          (t) =>
            !tanim.has(t.id) &&
            t.category_id !== settings.besliler &&
            !t.closed &&
            !t.archived
        )
        .slice(0, 3);
      const detaylar = await Promise.all(
        secili.map((t) => ajax(`/t/${t.id}.json`).catch(() => null))
      );
      this.konular = secili.map((t, i) => konuHazirla(this.site, t, detaylar[i]));
    } catch {
      this.konular = [];
    }
  }

  @action
  yaz(k, e) {
    k.taslak = e.target.value;
    k.hata = null;
  }

  @action
  tus(k, e) {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      this.gonder(k);
    }
  }

  @action
  gonderForm(k, e) {
    e.preventDefault();
    this.gonder(k);
  }

  async gonder(k) {
    const metin = (k.taslak || "").trim();
    if (k.gonderiliyor) {
      return;
    }
    if (metin.length < 10) {
      k.hata = "Biraz daha yaz: en az 10 karakter.";
      return;
    }
    k.gonderiliyor = true;
    k.hata = null;
    try {
      const r = await ajax("/posts.json", {
        type: "POST",
        data: { topic_id: k.id, raw: metin },
      });
      k.bekliyor = r?.action === "enqueued";
      if (!k.bekliyor) {
        k.son = {
          kim: this.currentUser.username,
          resim: avatarUrl(this.currentUser.avatar_template),
          metin: metin.length > 110 ? metin.slice(0, 110) + "…" : metin,
        };
        k.cevapSayisi = k.cevapSayisi + 1;
      }
      k.taslak = "";
      k.tamam = true;
    } catch (err) {
      k.hata = extractError(err);
    } finally {
      k.gonderiliyor = false;
    }
  }

  <template>
    {{#if this.konular}}
      <div class="chorus-vitrin__block chorus-takilda">
        <h2>Takıl'da konuşulanlar</h2>
        {{#if this.konular.length}}
          <ul class="chorus-takilda__liste takil-masa">
            {{#each this.konular key="id" as |k|}}
              <li class="takil-masa__konu">
                <div class="takil-masa__ust">
                  <a class="takil-masa__baslik" href={{k.url}}>{{k.baslik}}</a>
                  <span class="chorus-takilda__meta">{{k.yer}} · {{k.zaman}}{{#if k.cevapSayisi}} · {{k.cevapSayisi}} cevap{{/if}}</span>
                </div>
                {{#if k.ozet}}
                  <p class="takil-masa__ozet">{{k.ozet}}</p>
                {{/if}}
                {{#if k.son}}
                  <p class="takil-masa__son">
                    {{#if k.son.resim}}
                      <img class="takil-masa__avatar" src={{k.son.resim}} alt="" width="20" height="20" loading="lazy" />
                    {{/if}}
                    <b>{{k.son.kim}}</b>
                    <span>{{k.son.metin}}</span>
                  </p>
                {{/if}}
                {{#if this.currentUser}}
                  {{#if k.tamam}}
                    <p class="takil-masa__tamam">
                      {{if k.bekliyor "Yazdın; bir editör onaylayınca görünecek." "Yazdın."}}
                      <a href={{k.url}}>Konuya git →</a>
                    </p>
                  {{else}}
                    <form class="takil-masa__cevap" {{on "submit" (fn this.gonderForm k)}}>
                      <textarea
                        class="takil-masa__kutu"
                        rows="1"
                        aria-label="Bu konuya cevap yaz"
                        placeholder={{if k.cevapSayisi "Sen de yaz…" "İlk cevabı sen yaz…"}}
                        value={{k.taslak}}
                        disabled={{k.gonderiliyor}}
                        {{on "input" (fn this.yaz k)}}
                        {{on "keydown" (fn this.tus k)}}
                      ></textarea>
                      <button type="submit" class="takil-masa__gonder" disabled={{k.gonderiliyor}}>
                        {{if k.gonderiliyor "Gidiyor…" "Gönder"}}
                      </button>
                    </form>
                    {{#if k.hata}}
                      <p class="takil-masa__hata" role="alert">{{k.hata}}</p>
                    {{/if}}
                  {{/if}}
                {{else}}
                  <a class="takil-masa__gir" href="/login">Katılmak için gir →</a>
                {{/if}}
              </li>
            {{/each}}
          </ul>
          <a class="chorus-bugun__git" href={{this.takilUrl}}>Takıl'a git →</a>
        {{else}}
          <p class="chorus-oda-giris__bos">Masa boş. İlk konuyu sen aç.</p>
        {{/if}}
      </div>
    {{/if}}
  </template>
}


export default apiInitializer((api) => {
  const router = api.container.lookup("service:router");
  const site = api.container.lookup("service:site");

  api.headerIcons.add("chorus-odalar", OdaMenu, { before: "chorus-takil" });
  api.renderInOutlet("below-site-header", OdaSerit);
  api.renderInOutlet("above-main-container", OdaGiris);
  api.renderInOutlet("chorus-vitrin-bugun", Bugun);
  api.renderInOutlet("chorus-vitrin-takil", TakildaKonusulanlar);

  // Bulunduğun oda: body'de chorus-oda-<oda> sınıfı; menüde o oda işaretlenir
  api.onPageChange(() => {
    const key = aktifOda(router, site);
    ANAHTARLAR.forEach((k) =>
      document.body.classList.toggle(`chorus-oda-${k}`, k === key)
    );
    const g = girisHesapla(router, site);
    if (imza(g) !== imza(durum.giris)) {
      durum.giris = g;
    }
    document.body.classList.toggle("chorus-oda-giris-on", !!g);
  });
});
