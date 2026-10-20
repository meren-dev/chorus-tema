import Component from "@glimmer/component";
import { tracked } from "@glimmer/tracking";
import { on } from "@ember/modifier";
import { action } from "@ember/object";
import { service } from "@ember/service";
import { CHANNEL_PATH, dayQueue, isRadioEvent, loadRadioSongs, playRadio } from "../lib/chorus-radyo";

// Chorus · Kepenk Radyosu kanal çubuğu
// Kanal tam sayfa açıldığında (telefonda hep böyle) üstte tek dokunuşluk bir çubuk:
// "Bugünün 3 şarkısı · baştan çal". Kendiliğinden çalmaz: sayfa dışarıdan açıldığında tarayıcılar
// sesi engeller, sohbete yazmaya gelen birinin önüne de müzik patlamasın.
// Radyo zaten çalıyorsa çubuk görünmez. Sağ alttaki sohbet penceresinde (masaüstü) görünmez;
// orada ana sayfadaki "Radyoya gir" çalmayı başlatır.

export default class ChorusRadyoBar extends Component {
  @service router;

  @tracked queue = null;
  @tracked radioOn = false;

  loading = false;
  loadedAt = 0;

  constructor() {
    super(...arguments);
    this.onQueue = (e) => (this.radioOn = isRadioEvent(e.detail));
    document.addEventListener("chorus:queue", this.onQueue);
  }

  willDestroy() {
    super.willDestroy(...arguments);
    document.removeEventListener("chorus:queue", this.onQueue);
  }

  get onChannel() {
    const on = (this.router.currentURL || "").startsWith(CHANNEL_PATH);
    if (on) {
      this.refresh();
    }
    return on;
  }

  // Kanala her girişte en fazla dakikada bir yenile
  refresh() {
    if (this.loading || Date.now() - this.loadedAt < 60000) {
      return;
    }
    this.loading = true;
    loadRadioSongs()
      .then((songs) => (this.queue = dayQueue(songs)))
      .catch(() => (this.queue = null))
      .finally(() => {
        this.loading = false;
        this.loadedAt = Date.now();
      });
  }

  get label() {
    const l = this.queue?.label || "";
    return l.charAt(0).toLocaleUpperCase("tr-TR") + l.slice(1);
  }

  @action
  play() {
    playRadio(this.queue, 0);
  }

  <template>
    {{#if this.onChannel}}
      {{#if this.queue.count}}
        {{#unless this.radioOn}}
          <div class="chorus-radyo-bar">
            <button type="button" class="chorus-radyo-bar__play" {{on "click" this.play}}>
              <span aria-hidden="true">▶</span>
              {{this.label}} · baştan çal
            </button>
          </div>
        {{/unless}}
      {{/if}}
    {{/if}}
  </template>
}
