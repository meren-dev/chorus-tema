// Chorus · Kepenk Radyosu'nun kuyruğu
// "Radyoya şarkı ekle" formu kuyruk konusuna tam doğru biçimde bir cevap yazar; elle biçim yazmak,
// yıldız kaçırmak (zengin yazı kutusu ** işaretini kaçışlı kaydediyor) ya da TASLAK/MİSAFİR satırını
// unutmak yok. Kepenk'in yayın akışı (Workflows › Kepenk Radyosu · yayın) bu biçimi okur:
//   [TASLAK ][MİSAFİR 2026-11-20 @kullanıcı + boş satır]bağlantı
//
//   **Sanatçı – Şarkı** · yıl, nereden
//   **Neden bilmiyorsun:** tek cümle            ← Kepenk'in not defterine bu satır gider
//   **Bağlam:** …                                (isteğe bağlı)
//   **Kulak ver:** 02:14'te …                    (isteğe bağlı)
// Kuyruk konusunda ekip için: üstte durum ve form düğmesi, her cevapta "Hazır" / "Taslağa çek".
// Sitedeki şarkılarda (liste satırı, oynatıcı, mini çalar) ekip için "Radyoya ekle" kısayolu.
import { ajax } from "discourse/lib/ajax";
import { extractError } from "discourse/lib/ajax-error";
import DiscourseURL from "discourse/lib/url";
import { mediaFromUrl, resolveMeta } from "./chorus-media";
import { el } from "./chorus-oyun";

let KUYRUK = 26;
let bildir = null; // toasts servisi (initializer verir)

export function kuyrukAyarla({ konu, toasts } = {}) {
  KUYRUK = Number(konu) || 26;
  bildir = toasts || null;
}

export function kuyrukKonusu() {
  return KUYRUK;
}

const BANDCAMP = /^https?:\/\/[\w-]+\.bandcamp\.com\/(track|album)\//i;
const ATLA = /^(TASLAK|ÇALDI|ÇALDİ|CALDI|MİSAFİR|MISAFIR)(?=[\s:]|$)/i;
const MISAFIR = /^(MİSAFİR|MISAFIR)\s+\d{4}-\d{2}-\d{2}\s+@[\w.-]+/i;

function temiz(s) {
  return String(s || "")
    .replace(/[\r\n]+/g, " ")
    .replace(/\*/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

// Formdaki alanlardan kuyruk cevabının metni
export function kuyrukMetni({ url, sanatci, sarki, kunye, neden, baglam, kulak, taslak, misafir }) {
  const ilk = misafir ? `MİSAFİR ${misafir.gun} @${misafir.kullanici}` : temiz(url);
  const satirlar = [`${taslak ? "TASLAK " : ""}${ilk}`];
  if (misafir) {
    satirlar.push("", temiz(url));
  }
  const k = temiz(kunye);
  satirlar.push("", `**${temiz(sanatci)} – ${temiz(sarki)}**${k ? ` · ${k}` : ""}`);
  satirlar.push(`**Neden bilmiyorsun:** ${temiz(neden)}`);
  if (temiz(baglam)) {
    satirlar.push(`**Bağlam:** ${temiz(baglam)}`);
  }
  if (temiz(kulak)) {
    satirlar.push(`**Kulak ver:** ${temiz(kulak)}`);
  }
  return satirlar.join("\n");
}

// Kuyruğun durumu: { hazir, taslak, misafir } (Kepenk'in kendi mesajları ve kural gönderisi hariç)
export async function kuyrukDurumu() {
  const t = await ajax(`/t/${KUYRUK}.json`);
  const ids = (t.post_stream?.stream || []).slice(1);
  const say = { hazir: 0, taslak: 0, misafir: 0 };
  for (let i = 0; i < ids.length; i += 50) {
    const r = await ajax(`/t/${KUYRUK}/posts.json`, { data: { post_ids: ids.slice(i, i + 50), include_raw: 1 } });
    (r.post_stream?.posts || []).forEach((p) => {
      if (p.post_type !== 1 || String(p.username).toLowerCase() === "kepenk") {
        return;
      }
      const raw = String(p.raw || "").trimStart();
      if (/^TASLAK/i.test(raw)) {
        say.taslak++;
      } else if (MISAFIR.test(raw)) {
        say.misafir++;
      } else if (!ATLA.test(raw)) {
        say.hazir++;
      }
    });
  }
  return say;
}

function durumMetni(d) {
  if (!d) {
    return "";
  }
  const parca = [`kuyrukta hazır ${d.hazir} şarkı`];
  if (d.taslak) {
    parca.push(`${d.taslak} taslak`);
  }
  if (d.misafir) {
    parca.push(`${d.misafir} misafir günü`);
  }
  const gun = d.hazir ? Math.ceil(d.hazir / 3) : 0;
  return `${parca.join(" · ")}${d.hazir ? ` · yaklaşık ${gun} günlük` : " · radyo susacak"}`;
}

function yarin() {
  const d = new Date(Date.now() + 864e5);
  const p = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Istanbul", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
  return p; // YYYY-MM-DD
}

/**
 * Radyoya şarkı ekle penceresi.
 * on: { url, artist, title } ile önceden doldurulabilir (sitedeki kısayollar).
 */
export function openRadyoForm({ on = {} } = {}) {
  document.querySelector(".chorus-radyo-form")?.remove();
  const wrap = el("div", "chorus-card-dialog chorus-builder chorus-radyo-form");
  wrap.setAttribute("role", "dialog");
  wrap.setAttribute("aria-modal", "true");
  wrap.setAttribute("aria-label", "Radyoya şarkı ekle");
  wrap.innerHTML = `
    <form class="chorus-card-dialog__panel chorus-builder__panel" novalidate>
      <button type="button" class="chorus-card-dialog__close" aria-label="Kapat">×</button>
      <div class="chorus-card-dialog__label">KEPENK RADYOSU · KUYRUK</div>
      <p class="chorus-radyo-form__durum" aria-live="polite">Kuyruğa bakılıyor…</p>
      <label class="chorus-builder__field"><span>Şarkının bağlantısı <small>Spotify, YouTube ya da Bandcamp</small></span><input name="url" type="url" placeholder="https://open.spotify.com/track/..." autocomplete="off" required></label>
      <p class="chorus-radyo-form__kaynak" aria-live="polite"></p>
      <div class="chorus-radyo-form__iki">
        <label class="chorus-builder__field"><span>Sanatçı</span><input name="sanatci" type="text" maxlength="120" required></label>
        <label class="chorus-builder__field"><span>Şarkı</span><input name="sarki" type="text" maxlength="160" required></label>
      </div>
      <label class="chorus-builder__field"><span>Künye <small>isteğe bağlı · yıl, nereden</small></span><input name="kunye" type="text" maxlength="80" placeholder="1969, İngiltere"></label>
      <label class="chorus-builder__field"><span>Neden bilmiyorsun? <small>tek cümle · Kepenk'in notu olur</small></span><textarea name="neden" rows="2" maxlength="220" placeholder="Nick Drake'in akustik olmayan tek şarkısı."></textarea></label>
      <details class="chorus-radyo-form__daha">
        <summary>Bağlam ve Kulak ver <small>isteğe bağlı</small></summary>
        <label class="chorus-builder__field"><span>Bağlam <small>kim, nerede, nasıl kaydedildi · 1–2 cümle</small></span><textarea name="baglam" rows="2" maxlength="360"></textarea></label>
        <label class="chorus-builder__field"><span>Kulak ver <small>bir an · 02:14'te…</small></span><input name="kulak" type="text" maxlength="140" placeholder="02:14'te yaylılar giriyor"></label>
      </details>
      <label class="chorus-builder__check"><input name="taslak" type="checkbox"> Taslak: henüz hazır değil, Kepenk atlasın</label>
      <label class="chorus-builder__check"><input name="misafir" type="checkbox"> Misafir küratör günü</label>
      <div class="chorus-radyo-form__misafir" hidden>
        <label class="chorus-builder__field"><span>Gün <small>o günün 19:00 şarkısı olur</small></span><input name="gun" type="date"></label>
        <label class="chorus-builder__field"><span>Küratör <small>kullanıcı adı</small></span><input name="kullanici" type="text" placeholder="@kullanıcı" autocomplete="off"></label>
      </div>
      <p class="chorus-builder__msg" aria-live="polite"></p>
      <div class="chorus-builder__foot">
        <a class="chorus-radyo-form__kuyruk" href="/t/${KUYRUK}">Kuyruğu gör</a>
        <button type="submit" class="btn btn-primary">Kuyruğa ekle</button>
      </div>
    </form>`;
  const form = wrap.querySelector("form");
  const f = form.elements;
  const msg = wrap.querySelector(".chorus-builder__msg");
  const kaynak = wrap.querySelector(".chorus-radyo-form__kaynak");
  const durum = wrap.querySelector(".chorus-radyo-form__durum");
  const misafirKutu = wrap.querySelector(".chorus-radyo-form__misafir");
  f.gun.value = yarin();

  const close = () => {
    wrap.remove();
    document.removeEventListener("keydown", onKey);
  };
  const onKey = (e) => e.key === "Escape" && close();

  kuyrukDurumu()
    .then((d) => (durum.textContent = durumMetni(d)))
    .catch(() => (durum.textContent = ""));

  let sira = 0;
  async function bak() {
    const v = f.url.value.trim();
    const media = mediaFromUrl(v);
    const benim = ++sira;
    if (!v) {
      kaynak.textContent = "";
      return;
    }
    if (BANDCAMP.test(v)) {
      kaynak.textContent = "Bandcamp: sanatçıyı ve şarkıyı sen yaz. Radyoda çalar, mini çalara girmez.";
      return;
    }
    if (!media) {
      kaynak.textContent = /^https?:\/\//.test(v) ? "Bu bağlantıyı tanıyamadım. Spotify, YouTube ya da Bandcamp olmalı." : "";
      return;
    }
    kaynak.textContent = "Bağlantıya bakılıyor…";
    const meta = await resolveMeta(media);
    if (benim !== sira) {
      return;
    }
    if (meta.artist && !f.sanatci.value.trim()) {
      f.sanatci.value = meta.artist;
    }
    if (meta.title && !f.sarki.value.trim()) {
      f.sarki.value = meta.title;
    }
    kaynak.textContent = `${media.kind === "spotify" ? "Spotify" : "YouTube"} · ${meta.artist || meta.title ? "adı geldi, kontrol et" : "adını bulamadım, sen yaz"}`;
  }
  let bekle = null;
  f.url.addEventListener("input", () => {
    clearTimeout(bekle);
    bekle = setTimeout(bak, 400);
  });
  f.url.addEventListener("paste", () => setTimeout(bak, 50));
  f.misafir.addEventListener("change", () => (misafirKutu.hidden = !f.misafir.checked));

  if (on.url) {
    f.url.value = on.url;
    f.sanatci.value = on.artist && on.artist !== "Tüm liste" ? on.artist : "";
    f.sarki.value = on.title || "";
    bak();
  }

  wrap.addEventListener("click", (e) => {
    if (e.target === wrap || e.target.closest(".chorus-card-dialog__close")) {
      close();
    }
  });

  let gidiyor = false;
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (gidiyor) {
      return;
    }
    const url = f.url.value.trim();
    if (!/^https?:\/\/\S+$/i.test(url) || !(mediaFromUrl(url) || BANDCAMP.test(url))) {
      msg.textContent = "Spotify, YouTube ya da Bandcamp bağlantısını yapıştır.";
      f.url.focus();
      return;
    }
    if (!temiz(f.sanatci.value) || !temiz(f.sarki.value)) {
      msg.textContent = "Sanatçı ve şarkı adı gerekli.";
      (temiz(f.sanatci.value) ? f.sarki : f.sanatci).focus();
      return;
    }
    if (temiz(f.neden.value).split(" ").filter(Boolean).length < 3) {
      msg.textContent = "Neden bilmiyorsun? Tek cümle yeter; Kepenk'in notu bu olacak.";
      f.neden.focus();
      return;
    }
    let misafir = null;
    if (f.misafir.checked) {
      const gun = f.gun.value;
      const kullanici = f.kullanici.value.trim().replace(/^@/, "");
      if (!/^\d{4}-\d{2}-\d{2}$/.test(gun) || !/^[\w.-]+$/.test(kullanici)) {
        msg.textContent = "Misafir günü için günü ve küratörün kullanıcı adını yaz.";
        (!/^\d{4}-\d{2}-\d{2}$/.test(gun) ? f.gun : f.kullanici).focus();
        return;
      }
      misafir = { gun, kullanici };
    }
    const raw = kuyrukMetni({
      url,
      sanatci: f.sanatci.value,
      sarki: f.sarki.value,
      kunye: f.kunye.value,
      neden: f.neden.value,
      baglam: f.baglam.value,
      kulak: f.kulak.value,
      taslak: f.taslak.checked,
      misafir,
    });
    gidiyor = true;
    msg.textContent = "Kuyruğa yazılıyor…";
    try {
      const r = await ajax("/posts.json", { type: "POST", data: { topic_id: KUYRUK, raw } });
      close();
      const no = r?.post_number;
      let d = null;
      try {
        d = await kuyrukDurumu();
      } catch {
        // durum okunamazsa yalnızca eklendi deriz
      }
      const ne = misafir ? `Misafir günü kuruldu: ${misafir.gun}, @${misafir.kullanici}.` : f.taslak.checked ? "Taslak olarak eklendi; hazır olunca kuyrukta “Hazır”a bas." : "Kuyruğa eklendi.";
      bildir?.success?.({
        duration: 8000,
        data: {
          message: d ? `${ne} ${durumMetni(d).replace(/^k/, "K")}.` : ne,
          actions: no
            ? [{ label: "Kuyruğa git →", class: "btn-default btn-small", action: ({ close: kapat }) => (kapat?.(), DiscourseURL.routeTo(`/t/${KUYRUK}/${no}`)) }]
            : [],
        },
      });
    } catch (err) {
      gidiyor = false;
      msg.textContent = extractError(err);
    }
  });

  document.addEventListener("keydown", onKey);
  document.body.appendChild(wrap);
  (on.url ? f.neden : f.url).focus();
}

// Sitedeki bir şarkı için "Radyoya ekle" düğmesi (yalnızca ekip; çağıran kontrol eder)
export function radyoyaEkleDugmesi(item, sinif = "") {
  const b = el("button", `chorus-radyoya${sinif ? ` ${sinif}` : ""}`, "Radyoya ekle");
  b.type = "button";
  b.title = "Kepenk Radyosu'nun kuyruğuna ekle";
  b.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    openRadyoForm({ on: item });
  });
  return b;
}

async function hamMetin(postId) {
  const p = await ajax(`/posts/${postId}.json`);
  return String(p?.raw || "");
}

async function hamDegistir(postId, degistir, neden) {
  const raw = await hamMetin(postId);
  const yeni = degistir(raw);
  if (yeni === raw) {
    return;
  }
  await ajax(`/posts/${postId}.json`, { type: "PUT", data: { post: { raw: yeni, edit_reason: neden } } });
}

// Kuyruk konusunda ekip için süsler: ilk gönderide durum + form; cevaplarda Hazır / Taslağa çek
export function kuyrukSusle(elem, post) {
  if (!post || post.topic_id !== KUYRUK || elem.querySelector(".chorus-kuyruk-arac, .chorus-kuyruk-durum")) {
    return;
  }
  if (post.post_number === 1) {
    const kutu = el("div", "chorus-kuyruk-arac");
    const bilgi = el("p", "chorus-kuyruk-arac__durum", "Kuyruğa bakılıyor…");
    const ekle = el("button", "btn btn-primary", "+ Radyoya şarkı ekle");
    ekle.type = "button";
    ekle.addEventListener("click", () => openRadyoForm());
    kutu.append(bilgi, ekle, el("p", "chorus-kuyruk-arac__not", "Biçimi form yazar; aşağıdaki kuralları elle uygulamana gerek yok. Taslakları ve misafir günlerini de form kurar."));
    elem.prepend(kutu);
    kuyrukDurumu()
      .then((d) => (bilgi.textContent = durumMetni(d)))
      .catch(() => (bilgi.textContent = ""));
    return;
  }
  if (String(post.username || "").toLowerCase() === "kepenk") {
    return;
  }
  const bas = (elem.textContent || "").trimStart();
  let dugme = null;
  if (/^TASLAK/i.test(bas)) {
    dugme = el("button", "btn btn-small btn-primary", "Hazır, kuyruğa al");
    dugme.addEventListener("click", async () => {
      dugme.disabled = true;
      try {
        await hamDegistir(post.id, (r) => r.replace(/^\s*TASLAK[\s:]*/i, ""), "Kuyruk: hazır");
        dugme.textContent = "Kuyrukta";
      } catch (err) {
        dugme.disabled = false;
        dugme.textContent = extractError(err);
      }
    });
  } else if (!ATLA.test(bas)) {
    dugme = el("button", "btn btn-small", "Taslağa çek");
    dugme.addEventListener("click", async () => {
      dugme.disabled = true;
      try {
        await hamDegistir(post.id, (r) => `TASLAK ${r.replace(/^\s+/, "")}`, "Kuyruk: taslağa çekildi");
        dugme.textContent = "Taslakta";
      } catch (err) {
        dugme.disabled = false;
        dugme.textContent = extractError(err);
      }
    });
  }
  const durumEtiketi = /^TASLAK/i.test(bas) ? "TASLAK" : /^ÇALD[Iİ]|^CALDI/i.test(bas) ? "ÇALDI" : MISAFIR.test(bas) ? "MİSAFİR" : "SIRADA";
  const satir = el("div", "chorus-kuyruk-durum");
  satir.append(el("span", `chorus-kuyruk-durum__etiket is-${durumEtiketi === "SIRADA" ? "sirada" : durumEtiketi === "ÇALDI" ? "caldi" : "bekliyor"}`, durumEtiketi));
  if (dugme) {
    dugme.type = "button";
    satir.append(dugme);
  }
  elem.appendChild(satir);
}
