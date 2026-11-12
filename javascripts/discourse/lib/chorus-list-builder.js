// Chorus · Liste oluştur
// Bağlantıyı yapıştır, şarkının adı ve sanatçısı kendiliğinden gelsin; sırala, her şarkıya tek cümle yaz.
// Sonuç her yerde aynı biçimdeki listedir: yeni konu olarak açılır ya da yazı kutusuna eklenir.
// Tüm liste (Spotify/YouTube çalma listesi) varsa şarkı eklemek isteğe bağlıdır. Kapak üç yoldan:
// listenin kendi görseli, kendi yüklediğin görsel ya da şarkıların kapaklarından kolaj. Kapak konunun
// görseli olur (raf, vitrin, paylaşım önizlemesi) ve gönderinin başında durur (chorus-yollar).
import { ajax } from "discourse/lib/ajax";
import { extractError } from "discourse/lib/ajax-error";
import { coverFor, itemsToMarkdown, mediaFromUrl, oembed, resolveMeta } from "./chorus-media";

export const LISTELER = 10;
export const CHORUS_SECKILERI = 12;
// Liste kapağının gönderideki görselinin adı; gönderinin içinde gizli durur (common.scss)
export const KAPAK_ALT = "liste kapağı";

const TUR = { playlist: "çalma listesi", album: "albüm", track: "şarkı", episode: "bölüm", video: "video" };

// Chorus Seçkileri'ni ekip ve Küratörler grubu açar
export function isCurator(user) {
  return !!user && (user.staff || (user.groups || []).some((g) => g.name === "kuratorler"));
}

// Kapak için yeterli boy: uzun kenar 1200 px, JPEG. Sunucunun önündeki vekil 1 MB üstünü geri çeviriyor;
// telefon fotoğrafları da böylece hızlı yüklenir. GIF ve SVG olduğu gibi gider.
async function kucult(file, enUzun = 1200) {
  if (!/^image\/(jpeg|png|webp|heic|heif|avif)$/i.test(file.type) || typeof createImageBitmap !== "function") {
    return file;
  }
  const bmp = await createImageBitmap(file).catch(() => null);
  if (!bmp) {
    return file;
  }
  const oran = Math.min(1, enUzun / Math.max(bmp.width, bmp.height));
  if (oran === 1 && file.size < 800 * 1024) {
    return file;
  }
  const c = document.createElement("canvas");
  c.width = Math.round(bmp.width * oran);
  c.height = Math.round(bmp.height * oran);
  const ctx = c.getContext("2d");
  ctx.fillStyle = "#171716";
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.drawImage(bmp, 0, 0, c.width, c.height);
  for (const kalite of [0.86, 0.72, 0.6]) {
    const blob = await new Promise((res) => c.toBlob(res, "image/jpeg", kalite));
    if (blob && (blob.size < 900 * 1024 || kalite === 0.6)) {
      return new File([blob], `${String(file.name || "kapak").replace(/\.\w+$/, "")}.jpg`, { type: "image/jpeg" });
    }
  }
  return file;
}

// Kendi kapağın: Discourse'a yüklenir, gönderiye upload:// adresiyle girer
async function gorselYukle(file) {
  const fd = new FormData();
  fd.append("upload_type", "composer");
  fd.append("file", await kucult(file));
  return ajax("/uploads.json", { type: "POST", data: fd, processData: false, contentType: false });
}

function esc(s) {
  return String(s || "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
}

/**
 * mode "topic": ad, giriş ve kategori sorulur; onDone({ title, body, categoryId })
 * mode "insert": yalnızca şarkılar; onDone({ markdown })
 * secki: küratör seçkiler bölümünden açtıysa "Chorus seçkisi olarak yayımla" işaretli gelir
 */
export function openListBuilder({ mode = "topic", staff = false, secki = false, onDone }) {
  document.querySelector(".chorus-builder")?.remove();
  const items = [];
  const wrap = document.createElement("div");
  wrap.className = "chorus-card-dialog chorus-builder";
  wrap.setAttribute("role", "dialog");
  wrap.setAttribute("aria-modal", "true");
  wrap.setAttribute("aria-label", "Liste oluştur");
  wrap.innerHTML = `
    <form class="chorus-card-dialog__panel chorus-builder__panel" novalidate>
      <button type="button" class="chorus-card-dialog__close" aria-label="Kapat">×</button>
      <div class="chorus-card-dialog__label">${mode === "topic" ? "LİSTE OLUŞTUR" : "YAZIYA LİSTE EKLE"}</div>
      ${
        mode === "topic"
          ? `<label class="chorus-builder__field"><span>Listenin adı</span><input name="title" type="text" maxlength="120" placeholder="Pazar sabahı, mutfakta" required></label>
             <label class="chorus-builder__field"><span>Bu liste ne için? <small>bir iki cümle</small></span><textarea name="intro" rows="2" maxlength="480" placeholder="Kahve demlenirken açtığım, sesi kısık kalan şarkılar."></textarea></label>
             <label class="chorus-builder__field"><span>Tüm liste bir yerde varsa <small>isteğe bağlı · Spotify ya da YouTube çalma listesi</small></span><input name="source" type="url" placeholder="https://open.spotify.com/playlist/..." autocomplete="off"></label>
             <div class="chorus-builder__kaynak" hidden>
               <img class="chorus-builder__kapak" alt="" width="64" height="64">
               <div class="chorus-builder__kaynak-bilgi">
                 <strong></strong>
                 <small></small>
               </div>
             </div>
             <fieldset class="chorus-builder__kapak-secim">
               <legend>Kapak <small>rafta, ana sayfada ve paylaşım önizlemesinde görünür</small></legend>
               <label class="chorus-builder__secim" data-kapak="liste" hidden><input type="radio" name="kapakTuru" value="liste"> <span>Listenin kendi görseli</span></label>
               <label class="chorus-builder__secim"><input type="radio" name="kapakTuru" value="kendi"> <span>Kendi görselim</span></label>
               <label class="chorus-builder__secim"><input type="radio" name="kapakTuru" value="kolaj" checked> <span>Şarkıların kapaklarından kolaj</span></label>
               <div class="chorus-builder__yukle" hidden>
                 <img class="chorus-builder__kapak chorus-builder__kendi" alt="" width="64" height="64" hidden>
                 <div class="chorus-builder__yukle-bilgi">
                   <button type="button" class="btn btn-small" data-b="gorsel">Görsel seç</button>
                   <small class="chorus-builder__yukle-durum">Kare görseller en iyi görünür.</small>
                 </div>
                 <input type="file" name="gorsel" accept="image/*" hidden>
               </div>
             </fieldset>
             <label class="chorus-builder__check"><input name="ortak" type="checkbox"> Ortak liste: herkes şarkı ekleyebilsin</label>
             ${
               staff
                 ? `<label class="chorus-builder__check"><input name="curated" type="checkbox"${secki ? " checked" : ""}> Chorus seçkisi olarak yayımla</label>`
                 : ""
             }`
          : ""
      }
      <div class="chorus-builder__add">
        <label class="chorus-builder__field"><span>Şarkı ekle <small>${mode === "topic" ? "tüm liste varsa isteğe bağlı · " : ""}Spotify ya da YouTube bağlantısını yapıştır</small></span>
          <div class="chorus-builder__addrow"><input name="link" type="url" placeholder="https://open.spotify.com/track/..." autocomplete="off"><button type="button" class="btn btn-primary" data-b="add">Ekle</button></div>
        </label>
        <p class="chorus-builder__msg" aria-live="polite"></p>
      </div>
      <ol class="chorus-builder__items"></ol>
      <div class="chorus-builder__foot">
        <span class="chorus-builder__count">0 şarkı</span>
        <button type="submit" class="btn btn-primary">${mode === "topic" ? "Yazı kutusuna aktar" : "Yazıya ekle"}</button>
      </div>
    </form>`;

  const form = wrap.querySelector("form");
  const list = wrap.querySelector(".chorus-builder__items");
  const msg = wrap.querySelector(".chorus-builder__msg");
  const link = form.elements.link;
  const kaynakKutu = wrap.querySelector(".chorus-builder__kaynak");
  let kaynak = null; // tanınan tüm liste: { media, title, cover }
  let kaynakSira = 0;
  let adElle = false; // listenin adını kişi yazdıysa tüm listenin adıyla değiştirme
  let kendiKapak = null; // yüklenen görsel: { short_url, url }
  let yukleniyor = null; // süren yükleme (gönderirken beklenir)
  let kapakElle = false; // kişi kapak türünü kendisi seçtiyse tüm liste gelince değiştirme
  const kapakTuru = () => form.querySelector('input[name="kapakTuru"]:checked')?.value || "kolaj";
  const kapakSec = (tur) => {
    const r = form.querySelector(`input[name="kapakTuru"][value="${tur}"]`);
    if (r) {
      r.checked = true;
    }
    kapakGoster();
  };
  const yukleKutu = wrap.querySelector(".chorus-builder__yukle");
  const listeSecenek = wrap.querySelector('[data-kapak="liste"]');
  function kapakGoster() {
    if (yukleKutu) {
      yukleKutu.hidden = kapakTuru() !== "kendi";
    }
  }
  async function gorselSecildi(file) {
    if (!file) {
      return;
    }
    const durum = wrap.querySelector(".chorus-builder__yukle-durum");
    const onizleme = wrap.querySelector(".chorus-builder__kendi");
    if (!/^image\//.test(file.type)) {
      durum.textContent = "Bu bir görsel değil.";
      return;
    }
    durum.textContent = "Yükleniyor…";
    kendiKapak = null;
    yukleniyor = gorselYukle(file)
      .then((r) => {
        kendiKapak = r?.short_url || r?.url ? { short_url: r.short_url, url: r.url } : null;
        if (kendiKapak) {
          onizleme.src = r.url;
          onizleme.hidden = false;
          durum.textContent = "Yüklendi. Değiştirmek için yeniden seç.";
        } else {
          durum.textContent = "Yüklenemedi; bir daha dene.";
        }
      })
      .catch((err) => {
        durum.textContent = err?.jqXHR?.status === 413 ? "Görsel çok büyük; daha küçük bir görsel dene." : extractError(err);
      })
      .finally(() => {
        yukleniyor = null;
      });
    await yukleniyor;
  }

  // Tüm liste bağlantısı: adını ve görselini göster, ad boşsa listenin adını öner
  async function kaynakBak(uyar = false) {
    const input = form.elements.source;
    if (!input) {
      return;
    }
    const v = input.value.trim();
    const media = mediaFromUrl(v);
    const sira = ++kaynakSira;
    if (!media) {
      kaynak = null;
      kaynakKutu.hidden = true;
      if (listeSecenek) {
        listeSecenek.hidden = true;
        if (kapakTuru() === "liste") {
          kapakSec("kolaj");
        }
      }
      if (v && uyar) {
        msg.textContent = "Tüm liste bağlantısını tanıyamadım. Spotify ya da YouTube çalma listesi olmalı.";
      }
      return;
    }
    if (kaynak?.media.url === media.url) {
      return;
    }
    msg.textContent = "";
    const [j, c] = await Promise.all([oembed(media), coverFor(media)]);
    if (sira !== kaynakSira) {
      return;
    }
    kaynak = { media, title: String(j?.title || "").trim(), cover: c?.src || j?.thumbnail_url || "" };
    kaynakKutu.hidden = false;
    kaynakKutu.querySelector("strong").textContent = kaynak.title || "Tüm liste";
    kaynakKutu.querySelector("small").textContent = `${media.kind === "spotify" ? "Spotify" : "YouTube"} · ${TUR[media.type] || media.type}`;
    const img = kaynakKutu.querySelector("img");
    img.hidden = !kaynak.cover;
    if (kaynak.cover) {
      img.src = kaynak.cover;
    }
    if (listeSecenek) {
      listeSecenek.hidden = !kaynak.cover;
      listeSecenek.querySelector("span").textContent = `${media.kind === "spotify" ? "Spotify'daki" : "YouTube'daki"} kapağı`;
      if (kaynak.cover && !kapakElle) {
        kapakSec("liste");
      } else if (!kaynak.cover && kapakTuru() === "liste") {
        kapakSec("kolaj");
      }
    }
    const ad = form.elements.title;
    if (ad && kaynak.title && (!ad.value.trim() || !adElle)) {
      ad.value = kaynak.title;
    }
  }

  const close = () => {
    wrap.remove();
    document.removeEventListener("keydown", onKey);
  };
  const onKey = (e) => e.key === "Escape" && close();

  function draw() {
    list.innerHTML = items
      .map(
        (it, i) => `<li data-i="${i}">
          <span class="chorus-builder__no">${String(i + 1).padStart(2, "0")}</span>
          <div class="chorus-builder__cells">
            <input data-k="artist" value="${esc(it.artist)}" placeholder="Sanatçı" aria-label="Sanatçı">
            <input data-k="title" value="${esc(it.title)}" placeholder="Şarkı" aria-label="Şarkı">
            <input data-k="note" value="${esc(it.note)}" placeholder="Not (isteğe bağlı): neden bu şarkı?" aria-label="Not (isteğe bağlı)" class="chorus-builder__note">
            <small>${it.kind === "spotify" ? "Spotify" : "YouTube"} · ${esc(it.type)}</small>
          </div>
          <div class="chorus-builder__move">
            <button type="button" data-b="up" aria-label="Yukarı" ${i === 0 ? "disabled" : ""}>↑</button>
            <button type="button" data-b="down" aria-label="Aşağı" ${i === items.length - 1 ? "disabled" : ""}>↓</button>
            <button type="button" data-b="del" aria-label="Çıkar">×</button>
          </div>
        </li>`
      )
      .join("");
    wrap.querySelector(".chorus-builder__count").textContent = `${items.length} şarkı`;
  }

  async function add() {
    const urls = String(link.value || "").split(/\s+/).filter(Boolean);
    if (!urls.length) {
      return;
    }
    msg.textContent = "Bağlantıya bakılıyor…";
    let added = 0;
    for (const u of urls) {
      const media = mediaFromUrl(u);
      if (!media) {
        msg.textContent = "Bu bağlantıyı tanıyamadım. Spotify ya da YouTube bağlantısı olmalı.";
        continue;
      }
      const meta = await resolveMeta(media);
      items.push({ ...media, artist: meta.artist, title: meta.title, note: "" });
      added++;
    }
    link.value = "";
    draw();
    if (added) {
      const last = list.lastElementChild;
      const empty = last?.querySelector('input[data-k="artist"]:placeholder-shown') || last?.querySelector('input[data-k="note"]');
      msg.textContent = items[items.length - 1].artist ? "Eklendi. İstersen bir cümle not ekle." : "Eklendi. Sanatçının adını bulamadım; sen yaz.";
      empty?.focus();
    }
  }

  list.addEventListener("input", (e) => {
    const li = e.target.closest("li");
    const k = e.target.dataset.k;
    if (li && k) {
      items[Number(li.dataset.i)][k] = e.target.value;
    }
  });
  wrap.addEventListener("click", (e) => {
    if (e.target === wrap || e.target.closest(".chorus-card-dialog__close")) {
      return close();
    }
    const b = e.target.closest("[data-b]")?.dataset.b;
    const i = Number(e.target.closest("li")?.dataset.i);
    if (b === "add") {
      add();
    } else if (b === "up" && i > 0) {
      [items[i - 1], items[i]] = [items[i], items[i - 1]];
      draw();
    } else if (b === "down" && i < items.length - 1) {
      [items[i + 1], items[i]] = [items[i], items[i + 1]];
      draw();
    } else if (b === "del") {
      items.splice(i, 1);
      draw();
    } else if (b === "gorsel") {
      form.elements.gorsel?.click();
    }
  });
  form.addEventListener("change", (e) => {
    if (e.target.name === "kapakTuru") {
      kapakElle = true;
      kapakGoster();
      if (e.target.value === "kendi" && !kendiKapak && !yukleniyor) {
        form.elements.gorsel?.click();
      }
    } else if (e.target.name === "gorsel") {
      gorselSecildi(e.target.files?.[0]);
    }
  });
  link.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      add();
    }
  });
  link.addEventListener("paste", () => setTimeout(add, 50));

  const source = form.elements.source;
  if (source) {
    let bekle = null;
    source.addEventListener("input", () => {
      clearTimeout(bekle);
      bekle = setTimeout(() => kaynakBak(false), 400);
    });
    source.addEventListener("paste", () => setTimeout(() => kaynakBak(true), 50));
    source.addEventListener("change", () => kaynakBak(true));
  }
  form.elements.title?.addEventListener("input", (e) => (adElle = !!e.target.value.trim()));

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    // tüm liste yapıştırılır yapıştırılmaz gönderildiyse kapağını bekle
    const yeniKaynak = mode === "topic" ? mediaFromUrl(form.elements.source.value.trim()) : null;
    if (yeniKaynak && kaynak?.media.url !== yeniKaynak.url) {
      await kaynakBak(false);
    }
    const missing = items.findIndex((it) => !String(it.artist).trim() || !String(it.title).trim());
    if (mode === "topic" && !form.elements.title.value.trim()) {
      msg.textContent = "Listeye bir ad ver.";
      form.elements.title.focus();
      return;
    }
    const sourceText = mode === "topic" ? form.elements.source.value.trim() : "";
    const sourceMedia = mediaFromUrl(sourceText);
    if (sourceText && !sourceMedia) {
      msg.textContent = "Tüm liste bağlantısını tanıyamadım. Spotify ya da YouTube çalma listesi olmalı.";
      form.elements.source.focus();
      return;
    }
    // Tüm liste varsa şarkı eklemek isteğe bağlı
    if (!items.length && !sourceMedia) {
      msg.textContent = mode === "topic" ? "En az bir şarkı ya da tüm listenin bağlantısını ekle." : "En az bir şarkı ekle.";
      link.focus();
      return;
    }
    if (missing > -1) {
      msg.textContent = `${missing + 1}. şarkıda sanatçı ya da şarkı adı eksik.`;
      list.children[missing]?.querySelector("input")?.focus();
      return;
    }
    const lines = items.length ? itemsToMarkdown(items) : "";
    if (mode === "insert") {
      close();
      onDone?.({ markdown: `\n${lines}\n` });
      return;
    }
    const intro = form.elements.intro.value.trim();
    const sourceUrl = sourceMedia?.url || "";
    const ortak = !!form.elements.ortak?.checked;
    const curated = !!form.elements.curated?.checked;
    let kapak = "";
    const tur = kapakTuru();
    if (tur === "kendi") {
      if (yukleniyor) {
        msg.textContent = "Görsel yükleniyor…";
        await yukleniyor;
      }
      if (!kendiKapak) {
        msg.textContent = "Kendi görselini seç ya da başka bir kapak seç.";
        return;
      }
      kapak = `![${KAPAK_ALT}](${kendiKapak.short_url || kendiKapak.url})`;
    } else if (tur === "liste" && kaynak?.cover && kaynak.media.url === sourceUrl) {
      kapak = `![${KAPAK_ALT}](${kaynak.cover})`;
    }
    // Sıra: (gizli) kapak, giriş, tüm liste, şarkılar, davet
    const body = [
      kapak,
      intro && `**${curated ? "Bu seçki" : "Bu liste"} ne için?** ${intro}`,
      sourceUrl && (lines ? `Tüm liste bir arada:\n\n${sourceUrl}` : sourceUrl),
      lines,
      ortak ? "Bu ortak bir liste: sen de ekle. Konunun başındaki **+ Şarkı ekle** düğmesine bas, yanına neden burada olduğunu tek cümleyle yaz." : "Sen bu listeye ne eklerdin?",
    ]
      .filter(Boolean)
      .join("\n\n");
    close();
    onDone?.({
      title: form.elements.title.value.trim(),
      body,
      categoryId: curated ? CHORUS_SECKILERI : LISTELER,
      tags: ortak ? ["ortak-liste"] : [],
    });
  });

  document.addEventListener("keydown", onKey);
  document.body.appendChild(wrap);
  (form.elements.title || link).focus();
}
