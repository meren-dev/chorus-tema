// Chorus · Bir eser bağla
// "Bağlantı ekle" küçük bir pencere açar: eserin bağlantısı, önizlemesi ve tek cümlelik nedeni.
// Yazı kutusuna bağlantı kendi satırında gider; Discourse tek başına duran bağlantıyı görselli
// önizlemeye çevirir (film, kitap, yazı, şarkı…).
// Instagram'ı Discourse önizleyemiyor (Facebook anahtarı ister): Instagram gönderisi kendi gömülü
// görünümüyle gösterilir. Eski biçimdeki ("Eserin bağlantısı: …" satır içinde) cevaplar da önizlenir.
import { mediaFromUrl } from "./chorus-media";
import { el } from "./chorus-oyun";

const INSTAGRAM = /^https?:\/\/(?:www\.)?instagram\.com\/(?:[\w.]+\/)?(p|reel|reels|tv)\/([\w-]+)/i;
const ESKI_BICIM = /^eserin bağlantısı\s*:/i;

// Instagram'ın gömülü görünümü yüksekliğini kendisi bildirir; iframe'i ona göre uzat
let olcuDinleniyor = false;
function instagramOlcusu() {
  if (olcuDinleniyor) {
    return;
  }
  olcuDinleniyor = true;
  window.addEventListener("message", (e) => {
    if (e.origin !== "https://www.instagram.com") {
      return;
    }
    let d = e.data;
    if (typeof d === "string") {
      try {
        d = JSON.parse(d);
      } catch {
        return;
      }
    }
    const h = Number(d?.details?.height);
    if (d?.type !== "MEASURE" || !h) {
      return;
    }
    document.querySelectorAll(".chorus-instagram iframe").forEach((f) => {
      if (f.contentWindow === e.source) {
        f.style.height = `${Math.min(Math.max(h, 200), 1400)}px`;
      }
    });
  });
}

export function instagramKutu(url) {
  const m = String(url || "").match(INSTAGRAM);
  if (!m) {
    return null;
  }
  instagramOlcusu();
  const tur = m[1].toLowerCase() === "tv" ? "p" : m[1].toLowerCase() === "reels" ? "reel" : m[1].toLowerCase();
  const kutu = el("div", "chorus-instagram");
  const f = document.createElement("iframe");
  f.src = `https://www.instagram.com/${tur}/${m[2]}/embed/`;
  f.title = "Instagram gönderisi";
  f.setAttribute("loading", "lazy");
  f.setAttribute("frameborder", "0");
  f.setAttribute("allowtransparency", "true");
  f.setAttribute("allow", "clipboard-write; encrypted-media; picture-in-picture");
  kutu.appendChild(f);
  return kutu;
}

function spotifyKutu(media) {
  const kutu = el("div", "chorus-spotify");
  const f = document.createElement("iframe");
  f.src = media.embed;
  f.width = "100%";
  f.height = media.type === "track" || media.type === "episode" ? "152" : "352";
  f.setAttribute("frameborder", "0");
  f.setAttribute("allow", "autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture");
  f.setAttribute("loading", "lazy");
  f.title = "Spotify oynatıcı";
  kutu.appendChild(f);
  return kutu;
}

// Discourse'un kendi önizleme servisi (yazı kutusunun önizlemesi de bunu kullanır)
const onizlemeler = new Map();
function oneboxGetir(url) {
  if (!onizlemeler.has(url)) {
    onizlemeler.set(
      url,
      fetch(`/onebox?url=${encodeURIComponent(url)}&refresh=false`, {
        headers: { Accept: "*/*", "X-Requested-With": "XMLHttpRequest" },
      })
        .then((r) => (r.ok ? r.text() : null))
        .then((t) => (t && t.trim() && !/^<!doctype/i.test(t.trim()) ? t : null))
        .catch(() => null)
    );
  }
  return onizlemeler.get(url);
}

// Bir bağlantının önizlemesi: Instagram ve Spotify gömülü, diğerleri Discourse'un önizlemesi. Yoksa null.
export async function eserOnizlemesi(url) {
  const ig = instagramKutu(url);
  if (ig) {
    return ig;
  }
  const media = mediaFromUrl(url);
  if (media?.kind === "spotify") {
    return spotifyKutu(media);
  }
  const html = await oneboxGetir(url);
  if (!html) {
    return null;
  }
  const kutu = el("div", "chorus-eser");
  kutu.innerHTML = html;
  return kutu;
}

// Gönderilerde: Instagram bağlantısı tek başına duruyorsa gömülü görünüme çevrilir;
// eski biçimdeki "Eserin bağlantısı: …" satırının altına önizleme eklenir.
export function eserleriGoster(elem) {
  elem.querySelectorAll("p > a[href]").forEach((a) => {
    const p = a.parentElement;
    if (!elem.contains(p) || p.closest("blockquote, aside, li, .chorus-eser") || p.nextElementSibling?.matches?.(".chorus-eser, .chorus-instagram, .chorus-spotify")) {
      return;
    }
    const href = a.getAttribute("href") || "";
    if (!/^https?:\/\//i.test(href)) {
      return;
    }
    const metin = p.textContent.trim();
    const tek = metin === a.textContent.trim();
    const eski = ESKI_BICIM.test(metin) && p.querySelectorAll("a[href]").length === 1;
    if (tek && INSTAGRAM.test(href)) {
      p.replaceWith(instagramKutu(href));
      return;
    }
    if (!eski) {
      return;
    }
    eserOnizlemesi(href).then((kutu) => {
      if (kutu && p.isConnected && !p.nextElementSibling?.matches?.(".chorus-eser, .chorus-instagram, .chorus-spotify")) {
        p.after(kutu);
      }
    });
  });
}

// "Bağlantı ekle" penceresi; onDone({ markdown }) yazı kutusuna gidecek metni verir
export function openEserDialog({ onDone }) {
  document.querySelector(".chorus-eser-dialog")?.remove();
  const wrap = el("div", "chorus-card-dialog chorus-builder chorus-eser-dialog");
  wrap.setAttribute("role", "dialog");
  wrap.setAttribute("aria-modal", "true");
  wrap.setAttribute("aria-label", "Bağlantı ekle");
  wrap.innerHTML = `
    <form class="chorus-card-dialog__panel chorus-builder__panel" novalidate>
      <button type="button" class="chorus-card-dialog__close" aria-label="Kapat">×</button>
      <div class="chorus-card-dialog__label">BİR ESER BAĞLA</div>
      <label class="chorus-builder__field"><span>Eserin bağlantısı <small>şarkı, film, kitap, resim, yazı…</small></span><input name="url" type="url" placeholder="https://" autocomplete="off" required></label>
      <div class="chorus-eser__onizleme cooked" aria-live="polite"></div>
      <label class="chorus-builder__field"><span>Neden burada? <small>tek cümle</small></span><textarea name="neden" rows="2" maxlength="400" placeholder="Bunu buraya bağlıyorum çünkü…"></textarea></label>
      <p class="chorus-builder__msg" aria-live="polite"></p>
      <div class="chorus-builder__foot">
        <span></span>
        <button type="submit" class="btn btn-primary">Yazı kutusuna aktar</button>
      </div>
    </form>`;
  const form = wrap.querySelector("form");
  const alan = wrap.querySelector(".chorus-eser__onizleme");
  const msg = wrap.querySelector(".chorus-builder__msg");
  const close = () => {
    wrap.remove();
    document.removeEventListener("keydown", onKey);
  };
  const onKey = (e) => e.key === "Escape" && close();

  let sira = 0;
  let gosterilen = "";
  async function onizle() {
    const url = form.elements.url.value.trim();
    if (url === gosterilen) {
      return;
    }
    gosterilen = url;
    const benim = ++sira;
    alan.replaceChildren();
    if (!/^https?:\/\/\S+\.\S+/i.test(url)) {
      return;
    }
    alan.textContent = "Önizleme hazırlanıyor…";
    const kutu = await eserOnizlemesi(url);
    if (benim !== sira) {
      return;
    }
    alan.replaceChildren();
    if (kutu) {
      alan.appendChild(kutu);
    } else {
      alan.textContent = "Bu bağlantının önizlemesi yok; bağlantı yine de eklenir.";
    }
  }
  let bekle = null;
  form.elements.url.addEventListener("input", () => {
    clearTimeout(bekle);
    bekle = setTimeout(onizle, 500);
  });
  form.elements.url.addEventListener("paste", () => setTimeout(onizle, 50));
  form.elements.url.addEventListener("change", onizle);

  wrap.addEventListener("click", (e) => {
    if (e.target === wrap || e.target.closest(".chorus-card-dialog__close")) {
      close();
    }
  });
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const url = form.elements.url.value.trim();
    const neden = form.elements.neden.value.replace(/\s+/g, " ").trim();
    if (!/^https?:\/\/\S+$/i.test(url)) {
      msg.textContent = "Eserin bağlantısını yapıştır (https:// ile başlayan).";
      form.elements.url.focus();
      return;
    }
    if (neden.split(" ").filter(Boolean).length < 3) {
      msg.textContent = "Neden burada olduğunu bir cümleyle yaz.";
      form.elements.neden.focus();
      return;
    }
    close();
    // bağlantı kendi satırında: Discourse onu görselli önizlemeye çevirir
    onDone?.({ markdown: `${url}\n\n${neden}` });
  });

  document.addEventListener("keydown", onKey);
  document.body.appendChild(wrap);
  form.elements.url.focus();
}
