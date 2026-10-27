// Chorus · Kör Dinleme oyunu
// [wrap=kor-dinleme sanatci="…" sarki="…"] … şarkı bağlantısı … [/wrap]
// Günde bir şarkı. Önce 1 saniye çalar; her yanlış ya da "geç" kesiti uzatır (1, 2, 4, 7, 11, 16 sn).
// Altı hakta şarkıyı bul. Sanatçıyı bilmek sarı kare, şarkıyı bilmek yeşil.
// Oyun sürerken şarkının kendi oynatıcısı gizli (common.scss); ses yalnızca kesitlerden gelir.
// Bitince şarkı açılır; sonra tek kelimeyle ne hissettirdiğini yazarsın, başkalarının kelimeleri de açılır.
import { mediaFromUrl } from "./chorus-media";
import { kesitCal, kesitDurdur, onizlemeBul } from "./chorus-onizleme";
import { playQueue } from "./chorus-queue";
import { benziyor, dugme, el, kisaTarih, oku, paylas, yaz } from "./chorus-oyun";

const SURELER = [1, 2, 4, 7, 11, 16];
const KARE = { gec: "⬛", yanlis: "🟥", sanatci: "🟨", dogru: "🟩", bos: "⬜" };

function anahtar(topicId) {
  return `chorus-kor-oyun-${topicId}`;
}

// kalici = false: ekip denemesi; sonuç bu tarayıcıya yazılmaz, konuya her girişte baştan başlar
export function korOyunu(wrap, { topic, user, cevapYaz, acildi, kalici = true }) {
  const sanatci = wrap.dataset.sanatci || "";
  const sarki = wrap.dataset.sarki || "";
  if (!sanatci || !sarki || wrap.dataset.korOyun) {
    return false;
  }
  wrap.dataset.korOyun = "1";
  const link = [...wrap.querySelectorAll("a[href], iframe[src]")].map((a) => mediaFromUrl(a.getAttribute("href") || a.getAttribute("src"))).find(Boolean);
  const bos = { denemeler: [], bitti: false, kazandi: false };
  const kayit = kalici ? oku(anahtar(topic?.id), bos) : bos;

  const kutu = el("div", "chorus-kor-oyun");
  wrap.after(kutu);

  const ust = el("div", "chorus-kor-oyun__ust");
  ust.append(el("span", "chorus-kor-oyun__etiket", "KÖR DİNLEME · BUGÜNÜN ŞARKISI"));
  const kareler = el("span", "chorus-kor-oyun__kareler");
  ust.append(kareler);
  const ipucu = el("p", "chorus-kor-oyun__ipucu");
  const cubuk = el("div", "chorus-kor-oyun__cubuk");
  SURELER.forEach((s) => {
    const p = el("span", "chorus-kor-oyun__dilim");
    p.style.flexGrow = String(s);
    cubuk.append(p);
  });
  const dinle = dugme("btn btn-primary chorus-kor-oyun__dinle", "▶ 1 saniye dinle");
  const form = el("form", "chorus-kor-oyun__form");
  const girdi = el("input", "chorus-kor-oyun__girdi");
  girdi.type = "text";
  girdi.placeholder = "Şarkının adı ya da sanatçı";
  girdi.setAttribute("aria-label", "Tahminin");
  girdi.autocomplete = "off";
  const tahmin = el("button", "btn chorus-kor-oyun__tahmin", "Tahmin et");
  tahmin.type = "submit";
  const gec = dugme("btn btn-flat chorus-kor-oyun__gec", "Geç, biraz daha çal");
  form.append(girdi, tahmin, gec);
  const liste = el("ol", "chorus-kor-oyun__liste");
  const son = el("div", "chorus-kor-oyun__son");
  kutu.append(ust, ipucu, cubuk, dinle, form, liste, son);

  let onizleme = null;
  let calan = false;

  const adim = () => Math.min(kayit.denemeler.length, SURELER.length - 1);
  const sure = () => (kayit.bitti ? 30 : SURELER[adim()]);

  function kaydet() {
    if (kalici) {
      yaz(anahtar(topic?.id), kayit);
    }
  }

  function ciz() {
    const a = adim();
    kareler.textContent = SURELER.map((_, i) => KARE[kayit.denemeler[i]?.sonuc] || KARE.bos).join("");
    [...cubuk.children].forEach((d, i) => d.classList.toggle("is-acik", kayit.bitti || i <= a));
    dinle.textContent = calan ? "■ Durdur" : kayit.bitti ? "▶ 30 saniyeyi dinle" : `▶ ${sure()} saniye dinle`;
    liste.replaceChildren(
      ...kayit.denemeler.map((d) => {
        const li = el("li", `is-${d.sonuc}`);
        li.append(el("span", "chorus-kor-oyun__kare", KARE[d.sonuc]));
        li.append(el("span", null, d.sonuc === "gec" ? "Geçtin" : d.metin));
        if (d.sonuc === "sanatci") {
          li.append(el("em", null, "sanatçı doğru"));
        }
        return li;
      })
    );
    form.hidden = kayit.bitti;
    ipucu.textContent = kayit.bitti
      ? ""
      : onizleme === false
        ? "Bu şarkının kısa kesiti bulunamadı. Bugün eski usul: aşağıdan dinle, tek kelime yaz."
        : kayit.denemeler.length
          ? `${SURELER.length - kayit.denemeler.length} hakkın kaldı. Her yanlış kesiti biraz uzatır.`
          : "Altı hakkın var. Önce bir saniye. Yanlış ya da geç dersen kesit uzar.";
    if (kayit.bitti) {
      bitir();
    }
  }

  function sonucMetni() {
    const gun = kisaTarih(topic?.created_at ? new Date(topic.created_at).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10));
    const kareMetin = kayit.denemeler.map((d) => KARE[d.sonuc]).join("") + KARE.bos.repeat(Math.max(0, SURELER.length - kayit.denemeler.length));
    return `Chorus · Kör Dinleme ${gun}\n🔇 ${kareMetin}\n${window.location.host}/t/${topic?.id || ""}`;
  }

  function bitir() {
    if (son.dataset.cizildi) {
      return;
    }
    son.dataset.cizildi = "1";
    wrap.classList.remove("is-locked");
    acildi?.();
    const baslik = el("p", "chorus-kor-oyun__sonuc");
    baslik.textContent = kayit.kazandi
      ? `Buldun: ${sanatci} · ${sarki}`
      : `Bu sefer olmadı. Şarkı: ${sanatci} · ${sarki}`;
    const satir = el("div", "chorus-kor-oyun__eylem");
    if (link) {
      satir.append(dugme("chorus-play-all", "▶ Tamamını dinle", () => playQueue([{ ...link, artist: sanatci, title: sarki }], 0, topic ? { title: topic.title, url: `/t/${topic.slug}/${topic.id}` } : null)));
    }
    const p = dugme("btn btn-small", "Sonucu paylaş");
    p.addEventListener("click", () => paylas(sonucMetni(), p));
    satir.append(p);
    if (user && cevapYaz) {
      satir.append(dugme("btn btn-primary btn-small", "Tek kelimeyle yaz", () => cevapYaz(`${sonucMetni().split("\n")[1]}\n\nTek kelime: `)));
    }
    son.append(baslik, el("p", "chorus-kor-oyun__davet", user ? "Şimdi tek kelimeyle ne hissettirdiğini yaz; yazınca diğerlerinin kelimeleri açılır." : "Hesap açarsan tek kelimeni yazar, başkalarınınkini görürsün."), satir);
  }

  async function onizlemeAl() {
    if (onizleme === null) {
      onizleme = (await onizlemeBul(sanatci, sarki)) || false;
      if (!onizleme) {
        kutu.classList.add("is-onizlemesiz");
        dinle.hidden = true;
        form.hidden = true;
        cubuk.hidden = true;
        wrap.classList.remove("chorus-kor--oyun");
        ciz();
      }
    }
    return onizleme;
  }

  dinle.addEventListener("click", async () => {
    if (calan) {
      kesitDurdur();
      return;
    }
    const o = await onizlemeAl();
    if (!o) {
      return;
    }
    calan = true;
    kutu.classList.add("is-caliyor");
    ciz();
    kesitCal(o.preview, {
      saniye: sure(),
      sahip: kutu,
      bitince: () => {
        calan = false;
        kutu.classList.remove("is-caliyor");
        ciz();
      },
    });
  });

  function dene(sonuc, metin) {
    kayit.denemeler.push({ sonuc, metin });
    if (sonuc === "dogru") {
      kayit.bitti = true;
      kayit.kazandi = true;
    } else if (kayit.denemeler.length >= SURELER.length) {
      kayit.bitti = true;
    }
    kaydet();
    ciz();
  }

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const t = girdi.value.trim();
    if (!t) {
      girdi.focus();
      return;
    }
    girdi.value = "";
    const parcalar = t.split(/\s[-–—·]\s|\s+by\s+/i);
    const sarkiTuttu = benziyor(t, sarki) || parcalar.some((p) => benziyor(p, sarki));
    const sanatciTuttu = benziyor(t, sanatci) || parcalar.some((p) => benziyor(p, sanatci));
    dene(sarkiTuttu ? "dogru" : sanatciTuttu ? "sanatci" : "yanlis", t);
  });
  gec.addEventListener("click", () => dene("gec", ""));

  wrap.classList.add("chorus-kor--oyun");
  ciz();
  onizlemeAl();
  return true;
}
