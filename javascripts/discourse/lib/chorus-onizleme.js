// Chorus · 30 saniyelik önizleme
// Şarkının adı görünmeden çalan kısa kesitler (Kör Dinleme, Dört Dörtlük).
// Kesit Deezer'dan, bulunamazsa iTunes'tan gelir; istek Chorus'un kendi adresinden geçer
// (Workflows › "Önizleme · 30 saniye"). Ses Chorus'ta barındırılmaz.
import { pause as pauseMini } from "./chorus-queue";

const bulunan = new Map();

export function onizlemeBul(sanatci, sarki) {
  const anahtar = `${sanatci}|${sarki}`.toLocaleLowerCase("tr-TR");
  if (!bulunan.has(anahtar)) {
    const url = `/workflows/webhooks/onizleme?a=${encodeURIComponent(sanatci || "")}&t=${encodeURIComponent(sarki || "")}`;
    bulunan.set(
      anahtar,
      // çerez gönderilmez: istek herkese açık, akışın kayıtlarına oturum bilgisi düşmesin
      fetch(url, { headers: { Accept: "application/json" }, credentials: "omit" })
        .then((r) => (r.ok ? r.json() : null))
        .then((j) => (j && j.preview ? j : null))
        .catch(() => null)
    );
  }
  return bulunan.get(anahtar);
}

const durum = { ses: null, zaman: null, sahip: null, bitince: null };

export function kesitDurdur() {
  clearTimeout(durum.zaman);
  durum.zaman = null;
  if (durum.ses) {
    durum.ses.pause();
  }
  const f = durum.bitince;
  durum.bitince = null;
  durum.sahip = null;
  f?.();
}

// src kesitini baştan (ya da start saniyesinden) saniye kadar çal
export function kesitCal(src, { start = 0, saniye = 30, sahip = null, bitince = null } = {}) {
  kesitDurdur();
  pauseMini();
  if (!durum.ses) {
    durum.ses = new Audio();
    durum.ses.preload = "auto";
    durum.ses.addEventListener("ended", () => kesitDurdur());
  }
  const ses = durum.ses;
  durum.sahip = sahip;
  durum.bitince = bitince;
  if (ses.src !== src) {
    ses.src = src;
  }
  const basla = () => {
    try {
      ses.currentTime = start;
    } catch {
      // meta veri gelmeden sarılamıyorsa baştan çalar
    }
    const p = ses.play();
    p?.catch?.(() => kesitDurdur());
    durum.zaman = setTimeout(() => kesitDurdur(), saniye * 1000 + 150);
  };
  if (ses.readyState >= 1) {
    basla();
  } else {
    ses.addEventListener("loadedmetadata", basla, { once: true });
    ses.load();
  }
}

export function kesitSahibi() {
  return durum.sahip;
}
