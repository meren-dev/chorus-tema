import Component from "@glimmer/component";
import { tracked } from "@glimmer/tracking";
import { on } from "@ember/modifier";
import { action } from "@ember/object";
import { service } from "@ember/service";
import { apiInitializer } from "discourse/lib/api";

// Kepenk, Takıl'da senin için yeni bir şey varsa uyanır.
// "Gördüm" sayısı tarayıcıda tutulur; Takıl'a tıklayınca Kepenk yine uyuklar.
const ANAHTAR = "chorus-takil-gordum";

function okuGordum() {
  try {
    const v = window.localStorage.getItem(ANAHTAR);
    return v === null ? null : parseInt(v, 10);
  } catch {
    return null;
  }
}

function yazGordum(n) {
  try {
    window.localStorage.setItem(ANAHTAR, String(n));
  } catch {
    // tarayıcı izin vermezse Kepenk sadece biraz daha uyanık kalır
  }
}

class TakilKepenk extends Component {
  @service currentUser;
  @service topicTrackingState;

  @tracked toplam = 0;
  @tracked gordum = null;

  constructor() {
    super(...arguments);
    let g = okuGordum();
    if (this.currentUser) {
      const t = this.hesapla();
      if (g !== null && t < g) {
        g = t;
        yazGordum(t);
      }
      this.toplam = t;
      this.dinleyici = this.topicTrackingState.onStateChange(() =>
        this.guncelle()
      );
    }
    this.gordum = g;
  }

  willDestroy() {
    super.willDestroy(...arguments);
    if (this.dinleyici !== undefined) {
      this.topicTrackingState.offStateChange(this.dinleyici);
    }
  }

  get kategoriler() {
    return String(settings.takil_kategorileri || "")
      .split("|")
      .map((x) => parseInt(x, 10))
      .filter(Boolean);
  }

  hesapla() {
    let t = 0;
    for (const categoryId of this.kategoriler) {
      t += this.topicTrackingState.countNew({ categoryId, noSubcategories: true });
      t += this.topicTrackingState.countUnread({ categoryId, noSubcategories: true });
    }
    return t;
  }

  guncelle() {
    const t = this.hesapla();
    this.toplam = t;
    if (this.gordum !== null && t < this.gordum) {
      this.gordum = t;
      yazGordum(t);
    }
  }

  get uyanik() {
    return this.toplam > (this.gordum ?? 0);
  }

  get adres() {
    return settings.takil_adresi || "/c/acik-masalar/7";
  }

  get etiket() {
    return this.uyanik ? "Takıl · Kepenk bir şey gördü, gel bak" : "Takıl";
  }

  @action
  tiklandi() {
    this.gordum = this.toplam;
    yazGordum(this.toplam);
  }

  <template>
    <li class="chorus-takil-li">
      <a
        href={{this.adres}}
        class="chorus-takil {{if this.uyanik 'is-uyanik'}}"
        title={{this.etiket}}
        aria-label={{this.etiket}}
        {{on "click" this.tiklandi}}
      >
        <svg class="kepenk-yuz" viewBox="0 0 24 24" aria-hidden="true" focusable="false" xmlns="http://www.w3.org/2000/svg">
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
            <circle class="k-acik-sag" cx="15.6" cy="12.9" r="1.45"/>
          </g>
          <path class="k-kirp" d="M14.1 13.3q1.5-1.6 3 0" stroke="#1b1b1a" stroke-width="1.5" fill="none" stroke-linecap="round"/>
          <path d="M10.4 16.9q1.1.9 2.2 0q.8-.3 1.3-.9" stroke="#1b1b1a" stroke-width="1.2" fill="none" stroke-linecap="round"/>
        </svg>
        <span class="chorus-takil__ad">Takıl</span>
      </a>
    </li>
  </template>
}

export default apiInitializer((api) => {
  api.headerIcons.add("chorus-takil", TakilKepenk, { before: "search" });
});
