// Chorus · Kepenk'in notları
// Notlar "Kepenk'in notları · not defteri" konusunda durur: her cevap bir şarkı bağlantısı ve tek cümle.
// Not, o şarkı mini çalarda çalarken, radyo sohbetinde ve şarkının paylaşıldığı gönderinin altında görünür.
// Kurallar: ekranda aynı anda en fazla bir not; herkes aynı notu bir kez görür (bu tarayıcıda).
import { mediaFromUrl } from "./chorus-media";
import { KEPENK_YUZ, oku, yaz } from "./chorus-oyun";

export const NOT_DEFTERI = 35; // ekip içi konu (Staff)
const NOT_ADRESI = "/workflows/webhooks/kepenk-notlari"; // Workflows › Kepenk'in notları · okuma
const GORDUM = "kepenk-not-gordum";
const ONBELLEK = "kepenk-notlar";
const SURE = 10 * 60 * 1000;

let yukleniyor = null;
let notlar = null;

function anahtar(media) {
  return media ? `${media.kind}:${media.id}` : null;
}

function cozumle(raw) {
  const satirlar = String(raw || "")
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
  let media = null;
  let metin = "";
  let kaynak = null;
  for (const s of satirlar) {
    const link = s.match(/https?:\/\/[^\s)>\]]+/)?.[0];
    if (/^kaynak\s*:/i.test(s)) {
      kaynak = link || null;
    } else if (!media && link && mediaFromUrl(link)) {
      media = mediaFromUrl(link);
    } else if (!metin && !/^```/.test(s) && !/^https?:/.test(s)) {
      metin = s.replace(/\*\*|__/g, "").replace(/^[-–—]\s{0,9}/, "");
    }
  }
  return media && metin ? { key: anahtar(media), metin, kaynak } : null;
}

export function notlariYukle() {
  if (notlar) {
    return Promise.resolve(notlar);
  }
  if (yukleniyor) {
    return yukleniyor;
  }
  try {
    const o = JSON.parse(sessionStorage.getItem(ONBELLEK) || "null");
    if (o && Date.now() - o.zaman < SURE) {
      notlar = new Map(o.liste);
      return Promise.resolve(notlar);
    }
  } catch {
    // önbellek yoksa ağdan
  }
  yukleniyor = (async () => {
    const harita = new Map();
    try {
      // Not defteri ekip içinde; notlar siteye "Kepenk'in notları · okuma" akışından gelir
      const r = await fetch(NOT_ADRESI, { headers: { Accept: "application/json" } });
      const j = r.ok ? await r.json() : null;
      (j?.notlar || []).forEach((p) => {
        const n = cozumle(p.raw);
        if (n) {
          harita.set(n.key, { ...n, id: p.id });
        }
      });
      sessionStorage.setItem(ONBELLEK, JSON.stringify({ zaman: Date.now(), liste: [...harita] }));
    } catch {
      // not defteri okunamazsa Kepenk susar
    }
    notlar = harita;
    yukleniyor = null;
    return harita;
  })();
  return yukleniyor;
}

export function gorduMu(n) {
  return oku(GORDUM, []).includes(n.id);
}

export function gordum(n) {
  const l = oku(GORDUM, []);
  if (!l.includes(n.id)) {
    l.push(n.id);
    yaz(GORDUM, l.slice(-500));
  }
}

// Ekranda başka bir not var mı?
export function ekrandaNotVar() {
  return !!document.querySelector(".kepenk-not");
}

export async function notBul(media) {
  const k = anahtar(media);
  if (!k) {
    return null;
  }
  const harita = await notlariYukle();
  const n = harita.get(k);
  return n && !gorduMu(n) ? n : null;
}

export function notKutusu(n, yer) {
  const kutu = document.createElement("div");
  kutu.className = `kepenk-not kepenk-not--${yer}`;
  kutu.setAttribute("role", "note");
  const yuz = document.createElement("span");
  yuz.className = "kepenk-not__yuz";
  yuz.innerHTML = KEPENK_YUZ;
  const metin = document.createElement("p");
  metin.className = "kepenk-not__metin";
  const em = document.createElement("em");
  em.textContent = n.metin;
  metin.appendChild(em);
  kutu.append(yuz, metin);
  if (n.kaynak) {
    kutu.classList.add("has-kaynak");
    kutu.tabIndex = 0;
    kutu.title = "Kaynağı aç";
    const ac = () => window.open(n.kaynak, "_blank", "noopener");
    kutu.addEventListener("click", (e) => !e.target.closest("a, button") && ac());
    kutu.addEventListener("keydown", (e) => e.key === "Enter" && ac());
  }
  gordum(n);
  return kutu;
}

// Mini çalar: çalan şarkının notu varsa çaların üstünde 14 saniye durur
let miniZaman = null;
export function miniNotu(item) {
  const bar = document.querySelector(".chorus-mini");
  bar?.querySelector(".kepenk-not")?.remove();
  clearTimeout(miniZaman);
  if (!bar || !item || ekrandaNotVar()) {
    return;
  }
  notBul(item).then((n) => {
    if (!n || ekrandaNotVar() || bar.hidden) {
      return;
    }
    const kutu = notKutusu(n, "mini");
    bar.prepend(kutu);
    miniZaman = setTimeout(() => kutu.remove(), 14000);
  });
}

// Gönderi: ilk şarkı bağlantısının notu, gönderi göründüğünde altında belirir
export function gonderiNotu(elem) {
  if (elem.querySelector(".kepenk-not")) {
    return;
  }
  const media = [...elem.querySelectorAll("a[href], li[data-chorus-url]")]
    .map((a) => mediaFromUrl(a.getAttribute("href") || a.dataset.chorusUrl))
    .find(Boolean);
  if (!media) {
    return;
  }
  notBul(media).then((n) => {
    if (!n || !elem.isConnected) {
      return;
    }
    const goz = new IntersectionObserver(
      (girdiler) => {
        if (!girdiler.some((g) => g.isIntersecting)) {
          return;
        }
        goz.disconnect();
        if (ekrandaNotVar() || gorduMu(n) || !elem.isConnected) {
          return;
        }
        elem.appendChild(notKutusu(n, "gonderi"));
      },
      { threshold: 0.4 }
    );
    goz.observe(elem);
  });
}

// Radyo sohbeti: şarkının altında; mesaj notu zaten içeriyorsa tekrar etmez
export function sohbetNotu(elem, mesaj) {
  if (elem.querySelector(".kepenk-not") || ekrandaNotVar()) {
    return;
  }
  const raw = String(mesaj?.message || "");
  const link = raw.match(/https?:\/\/[^\s)>\]]+/)?.[0];
  const media = link && mediaFromUrl(link);
  if (!media) {
    return;
  }
  notBul(media).then((n) => {
    if (!n) {
      return;
    }
    // mesaj notu zaten taşıyorsa (radyo kuyruğundan gelen "Neden bilmiyorsun") görülmüş say
    if (raw.includes(n.metin.slice(0, 40))) {
      gordum(n);
      return;
    }
    if (ekrandaNotVar() || !elem.isConnected) {
      return;
    }
    elem.appendChild(notKutusu(n, "sohbet"));
  });
}
