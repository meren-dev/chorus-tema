import Component from "@glimmer/component";
import { tracked } from "@glimmer/tracking";
import { fn } from "@ember/helper";
import { on } from "@ember/modifier";
import { action } from "@ember/object";
import { service } from "@ember/service";
import { ajax } from "discourse/lib/ajax";
import { coverFor, itemsFromCooked, listItems, mediaFromUrl } from "../lib/chorus-media";
import { nowPlaying, playQueue } from "../lib/chorus-queue";
import { targetFor } from "../lib/chorus-witness";
import ChorusRadyo from "./chorus-radyo";
import PluginOutlet from "discourse/components/plugin-outlet"; // chorus-odalar

// Chorus · ziyaretçi vitrini
// Giriş yapmamış biri ana sayfaya geldiğinde: üç kapı (önce dinle, kulak misafiri ol, beşlinle gir),
// insanların durduğu saniyeler, haftanın seçkisi, kapıdan son girenlerin beşlileri ve Neresi burası.
// Ekip önizlemesi: ana sayfaya ?vitrin=1 ekle.

const TS = /(^|[^\d:])(\d{1,2}):([0-5]\d)(?![\d:])/;
const ABOUT = /kategorisi hakkında$/i;
const HIDDEN = [3]; // Staff
const SECKI = [12, 10]; // Chorus Seçkileri, sonra Listeler
const BESLILER = 9;
const ORIGIN = "/uploads/default/original/1X/02ba1069fe75518eb48d3425dde28f9a8ce5593f.webp";

const pad = (n) => String(n).padStart(2, "0");

function plain(cooked) {
  const doc = new DOMParser().parseFromString(cooked || "", "text/html");
  doc.querySelectorAll("blockquote, aside, code, pre, ol, ul").forEach((n) => n.remove());
  doc.querySelectorAll("a").forEach((a) => a.replaceWith(" "));
  return (doc.body.textContent || "").replace(/\s+/g, " ").trim();
}

async function displayCover(item) {
  if (item.kind === "youtube" && item.type === "video") {
    return `https://i.ytimg.com/vi/${item.id}/mqdefault.jpg`;
  }
  return (await coverFor(item))?.src || null;
}

export default class ChorusVitrin extends Component {
  @service router;
  @service currentUser;

  @tracked loaded = false;
  @tracked moments = [];
  @tracked secki = null;
  @tracked doors = [];
  @tracked nowUrl = null;

  started = false;

  constructor() {
    super(...arguments);
    this.onQueue = (e) => (this.nowUrl = e.detail?.playing ? e.detail.url : null);
    document.addEventListener("chorus:queue", this.onQueue);
  }

  willDestroy() {
    super.willDestroy(...arguments);
    document.removeEventListener("chorus:queue", this.onQueue);
    document.body.classList.remove("chorus-vitrin-on");
  }

  get home() {
    const url = this.router.currentURL || "";
    return url === "/" || url.startsWith("/?") || url === "/latest";
  }

  get preview() {
    return /[?&]vitrin=1/.test(this.router.currentURL || "");
  }

  // ziyaretçi: tam vitrin; üye: kısa hali (insanların durduğu anlar + kapıdan son girenler)
  get guest() {
    return (this.home && !this.currentUser) || this.preview;
  }

  get member() {
    return this.home && !!this.currentUser && !this.preview;
  }

  get show() {
    const on = this.guest || this.member;
    document.body.classList.toggle("chorus-vitrin-on", on);
    if (on && !this.started) {
      this.started = true;
      this.load();
    }
    return on;
  }

  get greeting() {
    const n = this.currentUser?.name || this.currentUser?.username || "";
    return n ? `Hoş geldin, ${n.split(" ")[0]}.` : "Hoş geldin.";
  }

  get seckiRows() {
    return (this.secki?.items || []).map((it, i) => ({ ...it, i, no: pad(i + 1), isNow: this.nowUrl === it.url }));
  }

  async load() {
    await Promise.allSettled([this.loadMoments(), this.loadSecki(), this.loadDoors()]);
    this.loaded = true;
  }

  // İnsanların durduğu saniyeler: son gönderilerdeki zaman etiketleri
  async loadMoments() {
    const r = await ajax("/posts.json");
    this.moments = (r.latest_posts || [])
      .filter((p) => !HIDDEN.includes(p.category_id))
      .map((p) => {
        const text = plain(p.cooked);
        const m = text.match(TS);
        if (!m) {
          return null;
        }
        const secs = parseInt(m[2], 10) * 60 + parseInt(m[3], 10);
        // etiketin geçtiği cümle, saniyesiyle birlikte
        const sentence = text.split(/(?<=[.!?])\s+/).find((x) => TS.test(x)) || text;
        const note = sentence.replace(/^[\s·:\-]+/, "").slice(0, 140);
        return {
          key: p.id,
          secs,
          time: `${pad(Math.floor(secs / 60))}:${pad(secs % 60)}`,
          note: note.length === 140 ? `${note}…` : note,
          who: p.name || p.username,
          topicId: p.topic_id,
          topic: p.topic_title,
          url: `/t/${p.topic_slug}/${p.topic_id}/${p.post_number}`,
          cooked: p.cooked,
        };
      })
      .filter(Boolean)
      .slice(0, 6);
  }

  async loadSecki() {
    for (const id of SECKI) {
      const r = await ajax(`/c/${id}/l/latest.json`);
      const t = (r.topic_list?.topics || []).find((x) => !ABOUT.test(x.title));
      if (t) {
        const full = await ajax(`/t/${t.id}.json`);
        const cooked = full.post_stream?.posts?.[0]?.cooked || "";
        // şarkı yoksa tüm liste (Spotify/YouTube çalma listesi) tek parça olarak çalar
        const items = listItems(cooked, t.title).slice(0, 8);
        if (items.length) {
          // Kapak: konunun görseli (liste oluşturucuda seçilen tüm liste görseli ya da eklenen görsel);
          // yoksa yalnızca tüm listeden oluşan listede listenin görseli, değilse ilk dört şarkının kolajı
          const img = [...new DOMParser().parseFromString(cooked, "text/html").querySelectorAll("img:not(.emoji):not(.avatar)")].find(
            (i) => !i.closest(".onebox, aside, blockquote")
          );
          let own = t.image_url || img?.getAttribute("src") || null;
          if (!own && items[0].tum) {
            own = (await coverFor(items[0]))?.src || null;
          }
          const covers = own ? [] : (await Promise.all(items.slice(0, 4).map(displayCover))).map((src, i) => ({ src, tone: `chorus-tone-${i % 5}` }));
          this.secki = { title: t.title, url: `/t/${t.slug}/${t.id}`, items, curated: id === 12, by: full.details?.created_by?.name || full.details?.created_by?.username, cover: own || null, covers };
          return;
        }
      }
    }
  }

  // Kapıdan son girenler: son beşliler, her biri dört kapakla
  async loadDoors() {
    const r = await ajax(`/c/${BESLILER}/l/latest.json`);
    const topics = (r.topic_list?.topics || []).filter((x) => !ABOUT.test(x.title)).slice(0, 6);
    const doors = await Promise.all(
      topics.map(async (t) => {
        const full = await ajax(`/t/${t.id}.json`);
        const items = itemsFromCooked(full.post_stream?.posts?.[0]?.cooked, 5);
        const covers = (await Promise.all(items.slice(0, 4).map(displayCover))).map((src, i) => ({ src, tone: `chorus-tone-${i % 5}` }));
        const who = full.details?.created_by;
        return { id: t.id, url: `/t/${t.slug}/${t.id}`, name: who?.name || who?.username || t.title.replace(/\s*·.*$/, ""), items, covers, first: items[0] };
      })
    );
    this.doors = doors.filter((d) => d.items.length);
  }

  @action
  async playMoment(m) {
    const full = await ajax(`/t/${m.topicId}.json`);
    const items = itemsFromCooked(full.post_stream?.posts?.[0]?.cooked);
    const scope = new DOMParser().parseFromString(m.cooked || "", "text/html").body;
    let t = targetFor(scope, null, items);
    if (!t) {
      const first = [...new DOMParser().parseFromString(full.post_stream?.posts?.[0]?.cooked || "", "text/html").querySelectorAll("a[href]")]
        .map((a) => mediaFromUrl(a.getAttribute("href")))
        .find(Boolean);
      t = first ? { items: [{ ...first, title: m.topic, artist: "", note: "" }], index: 0 } : null;
    }
    if (t) {
      playQueue(t.items, t.index, { title: m.topic, url: m.url }, m.secs);
    } else {
      this.router.transitionTo(m.url);
    }
  }

  @action
  playSecki(i) {
    playQueue(this.secki.items, i, { title: this.secki.title, url: this.secki.url });
  }

  @action
  playDoor(d) {
    playQueue(d.items, 0, { title: `${d.name} · beşli`, url: d.url });
  }

  @action
  listen() {
    document.querySelector(".chorus-vitrin__listen")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  @action
  join(kind) {
    try {
      sessionStorage.setItem("chorus-join", kind);
    } catch {
      // önemli değil
    }
    window.location.href = "/signup";
  }

  <template>
    {{#if this.show}}
      <section class="chorus-vitrin {{if this.member 'is-member'}}" aria-label="Chorus'a hoş geldin">
        {{#if this.member}}
          <div class="chorus-vitrin__mhead">
            <p class="chorus-vitrin__kicker">ŞU AN CHORUS'TA</p>
            <h1>{{this.greeting}}</h1>
          </div>
        {{else}}
        <div class="chorus-vitrin__hero">
          <p class="chorus-vitrin__kicker">CHORUS · BY COMMON HOURS</p>
          <h1>Şarkılar insanlara ne yapar?</h1>
          <p class="chorus-vitrin__lead">Burada insanlar bir şarkıyı dinleyip geçmiyor. Neresinde durduklarını, kimi hatırladıklarını, hangi filme bağladıklarını yazıyorlar. Önce dinle. İstersen kal.</p>
          <div class="chorus-vitrin__doors">
            <button type="button" class="chorus-vitrin__door" {{on "click" this.listen}}>
              <span class="chorus-vitrin__no">01</span>
              <strong>Önce dinle</strong>
              <em>Hesap gerekmez. İnsanların durduğu saniyelere dokun, şarkı tam oradan çalsın.</em>
            </button>
            <button type="button" class="chorus-vitrin__door" {{on "click" (fn this.join "kulak")}}>
              <span class="chorus-vitrin__no">02</span>
              <strong>Kulak misafiri ol</strong>
              <em>Yazmak zorunda değilsin. Dinlediğini bilelim yeter.</em>
            </button>
            <button type="button" class="chorus-vitrin__door is-main" {{on "click" (fn this.join "besli")}}>
              <span class="chorus-vitrin__no">03</span>
              <strong>Beş şarkıyla gir</strong>
              <em>Seni anlatan beş şarkıyı seç. Altıncıyı biz öneririz.</em>
            </button>
          </div>
        </div>
        {{/if}}

        <ChorusRadyo />

    {{! chorus-odalar: Bugün bloğu (Chorus · Odalar bileşeni doldurur) }}
    {{#if this.member}}
      <PluginOutlet @name="chorus-vitrin-bugun" />
    {{/if}}

    {{#if this.moments.length}}
          <div class="chorus-vitrin__block chorus-vitrin__listen">
            <h2>İnsanların durduğu saniyeler</h2>
            <p class="chorus-vitrin__sub">Birine dokun, şarkı o saniyeden çalsın.</p>
            <div class="chorus-vitrin__moments">
              {{#each this.moments key="key" as |m|}}
                <button type="button" class="chorus-vitrin__moment" {{on "click" (fn this.playMoment m)}}>
                  <span class="chorus-ts">{{m.time}}</span>
                  <em>“{{m.note}}”</em>
                  <span class="chorus-vitrin__who">{{m.who}} · {{m.topic}}</span>
                </button>
              {{/each}}
            </div>
          </div>
        {{/if}}

        {{#if this.secki}}
          <div class="chorus-vitrin__block {{unless this.moments.length 'chorus-vitrin__listen'}}">
            <h2>{{if this.secki.curated "Haftanın seçkisi" "Bir liste"}}</h2>
            <p class="chorus-vitrin__sub"><a href={{this.secki.url}}>{{this.secki.title}}</a> · {{this.secki.by}}</p>
            <div class="chorus-vitrin__secki-wrap">
            <button type="button" class="chorus-vitrin__secki-kapak {{if this.secki.cover 'is-own' 'chorus-vitrin__collage'}}" aria-label="{{this.secki.title}} seçkisini çal" {{on "click" (fn this.playSecki 0)}}>
              {{#if this.secki.cover}}
                <img src={{this.secki.cover}} alt="" loading="lazy">
              {{else}}
                {{#each this.secki.covers as |c|}}
                  {{#if c.src}}<img src={{c.src}} alt="" loading="lazy">{{else}}<span class="chorus-profile__art {{c.tone}}"></span>{{/if}}
                {{/each}}
              {{/if}}
              <span class="chorus-vitrin__play">▶</span>
            </button>
            <ol class="chorus-vitrin__secki">
              {{#each this.seckiRows as |t|}}
                <li class={{if t.isNow "is-now"}}>
                  <button type="button" class="chorus-play-row" aria-label="Bu şarkıdan çal" {{on "click" (fn this.playSecki t.i)}}>{{if t.isNow "❚❚" "▶"}}</button>
                  <span class="chorus-vitrin__no">{{t.no}}</span>
                  <span class="chorus-vitrin__track"><strong>{{t.title}}</strong> <span>{{t.artist}}</span>
                    {{#if t.note}}<em>{{t.note}}</em>{{/if}}</span>
                </li>
              {{/each}}
            </ol>
            </div>
          </div>
        {{/if}}

        {{#if this.doors.length}}
          <div class="chorus-vitrin__block">
            <h2>Kapıdan son girenler</h2>
            <p class="chorus-vitrin__sub">{{if this.member "Yeni gelenler. Birinin beş şarkısını dinle, altıncıyı sen öner." "Herkes buraya beş şarkıyla giriyor. Birinin beşlisini dinle."}}</p>
            <div class="chorus-vitrin__wall">
              {{#each this.doors key="id" as |d|}}
                <div class="chorus-vitrin__card">
                  <button type="button" class="chorus-vitrin__collage" aria-label="{{d.name}} beşlisini çal" {{on "click" (fn this.playDoor d)}}>
                    {{#each d.covers as |c|}}
                      {{#if c.src}}<img src={{c.src}} alt="" loading="lazy">{{else}}<span class="chorus-profile__art {{c.tone}}"></span>{{/if}}
                    {{/each}}
                    <span class="chorus-vitrin__play">▶</span>
                  </button>
                  <a href={{d.url}}><strong>{{d.name}}</strong></a>
                  <span class="chorus-vitrin__who">{{d.first.artist}} · {{d.first.title}} ve 4 şarkı daha</span>
                </div>
              {{/each}}
            </div>
          </div>
        {{/if}}

        {{! chorus-odalar: Takıl'da konuşulanlar (Chorus · Odalar bileşeni doldurur) }}
        {{#if this.member}}
          <PluginOutlet @name="chorus-vitrin-takil" />
        {{/if}}

        {{#if this.guest}}
        <a class="chorus-vitrin__origin" href="/neresi-burasi">
          <img src={{ORIGIN}} alt="" loading="lazy">
          <span>
            <span class="chorus-vitrin__kicker">BU YER NASIL BAŞLADI?</span>
            <strong>Bir kedi, bir kepenk ve yanlış cihazda çalan bir Blur şarkısı.</strong>
            <em>Neresi burası? →</em>
          </span>
        </a>

        <div class="chorus-vitrin__end">
          <p>Burası sessizce dinleyenlere de açık.</p>
          <button type="button" class="btn" {{on "click" (fn this.join "kulak")}}>Kulak misafiri ol</button>
          <button type="button" class="btn btn-primary" {{on "click" (fn this.join "besli")}}>Beş şarkıyla gir</button>
        </div>
        {{/if}}
      </section>
    {{/if}}
  </template>
}
