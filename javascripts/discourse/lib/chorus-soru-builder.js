// Chorus · Günün Sorusu penceresi
// "Yeni konu" (Günün Sorusu) iki biçimli şablon yerine kısa bir pencere açar:
//   biçim (Biliyor muydun? / Sen ne dersin?), soru, 2-5 seçenek (doğru olana dokunulur), Kepenk'in notu, şarkı.
// Yazı kutusuna yalnızca seçilen biçim gelir (chorus-soru.js ikisini de tanır).
// Ekip için yayın saati: konu ekip içinde açılır, kaydedilince "Günün Sorusu'na taşı" zamanlayıcısı
// kendiliğinden kurulur (varsayılan sıradaki hafta içi 10:00, İstanbul saati).
// Biçim yayın gününe göre önerilir: Pazartesi, Çarşamba, Cuma Biliyor muydun?; Salı, Perşembe Sen ne dersin?
import { ajax } from "discourse/lib/ajax";
import { mediaFromUrl, resolveMeta } from "./chorus-media";

export const EKIP = 3; // Staff kategorisi: soru yayın saatine kadar burada bekler
const SAAT = "10:00";
const TR = "+03:00"; // İstanbul (yaz saati yok)
const EN_AZ = 2;
const EN_COK = 5;
const BICIM = {
  bilgi: { ad: "Biliyor muydun?", alt: "doğru cevabı var; not oy verince açılır", not: "Kepenk: doğrusu bu, çünkü… (bir iki cümle)" },
  anket: { ad: "Sen ne dersin?", alt: "doğru cevabı yok; oy verince sonuç görünür", not: "Tek cümle, Kepenk'in ağzından." },
};
const GUNLER = ["Pazar", "Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma", "Cumartesi"];
const AYLAR = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"];

function esc(s) {
  return String(s || "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
}

// İstanbul'da bugünün tarihi ve saati
function istanbul(d = new Date()) {
  const p = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Istanbul", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(d);
  const g = (t) => p.find((x) => x.type === t)?.value;
  return { gun: `${g("year")}-${g("month")}-${g("day")}`, saat: `${g("hour")}:${g("minute")}` };
}

function haftaGunu(gun) {
  return new Date(`${gun}T12:00:00${TR}`).getUTCDay();
}

function gunEkle(gun, n) {
  return new Date(new Date(`${gun}T12:00:00${TR}`).getTime() + n * 864e5).toISOString().slice(0, 10);
}

// Sıradaki hafta içi 10:00 (bugün 10:00 geçmediyse bugün)
export function siradakiGun(simdi = new Date()) {
  const s = istanbul(simdi);
  let gun = s.saat < SAAT ? s.gun : gunEkle(s.gun, 1);
  while ([0, 6].includes(haftaGunu(gun))) {
    gun = gunEkle(gun, 1);
  }
  return gun;
}

export function onerilenBicim(gun) {
  return [1, 3, 5].includes(haftaGunu(gun)) ? "bilgi" : "anket";
}

function okunur(gun, saat) {
  const d = new Date(`${gun}T12:00:00${TR}`);
  return `${Number(gun.slice(8, 10))} ${AYLAR[d.getUTCMonth()]} ${GUNLER[haftaGunu(gun)]} ${saat}`;
}

// Seçilen biçimin gövdesi: tek anket, altında Kepenk'in notu ve şarkı
export function soruGovdesi({ bicim, secenekler, dogru, not, sarki }) {
  const anket = ["[poll type=regular results=on_vote chartType=bar]", ...secenekler.map((s) => `* ${s}`), "[/poll]"].join("\n");
  const ic = [not, sarki].filter(Boolean).join("\n\n");
  if (bicim === "bilgi") {
    return `${anket}\n\n[wrap=bilgi dogru="${dogru + 1}"]\n${ic}\n[/wrap]\n`;
  }
  return ic ? `${anket}\n\n[details="Kepenk'in notu"]\n${ic}\n[/details]\n` : `${anket}\n`;
}

/**
 * zamanla: ekip için yayın günü ve saati sorulur.
 * onDone({ title, body, zaman }) — zaman: ISO tarih (zamanlanmadıysa null)
 */
export function openSoruBuilder({ zamanla = false, onDone }) {
  document.querySelector(".chorus-builder")?.remove();
  const ilkGun = siradakiGun();
  let bicim = onerilenBicim(ilkGun);
  let bicimElle = false;
  let dogru = -1;
  const secenekler = ["", "", ""];

  const wrap = document.createElement("div");
  wrap.className = "chorus-card-dialog chorus-builder chorus-soru-builder";
  wrap.setAttribute("role", "dialog");
  wrap.setAttribute("aria-modal", "true");
  wrap.setAttribute("aria-label", "Günün Sorusu");
  wrap.innerHTML = `
    <form class="chorus-card-dialog__panel chorus-builder__panel" novalidate>
      <button type="button" class="chorus-card-dialog__close" aria-label="Kapat">×</button>
      <div class="chorus-card-dialog__label">GÜNÜN SORUSU</div>
      ${
        zamanla
          ? `<div class="chorus-builder__field"><span>Yayın <small>İstanbul saati</small></span>
               <div class="chorus-soru-builder__zaman"><input name="gun" type="date" value="${ilkGun}" required><input name="saat" type="time" value="${SAAT}" required></div>
               <small class="chorus-soru-builder__not">Konu ekip içinde açılır, bu saatte kendiliğinden Günün Sorusu'na geçer.</small></div>`
          : ""
      }
      <div class="chorus-builder__field"><span>Biçim</span>
        <div class="chorus-soru-builder__bicim" role="radiogroup" aria-label="Biçim">
          ${Object.entries(BICIM)
            .map(([k, b]) => `<button type="button" role="radio" data-bicim="${k}"><strong>${b.ad}</strong><small>${b.alt}</small></button>`)
            .join("")}
        </div>
      </div>
      <label class="chorus-builder__field"><span>Soru <small>konunun başlığı olur, ana sayfada da görünür</small></span><input name="soru" type="text" maxlength="200" placeholder="Bu şarkı hangi filmde çalıyordu?" required></label>
      <div class="chorus-builder__field"><span>Seçenekler <small class="chorus-soru-builder__ipucu"></small></span>
        <ol class="chorus-soru-builder__secenekler"></ol>
        <button type="button" class="btn btn-small chorus-soru-builder__ekle" data-b="ekle">+ Seçenek ekle</button>
      </div>
      <label class="chorus-builder__field"><span>Kepenk'in notu <small class="chorus-soru-builder__notipucu"></small></span><textarea name="not" rows="2" maxlength="600"></textarea></label>
      <label class="chorus-builder__field"><span>Şarkı <small>isteğe bağlı · Spotify ya da YouTube bağlantısı</small></span><input name="sarki" type="url" placeholder="https://open.spotify.com/track/..." autocomplete="off"></label>
      <p class="chorus-soru-builder__sarki" aria-live="polite"></p>
      <p class="chorus-builder__msg" aria-live="polite"></p>
      <div class="chorus-builder__foot">
        <span class="chorus-builder__count"></span>
        <button type="submit" class="btn btn-primary">Yazı kutusuna aktar</button>
      </div>
    </form>`;

  const form = wrap.querySelector("form");
  const liste = wrap.querySelector(".chorus-soru-builder__secenekler");
  const msg = wrap.querySelector(".chorus-builder__msg");
  const sayac = wrap.querySelector(".chorus-builder__count");
  const sarkiBilgi = wrap.querySelector(".chorus-soru-builder__sarki");

  const close = () => {
    wrap.remove();
    document.removeEventListener("keydown", onKey);
  };
  const onKey = (e) => e.key === "Escape" && close();

  function ciz() {
    wrap.querySelectorAll("[data-bicim]").forEach((b) => {
      const on = b.dataset.bicim === bicim;
      b.classList.toggle("is-secili", on);
      b.setAttribute("aria-checked", on ? "true" : "false");
    });
    const bilgi = bicim === "bilgi";
    wrap.querySelector(".chorus-soru-builder__ipucu").textContent = bilgi ? "doğru olanın yanındaki daireye dokun" : `${EN_AZ}-${EN_COK} seçenek`;
    wrap.querySelector(".chorus-soru-builder__notipucu").textContent = bilgi ? "oy verene kadar kapalı" : "isteğe bağlı · oydan sonra okunur";
    form.elements.not.placeholder = BICIM[bicim].not;
    liste.innerHTML = secenekler
      .map(
        (s, i) => `<li data-i="${i}" class="${bilgi && dogru === i ? "is-dogru" : ""}">
          ${bilgi ? `<button type="button" class="chorus-soru-builder__dogru" data-b="dogru" role="radio" aria-checked="${dogru === i}" aria-label="${i + 1}. seçenek doğru">${dogru === i ? "✓" : ""}</button>` : `<span class="chorus-soru-builder__no">${i + 1}</span>`}
          <input data-i="${i}" value="${esc(s)}" maxlength="120" placeholder="${i + 1}. seçenek" aria-label="${i + 1}. seçenek">
          <button type="button" class="chorus-soru-builder__sil" data-b="sil" aria-label="Seçeneği çıkar" ${secenekler.length <= EN_AZ ? "disabled" : ""}>×</button>
        </li>`
      )
      .join("");
    wrap.querySelector(".chorus-soru-builder__ekle").hidden = secenekler.length >= EN_COK;
    if (zamanla) {
      const gun = form.elements.gun.value;
      sayac.textContent = gun ? okunur(gun, form.elements.saat.value || SAAT) : "";
    }
  }

  wrap.addEventListener("click", (e) => {
    if (e.target === wrap || e.target.closest(".chorus-card-dialog__close")) {
      return close();
    }
    const b = e.target.closest("[data-bicim]");
    if (b) {
      bicim = b.dataset.bicim;
      bicimElle = true;
      ciz();
      return;
    }
    const eylem = e.target.closest("[data-b]")?.dataset.b;
    const i = Number(e.target.closest("li")?.dataset.i);
    if (eylem === "ekle" && secenekler.length < EN_COK) {
      secenekler.push("");
      ciz();
      liste.querySelector("li:last-child input")?.focus();
    } else if (eylem === "sil" && secenekler.length > EN_AZ) {
      secenekler.splice(i, 1);
      dogru = dogru === i ? -1 : dogru > i ? dogru - 1 : dogru;
      ciz();
    } else if (eylem === "dogru") {
      dogru = i;
      ciz();
      liste.querySelector(`input[data-i="${i}"]`)?.focus();
    }
  });
  liste.addEventListener("input", (e) => {
    const i = Number(e.target.dataset.i);
    if (!Number.isNaN(i)) {
      secenekler[i] = e.target.value;
    }
  });
  // Yayın günü değişince (biçimi kişi seçmediyse) o günün biçimi önerilir
  form.elements.gun?.addEventListener("change", () => {
    if (!bicimElle && form.elements.gun.value) {
      bicim = onerilenBicim(form.elements.gun.value);
    }
    ciz();
  });
  form.elements.saat?.addEventListener("change", ciz);

  let sarkiSira = 0;
  async function sarkiBak() {
    const v = form.elements.sarki.value.trim();
    const media = mediaFromUrl(v);
    const benim = ++sarkiSira;
    if (!v) {
      sarkiBilgi.textContent = "";
      return;
    }
    if (!media) {
      sarkiBilgi.textContent = "Bu bağlantıyı tanıyamadım. Spotify ya da YouTube olmalı.";
      return;
    }
    sarkiBilgi.textContent = "Şarkıya bakılıyor…";
    const m = await resolveMeta(media);
    if (benim === sarkiSira) {
      sarkiBilgi.textContent = [m.artist, m.title].filter(Boolean).join(" · ") || "Şarkı bulundu.";
    }
  }
  form.elements.sarki.addEventListener("change", sarkiBak);
  form.elements.sarki.addEventListener("paste", () => setTimeout(sarkiBak, 50));

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const soru = form.elements.soru.value.replace(/\s+/g, " ").trim();
    const temiz = secenekler.map((s) => s.replace(/\s+/g, " ").replace(/^[*\-•\d.)\s]+/, "").trim());
    const dolu = temiz.filter(Boolean);
    const not = form.elements.not.value.trim();
    const sarkiUrl = form.elements.sarki.value.trim();
    const hata = (metin, odak) => {
      msg.textContent = metin;
      odak?.focus();
    };
    if (soru.length < 6) {
      return hata("Soruyu yaz (en az birkaç kelime).", form.elements.soru);
    }
    if (dolu.length < EN_AZ) {
      return hata(`En az ${EN_AZ} seçenek yaz.`, liste.querySelector("input"));
    }
    if (new Set(dolu.map((s) => s.toLocaleLowerCase("tr-TR"))).size !== dolu.length) {
      return hata("İki seçenek aynı olamaz.", liste.querySelector("input"));
    }
    let dogruSira = -1;
    if (bicim === "bilgi") {
      if (dogru < 0 || !temiz[dogru]) {
        return hata("Doğru seçeneği işaretle (yanındaki daire).", liste.querySelector(".chorus-soru-builder__dogru"));
      }
      // boş bırakılan seçenekler atlanır; doğru seçeneğin sırası buna göre sayılır
      dogruSira = temiz.slice(0, dogru).filter(Boolean).length;
      if (!not) {
        return hata("Kepenk'in notunu yaz: oy verince açılan kısım bu.", form.elements.not);
      }
    }
    if (sarkiUrl && !mediaFromUrl(sarkiUrl)) {
      return hata("Şarkı bağlantısını tanıyamadım. Spotify ya da YouTube olmalı.", form.elements.sarki);
    }
    let zaman = null;
    if (zamanla) {
      const gun = form.elements.gun.value;
      const saat = form.elements.saat.value || SAAT;
      if (!gun) {
        return hata("Yayın gününü seç.", form.elements.gun);
      }
      const t = new Date(`${gun}T${saat}:00${TR}`);
      if (Number.isNaN(t.getTime()) || t.getTime() < Date.now() + 60 * 1000) {
        return hata("Yayın zamanı geçmişte kalıyor; ileri bir gün ya da saat seç.", form.elements.gun);
      }
      zaman = t.toISOString();
    }
    close();
    onDone?.({
      title: soru,
      body: soruGovdesi({ bicim, secenekler: dolu, dogru: dogruSira, not, sarki: mediaFromUrl(sarkiUrl)?.url || "" }),
      zaman,
    });
  });

  document.addEventListener("keydown", onKey);
  document.body.appendChild(wrap);
  ciz();
  form.elements.soru.focus();
}

// Ekip içinde açılan soru kaydedilince "Günün Sorusu'na taşı" zamanlayıcısını kur
let bekleyen = null;

export function soruBekliyor(title, zaman, kategori) {
  bekleyen = title && zaman ? { title, zaman, kategori, at: Date.now() } : null;
}

export async function soruZamanla(createdPost, composerModel, { toasts, dialog } = {}) {
  const b = bekleyen;
  const topicId = createdPost?.topic_id;
  if (!b || !topicId || Date.now() - b.at > 6 * 3600 * 1000) {
    return;
  }
  if (String(composerModel?.title || "").trim() !== b.title) {
    return;
  }
  bekleyen = null;
  try {
    await ajax(`/t/${topicId}/timer`, {
      type: "POST",
      data: { time: b.zaman, status_type: "publish_to_category", category_id: b.kategori, based_on_last_post: false },
    });
    const gun = istanbul(new Date(b.zaman));
    toasts?.success?.({ duration: 6000, data: { message: `Zamanlandı: ${okunur(gun.gun, gun.saat)}'da Günün Sorusu'na geçecek.` } });
  } catch {
    dialog?.alert?.("Soru kaydedildi ama yayın zamanlayıcısı kurulamadı. Konunun ⋯ menüsünden \"Zamanlayıcı\" ile elle kur.");
  }
}
