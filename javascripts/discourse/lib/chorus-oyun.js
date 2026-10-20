// Chorus · oyunların ortak parçaları
// Metin sadeleştirme, tarayıcıda saklanan oyun durumu, tohumlu karıştırma ve sonuç paylaşımı.

export function sade(s) {
  return String(s || "")
    .toLocaleLowerCase("tr-TR")
    .replace(/ı/g, "i")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\([^)]*\)|\[[^\]]*\]/g, " ")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^the /, "");
}

function mesafe(a, b) {
  const m = a.length;
  const n = b.length;
  if (!m || !n) {
    return m || n;
  }
  let onceki = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const simdi = [i];
    for (let j = 1; j <= n; j++) {
      simdi[j] = Math.min(onceki[j] + 1, simdi[j - 1] + 1, onceki[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    onceki = simdi;
  }
  return onceki[n];
}

// Tahmin hedefe yeterince yakın mı? (küçük yazım hatalarını affeder)
export function benziyor(tahmin, hedef) {
  const t = sade(tahmin);
  const h = sade(hedef);
  if (!t || !h) {
    return false;
  }
  if (t === h) {
    return true;
  }
  if (t.length >= 4 && (h.includes(t) || t.includes(h)) && Math.min(t.length, h.length) / Math.max(t.length, h.length) > 0.6) {
    return true;
  }
  const izin = h.length > 12 ? 3 : h.length > 5 ? 2 : h.length > 3 ? 1 : 0;
  return mesafe(t, h) <= izin;
}

export function oku(anahtar, yedek) {
  try {
    return JSON.parse(localStorage.getItem(anahtar)) ?? yedek;
  } catch {
    return yedek;
  }
}

export function yaz(anahtar, deger) {
  try {
    localStorage.setItem(anahtar, JSON.stringify(deger));
  } catch {
    // tarayıcı saklamaya izin vermiyorsa oyun yine oynanır, yalnızca hatırlanmaz
  }
}

// Herkese aynı sırayı veren karıştırma (konu numarası tohum)
export function karistir(liste, tohum) {
  let s = (Number(tohum) || 1) >>> 0;
  const rastgele = () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const a = [...liste];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rastgele() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function bugun(tarih = new Date()) {
  const p = new Intl.DateTimeFormat("tr-TR", { timeZone: "Europe/Istanbul", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(tarih);
  const g = (t) => p.find((x) => x.type === t)?.value || "";
  return `${g("year")}-${g("month")}-${g("day")}`;
}

export function kisaTarih(gun) {
  return `${gun.slice(8, 10)}.${gun.slice(5, 7)}`;
}

// Sonucu paylaş: telefonda paylaşım menüsü, masaüstünde panoya kopyala
export async function paylas(metin, dugme) {
  try {
    if (navigator.share && window.matchMedia?.("(pointer: coarse)").matches) {
      await navigator.share({ text: metin });
      return;
    }
  } catch {
    // paylaşım menüsü kapatıldı; panoya düş
  }
  try {
    await navigator.clipboard.writeText(metin);
    if (dugme) {
      const eski = dugme.textContent;
      dugme.textContent = "Kopyalandı";
      setTimeout(() => (dugme.textContent = eski), 1800);
    }
  } catch {
    window.prompt("Kopyala:", metin);
  }
}

export function el(tag, cls, metin) {
  const n = document.createElement(tag);
  if (cls) {
    n.className = cls;
  }
  if (metin !== undefined) {
    n.textContent = metin;
  }
  return n;
}

export function dugme(cls, metin, tikla) {
  const b = el("button", cls, metin);
  b.type = "button";
  if (tikla) {
    b.addEventListener("click", tikla);
  }
  return b;
}

export function konuAdresi(topic) {
  return `${window.location.host}/t/${topic?.id || ""}`;
}

export const KEPENK_YUZ = `<svg class="kepenk-yuz kepenk-yuz--kucuk" viewBox="0 0 24 24" aria-hidden="true" focusable="false" xmlns="http://www.w3.org/2000/svg"><g fill="#F3EEE4" stroke="#F45139" stroke-width="1.9" stroke-linejoin="round"><path d="M4.2 11.4 L5.2 3 L10.9 7.3 Z"/><path d="M19.8 11.4 L18.8 3 L13.1 7.3 Z"/><ellipse cx="12" cy="13.9" rx="8.7" ry="7.5"/></g><circle cx="8.4" cy="12.9" r="1.45" fill="#1b1b1a"/><circle cx="15.6" cy="12.9" r="1.45" fill="#1b1b1a"/><path d="M11 17.2q1-.6 2 0" stroke="#1b1b1a" stroke-width="1.2" fill="none" stroke-linecap="round"/></svg>`;
