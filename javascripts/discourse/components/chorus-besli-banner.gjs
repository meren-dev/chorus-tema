import Component from "@glimmer/component";
import { tracked } from "@glimmer/tracking";
import { on } from "@ember/modifier";
import { action } from "@ember/object";
import { service } from "@ember/service";
import { findBesli, openBesliComposer } from "../lib/chorus-besli";

// Beşlisi olmayan üyeye her sayfanın üstünde kısa bir şerit: Chorus'a beşlinle girersin.
export default class ChorusBesliBanner extends Component {
  @service currentUser;
  @service composer;
  @service site;
  @service appEvents;

  @tracked missing = false;
  @tracked later = false;

  constructor() {
    super(...arguments);
    try {
      // vitrinden "Kulak misafiri ol" ile gelen üyeye beşli şeridi ilk oturumda gösterilmez
      this.later = sessionStorage.getItem("chorus-besli-later") === "1" || sessionStorage.getItem("chorus-join") === "kulak";
    } catch {
      this.later = false;
    }
    if (this.currentUser) {
      findBesli(this.currentUser.username).then((b) => (this.missing = !b));
    }
    this.appEvents.on("chorus:besli-created", this, this.done);
  }

  willDestroy() {
    super.willDestroy(...arguments);
    this.appEvents.off("chorus:besli-created", this, this.done);
  }

  done() {
    this.missing = false;
  }

  get show() {
    return this.currentUser && this.missing && !this.later;
  }

  @action
  start() {
    openBesliComposer(this.composer, this.site, this.currentUser);
  }

  @action
  hide() {
    this.later = true;
    try {
      sessionStorage.setItem("chorus-besli-later", "1");
    } catch {
      // tarayıcı izin vermezse yalnızca bu sayfada gizlenir
    }
  }

  <template>
    {{#if this.show}}
      <div class="chorus-besli-banner" role="region" aria-label="Beşlin">
        <span class="chorus-besli-banner__label">İLK ADIM</span>
        <p><strong>Kendini beş şarkıyla tanıt.</strong>
          Burada yazdığın ilk şey bu olur: seni anlatan beş şarkı, her birine tek cümle. Profilinde de görünür.</p>
        <div class="chorus-besli-banner__actions">
          <button type="button" class="btn btn-primary btn-small" {{on "click" this.start}}>Beş şarkımı seç</button>
          <button type="button" class="btn btn-flat btn-small" {{on "click" this.hide}}>Sonra</button>
        </div>
      </div>
    {{/if}}
  </template>
}
