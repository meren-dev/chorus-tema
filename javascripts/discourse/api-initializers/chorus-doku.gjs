import Component from "@glimmer/component";
import { tracked } from "@glimmer/tracking";
import { on } from "@ember/modifier";
import { action } from "@ember/object";
import { service } from "@ember/service";
import { apiInitializer } from "discourse/lib/api";
import { ajax } from "discourse/lib/ajax";

// Chorus · Doku
// 1) Sol alt köşedeki Kepenk: header'daki Takıl Kepenk'i yol gösterir, bu ise eşlik eder.
//    Müzik çalınca sarı kulaklığını takıp başını sallar; tıklanınca bulunduğun yere göre
//    tek cümle söyler; boştayken arada bir yavaşça göz kırpar.
// 2) Arama sonuç vermeyince Kepenk'li, yönlendiren bir boş ekran.
// 3) Beşli eşleşmesi: ortak şarkı ya da sanatçı varsa Kepenk köşede kulak diker, ana sayfada not bırakır.
// 4) Telefonda Kepenk'e dokununca balonda iki seçenek: "Küçült" (yalnızca kulakları görünür, dokununca
//    geri gelir; bu tarayıcıda hatırlanır) ve "Bugünlük gizle" (24 saat görünmez).

const RADYO = "/chat/c/kepenk-radyosu/3";

const SOZLER = {
  caliyor: [
    { metin: "Şşş. {sarki} çalıyor, dinliyorum." },
    { metin: "Bu kısım güzel geliyor. Ses açık mı?" },
    { metin: "Bir saniyede durduysan yaz: 02:14 · ne olduysa." },
  ],
  ana: [
    { metin: "Radyo açık, ben buradayım. Bir şarkı seç, sonra konuşuruz.", link: RADYO, linkMetin: "Radyoya gir →", uye: true },
    { metin: "Bugün bir şey dinledin mi? Ben üç tane dinledim." },
    { metin: "Kapıdan girenlerin beşlisine bir kulak ver, altıncıyı sen öner." },
  ],
  ziyaretci: [
    { metin: "Hesap gerekmez. Önce dinle, sonra karar ver." },
    { metin: "Burası sessizce dinleyenlere de açık. Ben de öyleyim.", link: "/neresi-burasi", linkMetin: "Neresi burası? →" },
  ],
  dinle: [
    { metin: "Kulaklık takılı mı? Takılı değilse ben takarım.", link: RADYO, linkMetin: "Radyoya gir →", uye: true },
    { metin: "Bir liste kur, ilk dinleyen ben olayım." },
  ],
  oku: [
    { metin: "Okurken mırıldanmak serbest. Ben hep yapıyorum." },
    { metin: "Uzun yazı, kısa kedi. Sen oku, ben yanında uyuklarım." },
  ],
  oyna: [
    { metin: "Bugünün cevabını bilmiyorum. Bilsem de söylemezdim." },
    { metin: "Kaybetmek serbest, kopya yasak. Bana bile." },
  ],
  takil: [
    { metin: "Laf atmak serbest, ısırmam. Çoğunlukla." },
    { metin: "Cevapsız kalan bir konu görürsen ilk sen yaz. Kimse yalnız kalmasın." },
  ],
  konu: [
    { metin: "Bir saniyede durduysan yaz: 02:14 · ne olduysa." },
    { metin: "Altıncı şarkıyı önermek ayıp değil. Ben hep öneririm." },
  ],
  profil: [{ metin: "Profilin fena değil. Beşlini birine dinlettin mi?" }],
  arama: [{ metin: "Ben de aradım. Kepengin altında da yok." }, { metin: "Bulursan bana da söyle." }],
  genel: [
    { metin: "Ben Kepenk. Kediyim, dinliyorum." },
    { metin: "Bir şey mi arıyordun? Ben de." },
  ],
};

function kategoriUrl(site, id, yedek) {
  return (site.categories || []).find((c) => c.id === id)?.url || yedek;
}

// Beşli eşleşmesi: senin beşlinle başkasınınkinde ortak şarkı ya da sanatçı varsa Kepenk haber verir.
// Tür eşleşmesi tür etiketleri kurulunca buraya eklenecek.
const ONBELLEK = "chorus-besli-onbellek";
const GORDUM = "chorus-eslesme-gordum";
const GUN = 86400000;
const KUCUK = "chorus-kepenk-kucuk";
const GIZLI = "chorus-kepenk-gizli";
const UYANDI = { metin: "Buradayım. Kalabalık edersem yine küçült." };

function depoOku(anahtar, yedek) {
  try {
    return JSON.parse(localStorage.getItem(anahtar)) ?? yedek;
  } catch {
    return yedek;
  }
}

function depoYaz(anahtar, deger) {
  try {
    localStorage.setItem(anahtar, JSON.stringify(deger));
  } catch {
    // tarayıcı depolamaya izin vermiyorsa sessizce geç
  }
}

function sade(s) {
  return (s || "")
    .toLowerCase()
    .replace(/ı/g, "i")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^the /, "");
}

function iyelik(ad) {
  const kucuk = (ad || "").toLocaleLowerCase("tr");
  const unluler = "aeıioöuü";
  const sonUnlu = [...kucuk].reverse().find((c) => unluler.includes(c)) || "e";
  const ek = { a: "ın", ı: "ın", e: "in", i: "in", o: "un", u: "un", ö: "ün", ü: "ün" }[sonUnlu];
  return `${ad}'${unluler.includes(kucuk.slice(-1)) ? "n" : ""}${ek}`;
}

function besliCoz(cooked) {
  const dom = new DOMParser().parseFromString(cooked || "", "text/html");
  const ol = dom.querySelector("ol");
  if (!ol) {
    return [];
  }
  return [...ol.querySelectorAll(":scope > li")]
    .slice(0, 5)
    .map((li) => {
      const metin = li.textContent || "";
      let parca = metin.split("·");
      if (parca.length < 2) {
        parca = metin.split(" - ");
      }
      return { sanatci: (parca[0] || "").trim(), sarki: (parca[1] || "").trim() };
    })
    .filter((p) => p.sanatci);
}

class HaberDeposu {
  @tracked liste = [];
}
const haberler = new HaberDeposu();
let eslesmeSozu = null;

async function besliListesi(site) {
  const kat = (site.categories || []).find((c) => c.slug === "besliler");
  const j = await ajax(`/c/${kat?.id || 9}.json`);
  const kullanicilar = new Map((j.users || []).map((u) => [u.id, u.username]));
  return (j.topic_list?.topics || [])
    .filter((t) => !/hakkında|about the/i.test(t.title))
    .map((t) => ({
      id: t.id,
      slug: t.slug,
      surum: `${t.bumped_at}|${t.posts_count}`,
      kullanici: kullanicilar.get(t.posters?.[0]?.user_id),
    }));
}

async function besliVerisi(konular) {
  const onbellek = depoOku(ONBELLEK, {});
  const simdi = Date.now();
  const eksik = konular.filter((k) => {
    const o = onbellek[k.id];
    return !o || o.surum !== k.surum || simdi - o.zaman > GUN;
  });
  for (let i = 0; i < eksik.length; i += 4) {
    await Promise.all(
      eksik.slice(i, i + 4).map(async (k) => {
        try {
          const t = await ajax(`/t/${k.id}.json`);
          const ilk = t.post_stream?.posts?.[0];
          onbellek[k.id] = {
            surum: k.surum,
            zaman: simdi,
            kullanici: ilk?.username || k.kullanici,
            parcalar: besliCoz(ilk?.cooked),
          };
        } catch {
          // bu beşli okunamadı, geç
        }
      })
    );
  }
  const temiz = {};
  konular.forEach((k) => {
    if (onbellek[k.id]) {
      temiz[k.id] = onbellek[k.id];
    }
  });
  depoYaz(ONBELLEK, temiz);
  return konular
    .filter((k) => temiz[k.id])
    .map((k) => ({ ...k, ...temiz[k.id], url: `/t/${k.slug}/${k.id}` }));
}

function eslestir(benim, digerleri) {
  const benSanatci = new Map(benim.parcalar.map((p) => [sade(p.sanatci), p.sanatci]));
  const benSarki = new Map(
    benim.parcalar
      .filter((p) => p.sarki)
      .map((p) => [`${sade(p.sanatci)}|${sade(p.sarki)}`, `${p.sanatci} · ${p.sarki}`])
  );
  return digerleri
    .map((d) => {
      const sarkilar = [
        ...new Set(d.parcalar.filter((p) => p.sarki).map((p) => `${sade(p.sanatci)}|${sade(p.sarki)}`)),
      ]
        .filter((a) => benSarki.has(a))
        .map((a) => benSarki.get(a));
      const sanatcilar = [...new Set(d.parcalar.map((p) => sade(p.sanatci)))]
        .filter((a) => a && benSanatci.has(a))
        .map((a) => benSanatci.get(a));
      return {
        kullanici: d.kullanici,
        url: d.url,
        sarkilar,
        sanatcilar,
        guc: sarkilar.length * 2 + sanatcilar.length,
        imza: `${d.id}:${sanatcilar.map(sade).sort().join(",")}`,
      };
    })
    .filter((m) => m.guc > 0)
    .sort((a, b) => b.guc - a.guc);
}

function haberMetni(m) {
  if (m.sarkilar.length) {
    return `${m.kullanici} ile aynı şarkıyı seçmişsiniz: ${m.sarkilar[0]}. Bence tesadüf değil.`;
  }
  return `${iyelik(m.kullanici)} beşlisinde senin de beşlindeki ${m.sanatcilar.slice(0, 2).join(" ve ")} var.`;
}

function eslesmeBaslat(site, user) {
  if (!user || eslesmeSozu) {
    return;
  }
  eslesmeSozu = (async () => {
    try {
      const konular = await besliListesi(site);
      if (!konular.some((k) => k.kullanici === user.username)) {
        return;
      }
      const veri = await besliVerisi(konular);
      const benim = veri.find((v) => v.kullanici === user.username);
      if (!benim || !benim.parcalar.length) {
        return;
      }
      const gordum = new Set(depoOku(GORDUM, []));
      haberler.liste = eslestir(
        benim,
        veri.filter((v) => v.kullanici && v.kullanici !== user.username)
      ).filter((m) => !gordum.has(m.imza));
    } catch {
      // eşleşme çıkmazsa Kepenk susar
    }
  })();
}

function haberGordum(m) {
  const gordum = depoOku(GORDUM, []);
  if (!gordum.includes(m.imza)) {
    gordum.push(m.imza);
    depoYaz(GORDUM, gordum.slice(-200));
  }
  haberler.liste = haberler.liste.filter((x) => x.imza !== m.imza);
}

class KoseKepenk extends Component {
  @service currentUser;
  @service router;
  @service site;

  @tracked acik = false;
  @tracked soz = null;
  @tracked kucuk = depoOku(KUCUK, false) === true;
  @tracked gizliSon = Number(depoOku(GIZLI, 0)) || 0;

  sira = 0;
  sonBaglam = null;
  zamanlayici = null;

  constructor() {
    super(...arguments);
    this.eslesmeZamani = setTimeout(() => eslesmeBaslat(this.site, this.currentUser), 2500);
  }

  willDestroy() {
    super.willDestroy(...arguments);
    clearTimeout(this.zamanlayici);
    clearTimeout(this.eslesmeZamani);
  }

  get haber() {
    return haberler.liste[0];
  }

  get gizli() {
    return this.gizliSon > Date.now();
  }

  goster(soz) {
    this.soz = soz;
    this.acik = true;
    clearTimeout(this.zamanlayici);
    this.zamanlayici = setTimeout(() => {
      this.acik = false;
    }, 8000);
  }

  baglam() {
    if (document.querySelector(".chorus-mini.is-playing")) {
      return "caliyor";
    }
    const r = this.router.currentRouteName || "";
    const url = this.router.currentURL || "";
    const b = document.body.classList;
    if (r === "full-page-search") {
      return "arama";
    }
    if (r.startsWith("topic")) {
      return "konu";
    }
    if (r.startsWith("user")) {
      return "profil";
    }
    for (const oda of ["dinle", "oku", "oyna", "takil"]) {
      if (b.contains(`chorus-oda-${oda}`)) {
        return oda;
      }
    }
    if (url === "/" || url.startsWith("/?")) {
      return this.currentUser ? "ana" : "ziyaretci";
    }
    return "genel";
  }

  @action
  tikla() {
    if (this.kucuk) {
      // küçükken dokununca önce uyanır
      this.kucuk = false;
      depoYaz(KUCUK, false);
      if (!this.haber) {
        this.sonBaglam = "uyandi";
        this.goster(UYANDI);
        return;
      }
    }
    const h = this.haber;
    if (h) {
      haberGordum(h);
      this.sonBaglam = "haber";
      this.goster({ metin: haberMetni(h), link: h.url, linkMetin: "Beşlisine kulak ver →" });
      return;
    }
    const b = this.baglam();
    const liste = SOZLER[b] || SOZLER.genel;
    this.sira = this.acik && this.sonBaglam === b ? (this.sira + 1) % liste.length : 0;
    this.sonBaglam = b;
    const s = liste[this.sira];
    const sarki = document.querySelector(".chorus-mini__meta strong")?.textContent?.trim();
    let metin = s.metin;
    if (metin.includes("{sarki}")) {
      metin = sarki ? metin.replace("{sarki}", sarki) : "Şşş. Dinliyorum.";
    }
    const link = s.uye && !this.currentUser ? null : s.link || null;
    this.goster({ metin, link, linkMetin: s.linkMetin || "" });
  }

  @action
  kapat() {
    this.acik = false;
    clearTimeout(this.zamanlayici);
  }

  @action
  kucult() {
    this.kapat();
    this.kucuk = true;
    depoYaz(KUCUK, true);
  }

  @action
  gizle() {
    this.kapat();
    this.gizliSon = Date.now() + GUN;
    depoYaz(GIZLI, this.gizliSon);
  }

  get dugmeEtiketi() {
    if (this.kucuk) {
      return "Kepenk küçüldü: dokun, geri gelsin";
    }
    return this.haber ? "Kepenk: sana bir haberi var" : "Kepenk";
  }

  <template>
    {{#unless this.gizli}}
    <div class="kepenk-kose {{if this.acik 'is-konusuyor'}} {{if this.haber 'has-haber'}} {{if this.kucuk 'is-kucuk'}}">
      {{#if this.acik}}
        <div class="kepenk-balon" role="status">
          <button type="button" class="kepenk-balon__kapat" aria-label="Kapat" {{on "click" this.kapat}}>×</button>
          <p>{{this.soz.metin}}</p>
          {{#if this.soz.link}}
            <a href={{this.soz.link}} {{on "click" this.kapat}}>{{this.soz.linkMetin}}</a>
          {{/if}}
          <div class="kepenk-balon__eylem">
            <button type="button" class="kepenk-balon__secenek" {{on "click" this.kucult}}>Küçült</button>
            <button type="button" class="kepenk-balon__secenek" {{on "click" this.gizle}}>Bugünlük gizle</button>
          </div>
        </div>
      {{/if}}
      <button type="button" class="kepenk-kose__dugme" aria-label={{this.dugmeEtiketi}} aria-expanded={{if this.acik "true" "false"}} {{on "click" this.tikla}}>
        <span class="kepenk-kose__nokta" aria-hidden="true"></span>
        <svg class="kepenk-yuz" viewBox="0 0 24 24" aria-hidden="true" focusable="false" xmlns="http://www.w3.org/2000/svg">
          <path class="k-kulaklik" d="M3.4 14.2C3 3.6 21 3.6 20.6 14.2" fill="none" stroke="#E3FF45" stroke-width="1.6" stroke-linecap="round"/>
          <g fill="#F3EEE4" stroke="#F45139" stroke-width="1.9" stroke-linejoin="round">
            <path class="k-kulak k-kulak--sol" d="M4.2 11.4 L5.2 3 L10.9 7.3 Z"/>
            <path class="k-kulak k-kulak--sag" d="M19.8 11.4 L18.8 3 L13.1 7.3 Z"/>
            <ellipse cx="12" cy="13.9" rx="8.7" ry="7.5"/>
          </g>
          <path d="M10.6 7.4v1.5M12 7.1v1.8M13.4 7.4v1.5" stroke="#F45139" stroke-width="1.1" stroke-linecap="round"/>
          <g class="k-uykulu">
            <circle cx="8.4" cy="13.4" r="1.55" fill="#1b1b1a"/>
            <path d="M6 10.6H10.9V13.35L6 12.35Z" fill="#F3EEE4"/>
            <path d="M6.5 12.4L10.3 13.2" stroke="#1b1b1a" stroke-width="1.4" stroke-linecap="round"/>
            <circle cx="15.6" cy="13.3" r="1.55" fill="#1b1b1a"/>
            <path d="M13.1 10.6H18V12.25L13.1 12.75Z" fill="#F3EEE4"/>
            <path d="M13.7 12.7L17.5 12.3" stroke="#1b1b1a" stroke-width="1.4" stroke-linecap="round"/>
          </g>
          <g class="k-acik" fill="#1b1b1a">
            <circle cx="8.4" cy="12.9" r="1.45"/>
            <circle cx="15.6" cy="12.9" r="1.45"/>
          </g>
          <g class="k-kapali" stroke="#1b1b1a" stroke-width="1.4" stroke-linecap="round">
            <path d="M6.8 13.3h3.2"/>
            <path d="M14 13.3h3.2"/>
          </g>
          <g class="k-mutlu" fill="none" stroke="#1b1b1a" stroke-width="1.5" stroke-linecap="round">
            <path d="M6.9 13.7q1.5-1.8 3 0"/>
            <path d="M14.1 13.7q1.5-1.8 3 0"/>
          </g>
          <path d="M10.4 16.9q1.1.9 2.2 0q.8-.3 1.3-.9" stroke="#1b1b1a" stroke-width="1.2" fill="none" stroke-linecap="round"/>
          <g class="k-kulaklik" fill="#E3FF45" stroke="#171716" stroke-width="0.6">
            <rect x="1.4" y="11.4" width="3.6" height="6" rx="1.6"/>
            <rect x="19" y="11.4" width="3.6" height="6" rx="1.6"/>
          </g>
        </svg>
      </button>
    </div>
    {{/unless}}
  </template>
}

class KepenkHaber extends Component {
  @service currentUser;
  @service site;

  constructor() {
    super(...arguments);
    eslesmeBaslat(this.site, this.currentUser);
  }

  get haber() {
    return haberler.liste[0];
  }

  get metin() {
    return this.haber ? haberMetni(this.haber) : "";
  }

  @action
  kapat() {
    if (this.haber) {
      haberGordum(this.haber);
    }
  }

  <template>
    {{#if this.haber}}
      <div class="chorus-vitrin__block kepenk-haber" role="status">
        <svg class="kepenk-haber__yuz" viewBox="0 0 24 24" aria-hidden="true" focusable="false" xmlns="http://www.w3.org/2000/svg">
          <g fill="#F3EEE4" stroke="#F45139" stroke-width="1.9" stroke-linejoin="round">
            <path d="M4.1 11.2 L4.4 1.9 L10.9 6.9 Z"/>
            <path d="M19.9 11.2 L19.6 1.9 L13.1 6.9 Z"/>
            <ellipse cx="12" cy="13.9" rx="8.7" ry="7.5"/>
          </g>
          <path d="M10.6 7.4v1.5M12 7.1v1.8M13.4 7.4v1.5" stroke="#F45139" stroke-width="1.1" stroke-linecap="round"/>
          <circle cx="8.4" cy="12.9" r="1.45" fill="#1b1b1a"/>
          <path d="M14.1 13.3q1.5-1.6 3 0" stroke="#1b1b1a" stroke-width="1.5" fill="none" stroke-linecap="round"/>
          <path d="M10.2 16.4q1.8 1.6 3.6 0" stroke="#1b1b1a" stroke-width="1.2" fill="none" stroke-linecap="round"/>
        </svg>
        <div class="kepenk-haber__metin">
          <span class="kepenk-haber__kim">Kepenk'ten</span>
          <p>{{this.metin}}</p>
          <a href={{this.haber.url}} {{on "click" this.kapat}}>Beşlisine kulak ver →</a>
        </div>
        <button type="button" class="kepenk-haber__kapat" aria-label="Kapat" {{on "click" this.kapat}}>×</button>
      </div>
    {{/if}}
  </template>
}

class AramaBos extends Component {
  @service currentUser;
  @service router;
  @service site;

  get q() {
    return this.router.currentRoute?.queryParams?.q || "";
  }

  get takilUrl() {
    return kategoriUrl(this.site, settings.takil_kategori, "/c/takil/17");
  }

  get dinleUrl() {
    return kategoriUrl(this.site, settings.dinle_kategori, "/c/dinle/14");
  }

  <template>
    <div class="kepenk-arama">
      <svg class="kepenk-arama__yuz" viewBox="0 0 24 24" aria-hidden="true" focusable="false" xmlns="http://www.w3.org/2000/svg">
        <g fill="#F3EEE4" stroke="#F45139" stroke-width="1.9" stroke-linejoin="round">
          <path d="M4.2 11.4 L5.2 3 L10.9 7.3 Z"/>
          <path d="M19.8 11.4 L18.8 3 L13.1 7.3 Z"/>
          <ellipse cx="12" cy="13.9" rx="8.7" ry="7.5"/>
        </g>
        <path d="M10.6 7.4v1.5M12 7.1v1.8M13.4 7.4v1.5" stroke="#F45139" stroke-width="1.1" stroke-linecap="round"/>
        <circle cx="8.4" cy="12.9" r="1.45" fill="#1b1b1a"/>
        <circle cx="15.6" cy="12.9" r="1.45" fill="#1b1b1a"/>
        <path d="M6.9 10.4l2.6.5M17.1 10.1l-2.6.6" stroke="#1b1b1a" stroke-width="1.1" stroke-linecap="round"/>
        <path d="M11 17.2q1-.6 2 0" stroke="#1b1b1a" stroke-width="1.2" fill="none" stroke-linecap="round"/>
      </svg>
      <div class="kepenk-arama__metin">
        <p class="kepenk-arama__baslik">
          {{#if this.q}}“{{this.q}}” için bir şey bulamadım.{{else}}Bir şey bulamadım.{{/if}}
        </p>
        <p class="kepenk-arama__alt">Belki henüz kimse paylaşmadı. Ya da başka türlü yazılıyor: sanatçının adını tek başına dene.</p>
        <div class="kepenk-arama__kapilar">
          <a class="chorus-oda-giris__kapi" href={{this.takilUrl}}>Takıl'da sor</a>
          {{#if this.currentUser}}
            <a class="chorus-oda-giris__kapi" href="/chat/c/kepenk-radyosu/3">Radyoyu aç</a>
          {{/if}}
          <a class="chorus-oda-giris__kapi" href={{this.dinleUrl}}>Listelere göz at</a>
        </div>
      </div>
    </div>
  </template>
}

export default apiInitializer((api) => {
  api.renderInOutlet("below-site-header", KoseKepenk);
  api.renderInOutlet("full-page-search-below-search-info", AramaBos);
  api.renderInOutlet("chorus-vitrin-bugun", KepenkHaber);
});
