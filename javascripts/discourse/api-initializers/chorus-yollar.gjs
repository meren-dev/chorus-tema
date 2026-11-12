import Component from "@glimmer/component";
import { tracked } from "@glimmer/tracking";
import { fn } from "@ember/helper";
import { on } from "@ember/modifier";
import { action } from "@ember/object";
import { service } from "@ember/service";
import { ajax } from "discourse/lib/ajax";
import { apiInitializer } from "discourse/lib/api";
import DiscourseURL from "discourse/lib/url";
import I18n from "discourse-i18n";
import { BESLILER, findBesli, openBesliComposer } from "../lib/chorus-besli";
import { CHORUS_SECKILERI, LISTELER } from "../lib/chorus-list-builder";
import { listeKapagi } from "../lib/chorus-liste-kapak";
import { coverFor, listItems, mediaFromUrl } from "../lib/chorus-media";
import { el, oku, yaz } from "../lib/chorus-oyun";
import { nowPlaying, playQueue } from "../lib/chorus-queue";
import { ARCHIVE_TOPIC, CHANNEL_PATH, CHANNEL_URL, isRadioEvent } from "../lib/chorus-radyo";
import { kuyrukAyarla, kuyrukKonusu, kuyrukSusle, openRadyoForm, radyoyaEkleDugmesi } from "../lib/chorus-radyo-kuyruk";
import { openRehber, rehberAdresi, rehberAyarla } from "../lib/chorus-rehber";
import { eserBagla } from "../lib/chorus-witness";
import { openYazPicker } from "../lib/chorus-yaz";

// Chorus · Yollar
// Siteyi kullanmayı kolaylaştıran ortak katman: üç yolu (Önce dinle · Kulak misafiri ol ·
// Beş şarkıyla gir) kayıttan sonra da sürdüren parçalar.
// 1 · Header'da "+ Yaz": Ne yapmak istiyorsun? (lib/chorus-yaz.js)
// 2 · Cevapla: gönderilerde belirgin Cevapla; konunun sonunda konunun kendi sorusuyla bir cevap kutusu;
//     "+ Eser bağla" Cevapla'nın yanında (eski sarı kutunun yerine)
// 3 · İlk hafta: ana sayfada yeni gelenin dört adımı, gerçek hareketten işaretlenir
// 4 · Sıradaki adım: paylaşımdan sonra tek bir öneri (bildirim)
// 5 · Raf: Dinle, Listeler ve Seçkiler kapaklı raf olarak
// 6 · Liste kapağı gönderinin başında (lib/chorus-liste-kapak.js)
// 7 · Kepenk Radyosu kuyruğu: form, kuyrukta Hazır/Taslağa çek, sitedeki şarkılarda "Radyoya ekle" (ekip)
// 8 · Nereye ne?: menüde Chorus bölümü (rehber + Öneri Kutusu); /#nereye-ne rehberi açar

const KOR_DINLEME = 11;
const OYUN = [11, 19, 20]; // Kör Dinleme, Günün Sorusu, Dört Dörtlük: kendi oyun akışları var
const NOT_DEFTERI = 35;
const ESER_KATEGORILERI = [6, LISTELER, CHORUS_SECKILERI];
const RAF = [14, LISTELER, CHORUS_SECKILERI];
const ABOUT = /(kategorisi hakkında|^About the .+ category)$/i;
const ILK_HAFTA = "chorus-ilk-hafta";
const RADYO_DINLEDI = "chorus-radyo-dinledi";

const SORULAR = {
  [LISTELER]: "Sen bu listeye ne eklerdin?",
  [CHORUS_SECKILERI]: "Sen bu seçkiye ne eklerdin?",
  [BESLILER]: "Altıncı şarkı ne olsun?",
  6: "Sen de dinledin mi? Ne duydun?",
  7: "Fikrini söyle…",
  8: "Nazik ve dürüst bir geri bildirim bırak…",
  18: "Okudun mu? Kendi notunu bırak…",
};

function kat(site, id) {
  return (site?.categories || []).find((c) => c.id === id) || null;
}

function etiketli(topic, ad) {
  return (topic?.tags || []).some((t) => (t?.name || t) === ad);
}

// ── 1 · + Yaz ────────────────────────────────────────────────────────────
class YazDugmesi extends Component {
  @service currentUser;
  @service composer;
  @service site;

  @action
  ac() {
    openYazPicker({ composer: this.composer, site: this.site, user: this.currentUser, gununSorusu: settings.gunun_sorusu });
  }

  <template>
    {{#if this.currentUser}}
      <li class="chorus-yaz-li">
        <button type="button" class="btn btn-primary chorus-yaz" aria-label="Yaz: ne yapmak istiyorsun?" {{on "click" this.ac}}>
          <span class="chorus-yaz__arti" aria-hidden="true">+</span><span class="chorus-yaz__ad">Yaz</span>
        </button>
      </li>
    {{/if}}
  </template>
}

// ── 2 · Cevapla ──────────────────────────────────────────────────────────
class EserDugmesi extends Component {
  static shouldRender(args) {
    return !!args?.state?.canCreatePost;
  }

  @service composer;

  @action
  ac() {
    eserBagla(this.args.post?.topic, this.composer);
  }

  <template>
    <button type="button" class="btn btn-flat chorus-eser-dugme" title="Bu konuyu bir şarkıya, filme ya da kitaba bağla" {{on "click" this.ac}}>+ Eser bağla</button>
  </template>
}

class CevapKutusu extends Component {
  @service currentUser;
  @service composer;

  get topic() {
    return this.args.outletArgs?.model;
  }

  get kuyruk() {
    return this.topic?.id === kuyrukKonusu();
  }

  get goster() {
    const t = this.topic;
    if (!this.currentUser || !t || t.archetype === "private_message" || t.closed || t.archived) {
      return false;
    }
    if (this.kuyruk) {
      return !!this.currentUser.staff;
    }
    if (OYUN.includes(t.category_id) || t.id === ARCHIVE_TOPIC || t.id === NOT_DEFTERI) {
      return false;
    }
    return !!t.details?.can_create_post;
  }

  get soru() {
    const t = this.topic;
    if (etiketli(t, "ortak-liste")) {
      return "Bu listeye bir şarkı ekle ya da bir şey söyle…";
    }
    return SORULAR[t?.category_id] || "Sen de yaz…";
  }

  get eserVar() {
    return ESER_KATEGORILERI.includes(this.topic?.category_id);
  }

  get avatar() {
    const tpl = this.currentUser?.avatar_template;
    return tpl ? tpl.replace("{size}", "64") : null;
  }

  @action
  cevapla() {
    const t = this.topic;
    this.composer.open({ action: "reply", topic: t, draftKey: t.draft_key, draftSequence: t.draft_sequence });
  }

  @action
  eser() {
    eserBagla(this.topic, this.composer);
  }

  @action
  radyo() {
    openRadyoForm();
  }

  <template>
    {{#if this.goster}}
      {{#if this.kuyruk}}
        <div class="chorus-cevap-kutusu is-kuyruk">
          <p class="chorus-cevap-kutusu__not">Kuyruğa yeni şarkı: biçimi form yazar.</p>
          <div class="chorus-cevap-kutusu__eylem">
            <button type="button" class="btn btn-primary chorus-cevap-kutusu__git" {{on "click" this.radyo}}>+ Radyoya şarkı ekle</button>
          </div>
        </div>
      {{else}}
        <div class="chorus-cevap-kutusu">
          {{#if this.avatar}}
            <img class="chorus-cevap-kutusu__avatar" src={{this.avatar}} alt="" width="32" height="32" />
          {{/if}}
          <button type="button" class="chorus-cevap-kutusu__alan" {{on "click" this.cevapla}}>{{this.soru}}</button>
          <div class="chorus-cevap-kutusu__eylem">
            {{#if this.eserVar}}
              <button type="button" class="btn btn-flat chorus-cevap-kutusu__eser" {{on "click" this.eser}}>+ Eser bağla</button>
            {{/if}}
            <button type="button" class="btn btn-primary chorus-cevap-kutusu__git" {{on "click" this.cevapla}}>Cevapla</button>
          </div>
        </div>
      {{/if}}
    {{/if}}
  </template>
}

// ── 3 · İlk hafta ────────────────────────────────────────────────────────
async function sonKonu(id, haric) {
  const r = await ajax(`/c/${id}/l/latest.json`, { data: { order: "created" } });
  return (r.topic_list?.topics || []).find((t) => !ABOUT.test(t.title || "") && !t.pinned && (!haric || !haric(t))) || null;
}

class IlkHafta extends Component {
  @service currentUser;
  @service composer;
  @service site;

  @tracked adimlar = null;
  @tracked kapali = false;
  @tracked bittiSimdi = false;

  constructor() {
    super(...arguments);
    const d = oku(ILK_HAFTA, {}) || {};
    this.kapali = !!(d.gizli || d.bitti);
    if (!this.kapali && this.currentUser) {
      this.yukle();
    }
  }

  async yukle() {
    const u = this.currentUser;
    try {
      const besli = await findBesli(u.username).catch(() => null);
      const [cevaplar, sonBesli, sonKor] = await Promise.all([
        ajax("/user_actions.json", { data: { username: u.username, filter: 5, offset: 0 } })
          .then((r) => r.user_actions || [])
          .catch(() => []),
        sonKonu(BESLILER, (t) => t.id === besli?.id).catch(() => null),
        sonKonu(KOR_DINLEME).catch(() => null),
      ]);
      const radyo = !!oku(RADYO_DINLEDI, false);
      const altinci = cevaplar.some((a) => a.category_id === BESLILER && a.topic_id !== besli?.id);
      const kor = cevaplar.some((a) => a.category_id === KOR_DINLEME);
      const adimlar = [
        { key: "radyo", ad: "Radyoyu bir kez aç", alt: "Günde üç şarkı; 19:00'daki günün şarkısı.", tamam: radyo, url: CHANNEL_URL },
        {
          key: "besli",
          ad: "Beşlini kur",
          alt: "Seni anlatan beş şarkı, her birine tek cümle.",
          tamam: !!besli,
          url: besli ? `/t/${besli.slug}/${besli.id}` : null,
          kur: !besli,
        },
        {
          key: "altinci",
          ad: "Birine altıncı şarkıyı öner",
          alt: "Kapıdan yeni girenin beşlisine bir şarkı ekle.",
          tamam: altinci,
          url: sonBesli ? `/t/${sonBesli.slug}/${sonBesli.id}` : kat(this.site, BESLILER)?.url || "/",
        },
        {
          key: "kor",
          ad: "Kör Dinleme'ye tek kelime yaz",
          alt: "Adı gizli bir şarkı; dinle, bir kelime bırak.",
          tamam: kor,
          url: sonKor ? `/t/${sonKor.slug}/${sonKor.id}` : kat(this.site, KOR_DINLEME)?.url || "/",
        },
      ];
      if (adimlar.every((a) => a.tamam)) {
        yaz(ILK_HAFTA, { bitti: true });
        this.bittiSimdi = true;
      }
      this.adimlar = adimlar;
    } catch {
      this.adimlar = null;
    }
  }

  get tamamSayisi() {
    return (this.adimlar || []).filter((a) => a.tamam).length;
  }

  get toplam() {
    return (this.adimlar || []).length;
  }

  @action
  gizle() {
    yaz(ILK_HAFTA, { gizli: true });
    this.kapali = true;
  }

  @action
  besliKur(e) {
    e?.preventDefault?.();
    openBesliComposer(this.composer, this.site, this.currentUser);
  }

  <template>
    {{#unless this.kapali}}
      {{#if this.adimlar}}
        <div class="chorus-vitrin__block chorus-ilk-hafta">
          <div class="chorus-ilk-hafta__bas">
            <p class="chorus-vitrin__kicker">İLK HAFTAN · {{this.tamamSayisi}}/{{this.toplam}}</p>
            <button type="button" class="chorus-ilk-hafta__gizle" {{on "click" this.gizle}}>Gizle</button>
          </div>
          {{#if this.bittiSimdi}}
            <h2>Tamam, artık buralısın.</h2>
            <p class="chorus-vitrin__sub">Dört adım da bitti. Bu kutu bir daha çıkmaz; Kepenk seni tanıdı.</p>
          {{else}}
            <h2>Dört adımda Chorus</h2>
          {{/if}}
          <ol class="chorus-ilk-hafta__liste">
            {{#each this.adimlar key="key" as |adim|}}
              <li class="chorus-ilk-hafta__adim {{if adim.tamam 'is-tamam'}}">
                <span class="chorus-ilk-hafta__isaret" aria-hidden="true">{{if adim.tamam "✓" ""}}</span>
                <span class="chorus-ilk-hafta__metin">
                  {{#if adim.tamam}}
                    <strong>{{adim.ad}}</strong>
                  {{else if adim.kur}}
                    <a href="#" {{on "click" this.besliKur}}><strong>{{adim.ad}} →</strong></a>
                  {{else}}
                    <a href={{adim.url}}><strong>{{adim.ad}} →</strong></a>
                  {{/if}}
                  <span>{{adim.alt}}</span>
                </span>
              </li>
            {{/each}}
          </ol>
        </div>
      {{/if}}
    {{/unless}}
  </template>
}

// ── 5 · Raf: Dinle, Listeler ve Seçkiler kapaklı raf ──────────────────────
async function kolajKapaklari(items) {
  const kapak = async (it) => (it.kind === "youtube" && it.type === "video" ? `https://i.ytimg.com/vi/${it.id}/mqdefault.jpg` : (await coverFor(it))?.src || null);
  return (await Promise.all(items.slice(0, 4).map(kapak))).map((src, i) => ({ src, tone: `chorus-tone-${i % 5}` }));
}

class ListeRafi extends Component {
  @service router;
  @service site;

  @tracked kartlar = null;
  yuklenen = null;
  ilkler = new Map(); // konu → ilk gönderinin cooked'u

  get catId() {
    return this.router.currentRoute?.attributes?.category?.id || null;
  }

  get acik() {
    const id = this.catId;
    const on = RAF.includes(id) && (this.router.currentRouteName || "").startsWith("discovery.");
    document.body.classList.toggle("chorus-raf-on", !!on);
    if (on && this.yuklenen !== id) {
      this.yuklenen = id;
      this.yukle(id);
    }
    return on;
  }

  willDestroy() {
    super.willDestroy(...arguments);
    document.body.classList.remove("chorus-raf-on");
  }

  // Glimmer'da boş dizi "yok" sayılır; boş raf ayrıca sorulur
  get bos() {
    return Array.isArray(this.kartlar) && this.kartlar.length === 0;
  }

  async yukle(id) {
    let kartlar = [];
    try {
      const kaynaklar = id === 14 ? [CHORUS_SECKILERI, LISTELER] : [id];
      const sonuc = await Promise.all(kaynaklar.map((k) => ajax(`/c/${k}/l/latest.json`, { data: { order: "created" } }).catch(() => null)));
      sonuc.forEach((r, i) => {
        const kisiler = new Map((r?.users || []).map((u) => [u.id, u.name || u.username]));
        (r?.topic_list?.topics || [])
          .filter((t) => !ABOUT.test(t.title || "") && t.id !== ARCHIVE_TOPIC && t.category_id === kaynaklar[i])
          .forEach((t) => {
            kartlar.push({
              id: t.id,
              baslik: t.title,
              url: `/t/${t.slug}/${t.id}`,
              kapak: t.image_url || null,
              kolaj: null,
              secki: t.category_id === CHORUS_SECKILERI,
              ortak: etiketli(t, "ortak-liste"),
              kim: kisiler.get(t.posters?.[0]?.user_id) || "",
              cevap: Math.max(0, (t.posts_count || 1) - 1),
            });
          });
      });
    } catch {
      kartlar = [];
    }
    if (this.yuklenen !== id) {
      return;
    }
    this.kartlar = kartlar;
    // görseli olmayan listeler: ilk dört şarkının kapağından kolaj
    const eksik = kartlar.filter((k) => !k.kapak).slice(0, 12);
    if (!eksik.length) {
      return;
    }
    await Promise.all(
      eksik.map(async (k) => {
        try {
          const cooked = await this.ilkGonderi(k.id);
          const items = listItems(cooked, k.baslik);
          const kapaklar = await kolajKapaklari(items);
          // dörtten az şarkı: kolaj boş kare bırakmasın, ilk kapak tek başına dursun
          if (items.length >= 4) {
            k.kolaj = kapaklar;
          } else {
            k.kapak = kapaklar[0]?.src || null;
          }
        } catch {
          k.kolaj = [];
        }
      })
    );
    if (this.yuklenen === id) {
      // yeni nesneler: kolajlar şablona yeniden çizilsin
      this.kartlar = kartlar.map((k) => ({ ...k }));
    }
  }

  async ilkGonderi(topicId) {
    if (!this.ilkler.has(topicId)) {
      this.ilkler.set(
        topicId,
        ajax(`/t/${topicId}.json`).then((t) => t?.post_stream?.posts?.[0]?.cooked || "")
      );
    }
    return this.ilkler.get(topicId);
  }

  @action
  async cal(k) {
    try {
      const items = listItems(await this.ilkGonderi(k.id), k.baslik);
      if (items.length) {
        playQueue(items, 0, { title: k.baslik, url: k.url });
        return;
      }
    } catch {
      // çalınamıyorsa konuya git
    }
    DiscourseURL.routeTo(k.url);
  }

  <template>
    {{#if this.acik}}
      <section class="chorus-raf" aria-label="Listeler rafı">
        {{#if this.kartlar.length}}
          <div class="chorus-raf__izgara">
            {{#each this.kartlar key="id" as |k|}}
              <article class="chorus-raf__kart {{if k.secki 'is-secki'}}">
                <div class="chorus-raf__kapak {{unless k.kapak 'chorus-vitrin__collage'}}">
                  {{#if k.kapak}}
                    <img src={{k.kapak}} alt="" loading="lazy" />
                  {{else}}
                    {{#each k.kolaj as |c|}}
                      {{#if c.src}}<img src={{c.src}} alt="" loading="lazy" />{{else}}<span class="chorus-profile__art {{c.tone}}"></span>{{/if}}
                    {{/each}}
                  {{/if}}
                  <button type="button" class="chorus-vitrin__play" aria-label="{{k.baslik}} listesini çal" {{on "click" (fn this.cal k)}}>▶</button>
                </div>
                <a class="chorus-raf__baslik" href={{k.url}}>{{k.baslik}}</a>
                <span class="chorus-raf__meta">{{#if k.secki}}SEÇKİ · {{/if}}{{#if k.ortak}}ORTAK · {{/if}}{{k.kim}}{{#if k.cevap}} · {{k.cevap}} cevap{{/if}}</span>
              </article>
            {{/each}}
          </div>
        {{else if this.bos}}
          <p class="chorus-raf__bos">Raf boş. İlk listeyi sen kur: sağ üstteki + Liste yap.</p>
        {{/if}}
      </section>
    {{/if}}
  </template>
}

// ── 7 · Radyoya ekle kısayolları (ekip) ──────────────────────────────────
function satirParcasi(li) {
  const c = li.cloneNode(true);
  c.querySelectorAll("button, .chorus-row-moments, ol, ul, .chorus-ortak__kim").forEach((n) => n.remove());
  const parts = (c.textContent || "")
    .split("·")
    .map((x) => x.replace(/\s+/g, " ").trim())
    .filter(Boolean);
  return { artist: parts.length > 1 ? parts[0] : "", title: parts.length > 1 ? parts[1] : parts[0] || "" };
}

function radyoKisayollari(elem) {
  if (!elem?.isConnected) {
    return;
  }
  // liste satırları (Listeyi çal'ın şarkıları)
  elem.querySelectorAll("li[data-chorus-url]").forEach((li) => {
    if (li.querySelector(":scope > .chorus-radyoya")) {
      return;
    }
    const media = mediaFromUrl(li.dataset.chorusUrl);
    if (!media || !["track", "video"].includes(media.type)) {
      return;
    }
    li.appendChild(radyoyaEkleDugmesi({ ...media, ...satirParcasi(li) }, "is-satir"));
  });
  // tek başına duran şarkı oynatıcıları (Spotify şarkısı, YouTube videosu)
  elem.querySelectorAll(".chorus-spotify iframe[src], .lazy-video-container[data-video-id]").forEach((n) => {
    const kutu = n.closest(".chorus-spotify") || n;
    if (kutu.closest(".chorus-kor, li") || kutu.nextElementSibling?.classList?.contains("chorus-radyoya")) {
      return;
    }
    const media = n.dataset.videoId ? mediaFromUrl(`https://www.youtube.com/watch?v=${n.dataset.videoId}`) : mediaFromUrl(n.getAttribute("src"));
    if (!media || !["track", "video"].includes(media.type)) {
      return;
    }
    kutu.after(radyoyaEkleDugmesi({ ...media, artist: "", title: n.dataset.videoTitle || "" }, "is-oynatici"));
  });
}

function miniKisayol() {
  const ust = document.querySelector(".chorus-mini .chorus-mini__top");
  if (!ust || ust.querySelector(".chorus-radyoya")) {
    return;
  }
  const b = el("button", "chorus-radyoya is-mini", "Radyoya ekle");
  b.type = "button";
  b.title = "Çalan şarkıyı Kepenk Radyosu'nun kuyruğuna ekle";
  b.addEventListener("click", () => {
    const { item } = nowPlaying();
    openRadyoForm({ on: item && ["track", "video"].includes(item.type) ? item : {} });
  });
  ust.appendChild(b);
}

// "Yanıtla" yerine "Cevapla": Chorus'un dili cevap (Cevapla →, İlk cevabı sen yaz…)
function cevaplaDe() {
  try {
    Object.values(I18n.translations || {}).forEach((dil) => {
      const r = dil?.js?.topic?.reply;
      if (r && typeof r === "object" && "title" in r) {
        r.title = "Cevapla";
      }
    });
  } catch {
    // çeviri yapısı değişmişse Discourse'un kendi etiketi kalır
  }
}

export default apiInitializer((api) => {
  const user = api.getCurrentUser();
  const site = api.container.lookup("service:site");
  const toasts = api.container.lookup("service:toasts");
  kuyrukAyarla({ konu: settings.radyo_kuyrugu, toasts });
  rehberAyarla({ konu: settings.rehber_konusu });
  cevaplaDe();

  // 1 · + Yaz
  api.headerIcons.add("chorus-yaz", YazDugmesi, { before: "search", after: "chorus-takil" });

  // 2 · Cevapla: etiket telefonda da görünür; ilk gönderide "+ Eser bağla" Cevapla'nın yanında
  api.registerValueTransformer("post-menu-buttons", ({ value: dag, context }) => {
    const { post, buttonKeys, buttonLabels } = context || {};
    if (buttonKeys?.REPLY) {
      buttonLabels?.show?.(buttonKeys.REPLY);
      if (user && post?.post_number === 1 && ESER_KATEGORILERI.includes(post?.topic?.category_id)) {
        dag.add("chorus-eser", EserDugmesi, { before: buttonKeys.REPLY });
      }
    }
  });
  api.renderInOutlet("topic-above-footer-buttons", CevapKutusu);

  // 3 · İlk hafta (ana sayfa, üye)
  api.renderInOutlet("chorus-vitrin-ilk", IlkHafta);
  document.addEventListener("chorus:queue", (e) => {
    if (isRadioEvent(e.detail)) {
      yaz(RADYO_DINLEDI, true);
    }
    if (user?.staff && e.detail?.url) {
      miniKisayol();
    }
  });

  // 4 · Sıradaki adım: paylaşımdan sonra tek bir öneri
  const git = (url) => () => DiscourseURL.routeTo(url);
  const sonraki = (message, label, run) =>
    toasts?.success?.({
      duration: 9000,
      data: { message, actions: [{ label, class: "btn-primary btn-small", action: ({ close }) => (close?.(), run()) }] },
    });
  const listeYap = () => api.container.lookup("service:composer").openNewTopic({ category: kat(site, LISTELER) });
  api.onAppEvent("topic:created", (createdPost, composerModel) => {
    const c = Number(composerModel?.categoryId ?? createdPost?.category);
    const yer = (id) => kat(site, id)?.url || "/";
    if (c === BESLILER) {
      sonraki("Beşlin hazır. Şimdi kapıdan girenlerden birine altıncı şarkıyı öner.", "Beşlilere git →", git(yer(BESLILER)));
    } else if (c === LISTELER || c === CHORUS_SECKILERI) {
      sonraki("Listen rafta. Birinin listesine de bir şarkı ekle.", "Rafa git →", git(yer(LISTELER)));
    } else if (c === 6) {
      sonraki("Paylaştın. Başkaları bu aralar ne dinliyor?", "Şimdi Çalıyor →", git(yer(6)));
    } else if (c === 7) {
      sonraki("Masa açıldı; cevap gelince haberin olur. Sen de başka bir masaya otur.", "Açık Masalar →", git(yer(7)));
    } else if (c === 8) {
      sonraki("Paylaştın. Sen de birinin işine kulak ver.", "Yapım Aşamasında →", git(yer(8)));
    }
  });
  api.onAppEvent("post:created", (createdPost) => {
    const topic = api.container.lookup("controller:topic")?.model;
    if (!user || !topic || createdPost?.topic_id !== topic.id) {
      return;
    }
    const c = topic.category_id;
    if (c === BESLILER && topic.details?.created_by?.id !== user.id) {
      sonraki("Altıncın gitti. Sıra kendi listende.", "Liste yap", listeYap);
    } else if (c === KOR_DINLEME) {
      sonraki("Adı açıldı. Beğendiysen bir listeye koy.", "Liste yap", listeYap);
    } else if ((c === LISTELER || c === CHORUS_SECKILERI) && topic.details?.created_by?.id !== user.id) {
      sonraki("Eklendi. Rafta başka listeler de var.", "Rafa git →", git(kat(site, LISTELER)?.url || "/"));
    }
  });

  // 5 · Raf
  api.renderInOutlet("discovery-list-container-top", ListeRafi);

  // 6 ve 7 · gönderi süsleri
  api.decorateCookedElement(
    (elem, helper) => {
      const post = helper?.getModel?.();
      if (!post) {
        return;
      }
      const topic = post.topic;
      if (post.post_number === 1 && [LISTELER, CHORUS_SECKILERI].includes(topic?.category_id)) {
        listeKapagi(elem, { title: topic.title, url: `/t/${topic.slug}/${topic.id}`, cooked: post.cooked });
      }
      if (user?.staff) {
        kuyrukSusle(elem, post);
        if (post.topic_id !== kuyrukKonusu()) {
          requestAnimationFrame(() => radyoKisayollari(elem));
        }
      }
    },
    { id: "chorus-yollar" }
  );

  // 8 · Nereye ne? ve Öneri Kutusu menüde
  api.addSidebarSection((BaseCustomSidebarSection, BaseCustomSidebarSectionLink) => {
    const baglanti = (name, href, text, icon) =>
      new (class extends BaseCustomSidebarSectionLink {
        get name() {
          return name;
        }
        get href() {
          return href;
        }
        get title() {
          return text;
        }
        get text() {
          return text;
        }
        get prefixType() {
          return "icon";
        }
        get prefixValue() {
          return icon;
        }
      })();
    return class extends BaseCustomSidebarSection {
      get name() {
        return "chorus-yol";
      }
      get title() {
        return "Chorus";
      }
      get text() {
        return "Chorus";
      }
      get links() {
        return [
          baglanti("nereye-ne", rehberAdresi() || kat(site, 5)?.url || "/", "Nereye ne?", "compass"),
          baglanti("oneri-kutusu", kat(site, 2)?.url || "/", "Öneri Kutusu", "lightbulb"),
        ];
      }
    };
  });

  api.onPageChange((url) => {
    if (String(url || "").startsWith(CHANNEL_PATH)) {
      yaz(RADYO_DINLEDI, true);
    }
    if (window.location.hash === "#nereye-ne") {
      window.history.replaceState(null, "", window.location.pathname + window.location.search);
      openRehber();
    }
  });
});
