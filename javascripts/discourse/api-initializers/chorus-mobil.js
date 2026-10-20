import { apiInitializer } from "discourse/lib/api";

// Chorus · Mobil
// Telefonda kalabalığı azaltan küçük yardımcılar. Hepsi yalnızca CSS'e bilgi verir;
// görünüm doku.scss, odalar.scss ve common.scss'te:
// 1) Mini çaların gerçek yüksekliği kökte --chorus-mini-h olarak durur. Sayfanın altı çaların
//    altında kalmasın diye boşluk ve Kepenk'in çaların üst kenarına oturması buna göre hesaplanır.
// 2) Mini çalara "küçült" düğmesi: çalar ince bir şeride iner (şarkı çalmaya devam eder);
//    tercih bu tarayıcıda hatırlanır.
// 3) Kaydırma: aşağı kaydırırken body'de chorus-kaydiriyor (Kepenk kenarın altına saklanır,
//    durunca geri çıkar) ve chorus-asagi (oda şeridi header'ın arkasına çekilir, yukarı kaydırınca
//    geri gelir) sınıfları.

const MINI_KUCUK = "chorus-mini-kucuk";
const SAKLAN_ESIGI = 80; // sayfanın en üstündeyken Kepenk saklanmasın
const SERIT_ESIGI = 120; // şerit bu kadar aşağıda saklanmaya başlar
const DURUNCA = 700; // kaydırma bu kadar ms durursa Kepenk geri çıkar

function depoOku(anahtar) {
  try {
    return window.localStorage.getItem(anahtar);
  } catch {
    return null;
  }
}

function depoYaz(anahtar, deger) {
  try {
    window.localStorage.setItem(anahtar, deger);
  } catch {
    // tarayıcı izin vermezse tercih yalnızca bu sayfada kalır
  }
}

const OK = `<svg viewBox="0 0 12 12" width="12" height="12" aria-hidden="true" focusable="false"><path d="M2 4.5l4 3.5 4-3.5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

export default apiInitializer(() => {
  if (window.__chorusMobil) {
    return;
  }
  window.__chorusMobil = true;

  const kok = document.documentElement;

  // 1) Mini çalar yüksekliği
  const olc = (mini) => {
    const h = mini.hidden ? 0 : Math.round(mini.getBoundingClientRect().height);
    kok.style.setProperty("--chorus-mini-h", `${h}px`);
  };

  // 2) Küçült düğmesi
  const kucultDugmesi = (mini) => {
    const ust = mini.querySelector(".chorus-mini__top");
    if (!ust || ust.querySelector(".chorus-mini__kucult")) {
      return;
    }
    const b = document.createElement("button");
    b.type = "button";
    b.className = "chorus-mini__kucult";
    b.innerHTML = OK;
    const ayarla = (kucuk) => {
      mini.classList.toggle("is-kucuk", kucuk);
      b.setAttribute("aria-expanded", kucuk ? "false" : "true");
      b.setAttribute("aria-label", kucuk ? "Çaları büyüt" : "Çaları küçült");
      b.title = kucuk ? "Büyüt" : "Küçült";
    };
    ayarla(depoOku(MINI_KUCUK) === "1");
    b.addEventListener("click", () => {
      const kucuk = !mini.classList.contains("is-kucuk");
      ayarla(kucuk);
      depoYaz(MINI_KUCUK, kucuk ? "1" : "0");
    });
    ust.appendChild(b);
  };

  const baglaMini = () => {
    const mini = document.querySelector(".chorus-mini");
    if (!mini || mini.dataset.chorusOlcu) {
      return;
    }
    mini.dataset.chorusOlcu = "1";
    kucultDugmesi(mini);
    if (window.ResizeObserver) {
      new ResizeObserver(() => olc(mini)).observe(mini);
    }
    // çalar gizlenip açılınca (hidden) ya da küçülünce de ölç
    new MutationObserver(() => olc(mini)).observe(mini, {
      attributes: true,
      attributeFilter: ["hidden", "class"],
    });
    olc(mini);
  };
  baglaMini();
  new MutationObserver(baglaMini).observe(document.body, { childList: true });

  // 3) Kaydırma
  let sonY = window.scrollY;
  let zaman = null;
  const sinif = document.body.classList;
  window.addEventListener(
    "scroll",
    () => {
      const y = window.scrollY;
      if (y > sonY + 4) {
        if (y > SAKLAN_ESIGI) {
          sinif.add("chorus-kaydiriyor");
        }
        if (y > SERIT_ESIGI) {
          sinif.add("chorus-asagi");
        }
      } else if (y < sonY - 4) {
        sinif.remove("chorus-kaydiriyor", "chorus-asagi");
      }
      if (y < SERIT_ESIGI) {
        sinif.remove("chorus-asagi");
      }
      sonY = y;
      clearTimeout(zaman);
      zaman = setTimeout(() => sinif.remove("chorus-kaydiriyor"), DURUNCA);
    },
    { passive: true }
  );
});
