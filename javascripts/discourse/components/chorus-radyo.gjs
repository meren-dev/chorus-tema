import Component from "@glimmer/component";
import { tracked } from "@glimmer/tracking";
import { fn } from "@ember/helper";
import { on } from "@ember/modifier";
import { action } from "@ember/object";
import { service } from "@ember/service";
import { mediaFromUrl } from "../lib/chorus-media";
import {
  ARCHIVE_URL,
  CHANNEL_URL,
  isRadioEvent,
  istanbul,
  loadArchiveSongs,
  loadRadioSongs,
  nextSlot,
  playRadio,
} from "../lib/chorus-radyo";

// Chorus · Kepenk Radyosu kartı (ana sayfa)
// Son üç şarkıyı gösterir; birine basınca oradan çalar, bitince sıradakine geçer.
// Üyeler sohbet kanalından okur ve "Radyoya gir"le kanala geçer. Hesabı olmayanlar radyonun
// defterinden (Kepenk Radyosu · Çalanlar) dinler; sohbet için hesap gerekir.
// Müzik sayfa değişince kesilmez.

const pad = (n) => String(n).padStart(2, "0");

export default class ChorusRadyo extends Component {
  @service currentUser;

  @tracked loaded = false;
  @tracked failed = false;
  @tracked songs = [];
  @tracked nowUrl = null;
  @tracked radioOn = false;

  constructor() {
    super(...arguments);
    this.onQueue = (e) => {
      this.nowUrl = e.detail?.playing ? e.detail.url : null;
      this.radioOn = isRadioEvent(e.detail);
    };
    document.addEventListener("chorus:queue", this.onQueue);
    this.load();
  }

  willDestroy() {
    super.willDestroy(...arguments);
    document.removeEventListener("chorus:queue", this.onQueue);
  }

  get guest() {
    return !this.currentUser;
  }

  async load() {
    try {
      this.songs = this.guest ? await loadArchiveSongs(3) : await loadRadioSongs();
    } catch {
      this.failed = true;
    }
    this.loaded = true;
  }

  get song() {
    return this.songs.length ? this.songs[this.songs.length - 1] : null;
  }

  // Son üç şarkı, en yenisi üstte
  get recent() {
    return this.songs.slice(-3).reverse();
  }

  // Çalınabilen son üç şarkı: en yeni en üstte; basınca oradan geriye doğru çalar
  get rows() {
    return this.recent.map((s, i) => {
      const at = istanbul(s.at);
      const now = istanbul(new Date());
      return {
        ...s,
        i,
        no: pad(i + 1),
        when: at.day === now.day ? at.time : `${at.day.slice(8, 10)}.${at.day.slice(5, 7)} ${at.time}`,
        isNow: !!this.nowUrl && this.items[i]?.url === this.nowUrl,
        playable: !!this.items[i],
      };
    });
  }

  get items() {
    return this.recent.map((s) => {
      const m = s.url ? mediaFromUrl(s.url) : null;
      return m ? { ...m, artist: s.artist, title: s.title, note: s.note } : null;
    });
  }

  get when() {
    return this.rows[0]?.when || "";
  }

  get next() {
    return nextSlot();
  }

  get channelUrl() {
    return CHANNEL_URL;
  }

  get archiveUrl() {
    return ARCHIVE_URL;
  }

  get hint() {
    return this.radioOn ? "radyo çalıyor" : "son üç şarkı baştan çalar";
  }

  // Seçilen satırdan başla, sonra daha eski şarkılara geç
  @action
  play(i) {
    const items = this.items.slice(i).filter(Boolean);
    playRadio({ items }, 0, this.guest ? ARCHIVE_URL : CHANNEL_URL);
  }

  // Kanala girerken radyo zaten çalmıyorsa son şarkılar baştan başlar.
  // Bağlantının kendisi kanalı açar; tıklama kullanıcı hareketi olduğu için tarayıcı sesi engellemez.
  @action
  enter() {
    if (!this.radioOn) {
      const items = this.items.filter(Boolean);
      playRadio({ items }, 0, CHANNEL_URL);
    }
  }

  <template>
    {{#if this.loaded}}
      {{#unless this.failed}}
        <div class="chorus-vitrin__block chorus-radyo {{if this.guest 'chorus-vitrin__listen'}}">
          <h2><span class="chorus-radyo__dot" aria-hidden="true"></span>Kepenk Radyosu</h2>
          {{#if this.song}}
            <p class="chorus-vitrin__sub">Son şarkı {{this.when}} · {{this.song.by}} · Sıradaki {{this.next}} civarı</p>
            <ol class="chorus-vitrin__secki chorus-radyo__son">
              {{#each this.rows as |s|}}
                <li class={{if s.isNow "is-now"}}>
                  {{#if s.playable}}
                    <button type="button" class="chorus-play-row" aria-label="Bu şarkıdan çal" {{on "click" (fn this.play s.i)}}>{{if s.isNow "❚❚" "▶"}}</button>
                  {{/if}}
                  <span class="chorus-vitrin__no">{{s.when}}</span>
                  <span class="chorus-vitrin__track">
                    {{#if s.playable}}
                      <strong>{{s.title}}</strong>
                    {{else if s.url}}
                      <a href={{s.url}} target="_blank" rel="noopener noreferrer"><strong>{{s.title}}</strong></a>
                    {{else}}
                      <strong>{{s.title}}</strong>
                    {{/if}}
                    {{#if s.artist}}<span>{{s.artist}}</span>{{/if}}
                    {{#if s.note}}<em>{{s.note}}</em>{{/if}}
                  </span>
                </li>
              {{/each}}
            </ol>
          {{else}}
            <p class="chorus-vitrin__sub">Kepenk radyoyu henüz açmadı. İlk şarkı {{this.next}} civarı.</p>
          {{/if}}
          <p class="chorus-radyo__enter">
            {{#if this.guest}}
              <a class="chorus-radyo__open" href="/signup">Sohbete katılmak için hesap aç →</a>
              <a class="chorus-radyo__defter" href={{this.archiveUrl}}>Radyonun defteri</a>
            {{else}}
              <a class="chorus-radyo__open" href={{this.channelUrl}} {{on "click" this.enter}}>Radyoya gir →</a>
              {{#if this.rows.length}}
                <span class="chorus-radyo__hint">{{this.hint}}</span>
              {{/if}}
            {{/if}}
          </p>
        </div>
      {{/unless}}
    {{/if}}
  </template>
}
