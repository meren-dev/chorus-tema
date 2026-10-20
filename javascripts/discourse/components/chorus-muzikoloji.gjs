import Component from "@glimmer/component";
import { tracked } from "@glimmer/tracking";
import { service } from "@ember/service";
import { ajax } from "discourse/lib/ajax";

// Chorus · Common Hours'tan müzikoloji yazıları
// commonhours.club'da "müzikoloji" etiketli yazılar RSS ile Oku › Müzikoloji'ye konu olarak düşer
// (Yönetim › Eklentiler › RSS Polling). Bu bileşen onları kart kart gösterir:
// başlık Common Hours'tan, kısa özet, Common Hours'a bağlantı ve Chorus'taki konuşma. Vurgu: Riot pembe.

const MUZIKOLOJI = 18;
const OKU = 15;
const KAYNAK = /commonhours\.club/;

function ozet(cooked) {
  const d = new DOMParser().parseFromString(cooked || "", "text/html");
  d.querySelectorAll("small, hr, aside, img, figure, .onebox").forEach((n) => n.remove());
  const metin = [...d.querySelectorAll("p")]
    .map((p) => p.textContent.replace(/\s+/g, " ").trim())
    .filter((t) => t.length > 40)
    .join(" ");
  return metin.length > 220 ? `${metin.slice(0, 220).replace(/\s+\S*$/, "")}…` : metin;
}

function orijinal(cooked) {
  const d = new DOMParser().parseFromString(cooked || "", "text/html");
  const linkler = [...d.querySelectorAll("a[href]")].map((a) => a.getAttribute("href")).filter((h) => KAYNAK.test(h || ""));
  return linkler[linkler.length - 1] || null;
}

function kapak(cooked) {
  const d = new DOMParser().parseFromString(cooked || "", "text/html");
  return d.querySelector("img:not(.emoji):not(.avatar)")?.getAttribute("src") || null;
}

export default class ChorusMuzikoloji extends Component {
  @service router;
  @service site;

  @tracked kartlar = null;
  yuklenen = null;

  get catId() {
    return this.router.currentRoute?.attributes?.category?.id || null;
  }

  get goster() {
    const id = this.catId;
    const acik = (id === MUZIKOLOJI || id === OKU) && (this.router.currentRouteName || "").startsWith("discovery.");
    if (acik && this.yuklenen !== id) {
      this.yuklenen = id;
      this.yukle();
    }
    return acik && this.kartlar?.length;
  }

  async yukle() {
    try {
      const tanim = new Set((this.site.categories || []).map((c) => parseInt(String(c.topic_url || "").split("/").pop(), 10)).filter(Boolean));
      const j = await ajax(`/c/${MUZIKOLOJI}/l/latest.json`, { data: { order: "created" } });
      const konular = (j.topic_list?.topics || []).filter((t) => !tanim.has(t.id)).slice(0, 6);
      const detay = await Promise.all(konular.map((t) => ajax(`/t/${t.id}.json`).catch(() => null)));
      this.kartlar = konular
        .map((t, i) => {
          const ilk = detay[i]?.post_stream?.posts?.[0];
          const url = `/t/${t.slug}/${t.id}`;
          return {
            id: t.id,
            baslik: t.title,
            url,
            orijinal: orijinal(ilk?.cooked) || url,
            ozet: ozet(ilk?.cooked),
            kapak: t.image_url || kapak(ilk?.cooked),
            cevap: Math.max(0, (t.posts_count || 1) - 1),
          };
        })
        .filter((k) => k.baslik);
    } catch {
      this.kartlar = [];
    }
  }

  <template>
    {{#if this.goster}}
      <section class="chorus-muz" aria-label="Common Hours'tan müzikoloji yazıları">
        <div class="chorus-muz__bas">
          <h2>Common Hours'tan</h2>
          <p>Müzik üstüne uzun yazılar. Okuması Common Hours'ta, konuşması burada.</p>
        </div>
        <div class="chorus-muz__kartlar">
          {{#each this.kartlar key="id" as |k|}}
            <article class="chorus-muz__kart">
              {{#if k.kapak}}
                <a class="chorus-muz__kapak" href={{k.orijinal}} target="_blank" rel="noopener"><img src={{k.kapak}} alt="" loading="lazy" /></a>
              {{/if}}
              <div class="chorus-muz__govde">
                <span class="chorus-muz__etiket">COMMON HOURS · MÜZİKOLOJİ</span>
                <h3><a href={{k.orijinal}} target="_blank" rel="noopener">{{k.baslik}}</a></h3>
                {{#if k.ozet}}<p>{{k.ozet}}</p>{{/if}}
                <div class="chorus-muz__eylem">
                  <a class="chorus-muz__oku" href={{k.orijinal}} target="_blank" rel="noopener">Common Hours'ta oku →</a>
                  <a class="chorus-muz__konus" href={{k.url}}>Chorus'ta konuş{{#if k.cevap}} · {{k.cevap}}{{/if}}</a>
                </div>
              </div>
            </article>
          {{/each}}
        </div>
      </section>
    {{/if}}
  </template>
}
