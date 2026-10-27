import Component from "@glimmer/component";
import { tracked } from "@glimmer/tracking";
import { fn } from "@ember/helper";
import { on } from "@ember/modifier";
import { action } from "@ember/object";
import { service } from "@ember/service";
import { htmlSafe } from "@ember/template";
import { ajax } from "discourse/lib/ajax";
import { findBesli, openBesliComposer } from "../lib/chorus-besli";
import { besliCard, openCardDialog } from "../lib/chorus-card";
import { CHORUS_SECKILERI, isCurator, LISTELER, openListBuilder } from "../lib/chorus-list-builder";
import { itemsFromCooked, listItems } from "../lib/chorus-media";
import { nowPlaying, playQueue } from "../lib/chorus-queue";

// Chorus profil bloğu: özet sayfasının en üstünde, istatistiklerin önünde.
// Bileşenler katılımdan dolar: beşli, listeler, Tam burada anları, Dinledim'ler, profil alanları, öne çıkan konu.
// Kendi profilinde boş bileşenler, nasıl doldurulacağını söyleyen yer tutucularla görünür.
const TS = /(^|[^\d:])(\d{1,2}:[0-5]\d)(?![\d:])/;
const ABOUT = /kategorisi hakkında$/i;
const HOW = "1"; // profil alanı: Nasıl dinlerim?
const NOW = "2"; // profil alanı: Şu sıralar dönüp duran

export default class ChorusProfile extends Component {
  @service currentUser;
  @service siteSettings;
  @service site;
  @service composer;

  @tracked loaded = false;
  @tracked user = null;
  @tracked how = null;
  @tracked now = null;
  @tracked besli = [];
  @tracked besliUrl = null;
  @tracked moments = [];
  @tracked lists = [];
  @tracked heard = [];
  @tracked common = 0;
  @tracked vitrin = null;
  @tracked nowUrl = null;
  @tracked nowList = null;

  constructor() {
    super(...arguments);
    this.onQueue = (e) => {
      this.nowUrl = e.detail?.playing ? e.detail.url : null;
      this.nowList = e.detail?.listUrl || null;
    };
    document.addEventListener("chorus:queue", this.onQueue);
    const np = nowPlaying();
    this.nowUrl = np.playing ? np.item?.url : null;
    this.load();
  }

  willDestroy() {
    super.willDestroy(...arguments);
    document.removeEventListener("chorus:queue", this.onQueue);
  }

  get username() {
    const u = this.args.outletArgs?.user || this.args.outletArgs?.model;
    return u?.username || decodeURIComponent(window.location.pathname.split("/")[2] || "");
  }

  get isSelf() {
    return this.currentUser && this.currentUser.username === this.user?.username;
  }

  get displayName() {
    return this.user?.name || this.user?.username || "";
  }

  get profileUrl() {
    return `${window.location.host}/u/${this.user?.username || ""}`;
  }

  get prefsUrl() {
    return `/u/${this.user?.username}/preferences/profile`;
  }

  get besliRows() {
    return this.besli.map((t, i) => ({ ...t, i, no: `0${i + 1}`, isNow: this.nowUrl === t.url }));
  }

  get listRows() {
    return this.lists.map((l) => ({ ...l, isNow: this.nowList === l.url }));
  }

  async load() {
    const name = this.username;
    if (!name) {
      return;
    }
    try {
      const { user } = await ajax(`/u/${name}.json`);
      this.user = user;
      const f = user.user_fields || {};
      this.how = f[HOW] || null;
      this.now = f[NOW] || null;

      const jobs = [];
      // Beşli: kişinin Beşliler'deki konusu. Öne çıkan konu ayrı bir vitrin.
      jobs.push(
        findBesli(user.username).then(async (b) => {
          const featured = user.featured_topic;
          if (featured?.id && featured.id !== b?.id) {
            this.vitrin = { title: featured.fancy_title || featured.title, url: `/t/${featured.slug}/${featured.id}` };
          }
          if (!b) {
            return;
          }
          const t = await ajax(`/t/${b.id}.json`);
          this.besli = itemsFromCooked(t.post_stream?.posts?.[0]?.cooked, 5);
          this.besliUrl = `/t/${t.slug}/${t.id}`;
        })
      );
      jobs.push(
        ajax(`/user_actions.json?username=${name}&filter=4,5&limit=60`).then((r) => {
          this.moments = (r.user_actions || [])
            .map((a) => {
              const kat = (this.site.categories || []).find((c) => c.id === a.category_id);
              if (kat?.read_restricted) {
                return null;
              }
              const text = (a.excerpt || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").replace(/\s+(['’])/g, "$1").trim();
              const m = text.match(TS);
              if (!m) {
                return null;
              }
              // Saniyenin geçtiği cümlenin tamamı; saniye cümlenin başındaysa (Tam burada biçimi) saniye atılır
              const at = m.index + m[1].length;
              const bas = Math.max(text.lastIndexOf(". ", at), text.lastIndexOf("! ", at), text.lastIndexOf("? ", at));
              const start = bas === -1 ? 0 : bas + 2;
              const sonRel = text.slice(at).search(/[.!?…](\s|$)/);
              const end = sonRel === -1 ? text.length : at + sonRel + 1;
              let note = text.slice(start, end).trim();
              if (at === start) {
                note = text.slice(at + m[2].length, end).replace(/^[\s·:.\-]+/, "").trim();
              }
              note = note.length > 160 ? note.slice(0, 157).trim() + "…" : note;
              return { time: m[2], note, title: a.title, url: `/t/${a.slug}/${a.topic_id}/${a.post_number}` };
            })
            .filter(Boolean)
            .slice(0, 3);
        })
      );
      // Listeleri: Listeler ve Chorus Seçkileri'nde açtığı konular
      jobs.push(
        ajax(`/topics/created-by/${name}.json`).then((r) => {
          this.lists = (r.topic_list?.topics || [])
            .filter((t) => (t.category_id === LISTELER || t.category_id === CHORUS_SECKILERI) && !ABOUT.test(t.title))
            .slice(0, 6)
            .map((t) => ({
              id: t.id,
              title: t.title,
              url: `/t/${t.slug}/${t.id}`,
              replies: Math.max(0, (t.posts_count || 1) - 1),
              curated: t.category_id === CHORUS_SECKILERI,
            }));
        })
      );
      jobs.push(
        ajax(`/user_actions.json?username=${name}&filter=1&limit=30`).then((r) => {
          const acts = r.user_actions || [];
          this.heard = acts.slice(0, 6).map((a, i) => ({
            title: a.title,
            by: a.target_username || a.username,
            url: `/t/${a.slug}/${a.topic_id}/${a.post_number}`,
            tone: `chorus-tone-${i % 5}`,
          }));
          return acts;
        })
      );
      const results = await Promise.allSettled(jobs);

      // Ortak kulak: iki kişinin son Dinledim'lerinde aynı gönderiler
      if (this.currentUser && this.currentUser.username !== name) {
        const theirs = results[results.length - 1]?.value || [];
        const mine = (await ajax(`/user_actions.json?username=${this.currentUser.username}&filter=1&limit=60`)).user_actions || [];
        const keys = new Set(mine.map((a) => `${a.topic_id}-${a.post_number}`));
        this.common = theirs.filter((a) => keys.has(`${a.topic_id}-${a.post_number}`)).length;
      }
    } catch {
      // profil verisi gelmezse blok boş kalır
    } finally {
      this.loaded = true;
    }
  }

  @action
  playBesli(index) {
    playQueue(this.besli, index, { title: `${this.displayName} · beşli`, url: this.besliUrl });
  }

  @action
  async playList(list) {
    const t = await ajax(`/t/${list.id}.json`);
    // şarkı yoksa tüm liste (Spotify/YouTube çalma listesi) çalar
    playQueue(listItems(t.post_stream?.posts?.[0]?.cooked, list.title), 0, { title: list.title, url: list.url });
  }

  @action
  createBesli() {
    openBesliComposer(this.composer, this.site, this.currentUser);
  }

  @action
  createList() {
    const site = this.site;
    openListBuilder({
      staff: isCurator(this.currentUser),
      onDone: ({ title, body, categoryId, tags }) =>
        this.composer.openNewTopic({ category: (site.categories || []).find((c) => c.id === categoryId), title, body, tags }),
    });
  }

  @action
  async shareBesli() {
    const c = await besliCard({
      name: this.displayName,
      items: this.besli,
      url: this.profileUrl,
      logo: this.siteSettings.logo_small,
    });
    await openCardDialog(c, {
      filename: `chorus-besli-${this.user.username}.png`,
      title: "Beni beş şarkıyla tanı",
      link: `${window.location.origin}/u/${this.user.username}`,
    });
  }

  <template>
    {{#if this.loaded}}
      <section class="chorus-profile">
        {{#if this.how}}
          <p class="chorus-profile__how">“{{this.how}}”</p>
        {{else if this.isSelf}}
          <a class="chorus-profile__fill" href={{this.prefsUrl}}><strong>Nasıl dinlersin?</strong>
            Tek cümle yaz, profilinin en üstünde dursun. Tercihler › Profil</a>
        {{/if}}
        {{#if this.now}}
          <p class="chorus-profile__now"><span class="chorus-profile__label">Şu sıralar dönüp duran</span>
            {{this.now}}</p>
        {{else if this.isSelf}}
          <a class="chorus-profile__fill" href={{this.prefsUrl}}><strong>Şu sıralar dönüp duran</strong>
            Bu aralar başa sardığın şarkı. Tercihler › Profil</a>
        {{/if}}
        {{#if this.common}}
          <p class="chorus-profile__common"><strong>Seninle {{this.common}} ortak Dinledim.</strong>
            Son dinlediklerinizde aynı paylaşımlar var.</p>
        {{/if}}

        <div class="chorus-profile__grid">
          <div class="chorus-profile__block">
            <div class="chorus-profile__head">
              <h3>Beni beş şarkıyla tanı</h3>
              {{#if this.besli.length}}
                <div class="chorus-profile__tools">
                  <button type="button" class="chorus-play-all" {{on "click" (fn this.playBesli 0)}}>▶ Çal</button>
                  <button type="button" class="btn btn-small chorus-profile__share" {{on "click" this.shareBesli}}>Paylaş</button>
                </div>
              {{/if}}
            </div>
            {{#if this.besli.length}}
              <ol class="chorus-profile__besli">
                {{#each this.besliRows as |t|}}
                  <li class={{if t.isNow "is-now"}}>
                    <div class="chorus-profile__row">
                      <button type="button" class="chorus-play-row" aria-label="Bu şarkıdan çal" {{on "click" (fn this.playBesli t.i)}}>{{if t.isNow "❚❚" "▶"}}</button>
                      <span class="chorus-profile__no">{{t.no}}</span>
                      <span class="chorus-profile__track"><strong>{{t.title}}</strong>
                        <span class="chorus-profile__artist">{{t.artist}}</span>
                        {{#if t.note}}<em>{{t.note}}</em>{{/if}}</span>
                    </div>
                  </li>
                {{/each}}
              </ol>
              {{#if this.isSelf}}
                <a class="chorus-profile__more" href={{this.besliUrl}}>Beşlini düzenle: konuyu aç, ilk gönderideki kaleme bas</a>
              {{else}}
                <a class="chorus-profile__more" href={{this.besliUrl}}>Sen altıncı olarak ne eklerdin?</a>
              {{/if}}
            {{else if this.isSelf}}
              <p class="chorus-profile__empty">Henüz beşlin yok. Chorus'taki ilk paylaşımın bu: beş şarkı, her birine tek cümle. Kurduğunda burada görünür.</p>
              <button type="button" class="btn btn-primary btn-small" {{on "click" this.createBesli}}>Beş şarkımı seç</button>
            {{else}}
              <p class="chorus-profile__empty">Henüz beşlisini kurmadı.</p>
            {{/if}}
          </div>

          {{#if this.lists.length}}
            <div class="chorus-profile__block">
              <div class="chorus-profile__head">
                <h3>Listeleri</h3>
                {{#if this.isSelf}}
                  <button type="button" class="btn btn-small chorus-profile__share" {{on "click" this.createList}}>+ Liste</button>
                {{/if}}
              </div>
              {{#each this.listRows as |l|}}
                <div class="chorus-profile__list {{if l.isNow 'is-now'}}">
                  <button type="button" class="chorus-play-row" aria-label="Listeyi çal" {{on "click" (fn this.playList l)}}>▶</button>
                  <a href={{l.url}}>
                    <strong>{{l.title}}</strong>
                    <span class="chorus-profile__artist">{{#if l.curated}}Chorus seçkisi · {{/if}}{{l.replies}} cevap</span>
                  </a>
                </div>
              {{/each}}
            </div>
          {{else if this.isSelf}}
            <div class="chorus-profile__block chorus-profile__block--empty">
              <div class="chorus-profile__head"><h3>Listelerin</h3></div>
              <p class="chorus-profile__empty">Bir ruh hali, bir yol, bir mutfak. Bağlantıları yapıştır, sırala; istersen her şarkıya bir cümle yaz. Listelerin burada durur ve tek dokunuşla çalar.</p>
              <div class="chorus-profile__tools">
                <button type="button" class="btn btn-primary btn-small" {{on "click" this.createList}}>Liste oluştur</button>
                <a class="btn btn-flat btn-small" href="/c/dinle/listeler/10">Önce başkalarınınkine bak</a>
              </div>
            </div>
          {{/if}}

          <div class="chorus-profile__block">
            <div class="chorus-profile__head"><h3>Durduğu anlar</h3></div>
            {{#if this.moments.length}}
              {{#each this.moments as |m|}}
                <a class="chorus-profile__moment" href={{m.url}}>
                  <span class="chorus-ts">{{m.time}}</span>
                  <span class="chorus-profile__mtitle">{{m.title}}</span>
                  <em>{{m.note}}</em>
                </a>
              {{/each}}
            {{else}}
              <p class="chorus-profile__empty">Henüz işaretlenmiş bir an yok. Bir şarkıda seni yakalayan saniyeyi 02:14 gibi yazınca burada görünür.</p>
            {{/if}}
          </div>

          {{#if this.vitrin}}
            <div class="chorus-profile__block chorus-profile__vitrin">
              <div class="chorus-profile__head"><h3>Öne çıkardığı</h3></div>
              <a class="chorus-profile__secki" href={{this.vitrin.url}}>{{htmlSafe this.vitrin.title}}</a>
            </div>
          {{else if this.isSelf}}
            <div class="chorus-profile__block chorus-profile__block--empty">
              <div class="chorus-profile__head"><h3>Öne çıkardığın</h3></div>
              <p class="chorus-profile__empty">Profilinin vitrini: bir listen, bir yazın ya da bir Dinledim'in. Seçmek için Tercihler › Profil › Featured Topic.</p>
              <a class="btn btn-small" href={{this.prefsUrl}}>Vitrini seç</a>
            </div>
          {{/if}}

          {{#if this.heard.length}}
            <div class="chorus-profile__block">
              <div class="chorus-profile__head"><h3>Son dinledikleri</h3></div>
              <div class="chorus-profile__heard">
                {{#each this.heard as |h|}}
                  <a href={{h.url}} class="chorus-profile__heard-item">
                    <span class="chorus-profile__art {{h.tone}}"></span>
                    <span class="chorus-profile__htitle">{{h.title}}</span>
                    <span class="chorus-profile__artist">{{h.by}}</span>
                  </a>
                {{/each}}
              </div>
            </div>
          {{/if}}
        </div>
      </section>
    {{/if}}
  </template>
}
