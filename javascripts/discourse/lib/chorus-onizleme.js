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

const durum = { ses: null, zaman: null, yedek: null, sahip: null, bitince: null, sira: 0, sinir: 0, calinca: null, bekleyince: null };

export function kesitDurdur() {
  clearTimeout(durum.zaman);
  clearTimeout(durum.yedek);
  durum.zaman = null;
  durum.yedek = null;
  durum.sinir = 0;
  durum.calinca = null;
  durum.bekleyince = null;
  if (durum.ses) {
    durum.ses.pause();
  }
  const f = durum.bitince;
  durum.bitince = null;
  durum.sahip = null;
  f?.();
}

// src kesitini baştan (ya da start saniyesinden) saniye kadar çal.
// Süre, ses gerçekten çalmaya başladığında sayılır: yüklenirken (ya da arada takılırken) geçen zaman
// kesitten yemez; kesit istenenden uzun da sürmez (zaman güncellemesi ayrıca sınırı denetler).
export function kesitCal(src, { start = 0, saniye = 30, sahip = null, bitince = null } = {}) {
  kesitDurdur();
  pauseMini();
  if (!durum.ses) {
    durum.ses = new Audio();
    durum.ses.preload = "auto";
    durum.ses.addEventListener("ended", () => kesitDurdur());
    durum.ses.addEventListener("playing", () => durum.calinca?.());
    durum.ses.addEventListener("waiting", () => durum.bekleyince?.());
    durum.ses.addEventListener("timeupdate", () => {
      if (durum.sinir && !durum.ses.paused && durum.ses.currentTime >= durum.sinir) {
        kesitDurdur();
      }
    });
  }
  const ses = durum.ses;
  const benim = ++durum.sira;
  durum.sahip = sahip;
  durum.bitince = bitince;
  durum.sinir = start + saniye;
  if (ses.src !== src) {
    ses.src = src;
  }
  const dur = () => benim === durum.sira && kesitDurdur();
  // her "çalmaya başladı"da kalan süreye göre durdurma zamanını yeniden kur; takılınca sayaç durur
  durum.calinca = () => {
    if (benim !== durum.sira) {
      return;
    }
    clearTimeout(durum.zaman);
    clearTimeout(durum.yedek);
    const kalan = Math.max(0, start + saniye - (ses.currentTime || 0));
    durum.zaman = setTimeout(dur, kalan * 1000 + 40);
  };
  durum.bekleyince = () => benim === durum.sira && clearTimeout(durum.zaman);
  const basla = () => {
    if (benim !== durum.sira) {
      return;
    }
    try {
      ses.currentTime = start;
    } catch {
      // meta veri gelmeden sarılamıyorsa baştan çalar
    }
    const p = ses.play();
    p?.catch?.(dur);
    // ses hiç başlamazsa (ağ) düğme takılı kalmasın
    durum.yedek = setTimeout(dur, (saniye + 8) * 1000);
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
