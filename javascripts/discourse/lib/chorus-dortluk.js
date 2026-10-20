// Chorus · Dört Dörtlük
// [wrap=dort-dortluk no="1" g1="Grubun adı|Sanatçı – Şarkı|Sanatçı – Şarkı|Sanatçı – Şarkı|Sanatçı – Şarkı" a1="Bağın kısa açıklaması" g2=… g4=…][/wrap]
// 16 şarkı, gizli bağlarına göre dört grup. Dördünü seç, Bağla'ya bas; dört hata hakkın var.
// g1 en kolay, g4 en zor. Her kutuda 15 saniyelik önizleme. Sonuç cevabı vermeden renkli karelerle paylaşılır.
import { kesitCal, kesitDurdur, kesitSahibi, onizlemeBul } from "./chorus-onizleme";
import { dugme, el, karistir, oku, paylas, yaz } from "./chorus-oyun";

const RENK = ["sari", "pembe", "kobalt", "domates"];
const KARE = ["🟨", "🟪", "🟦", "🟥"];
const HAK = 4;

function sarkiCoz(s) {
  const [a, ...b] = String(s || "").split(/\s+[–—-]\s+/);
  return b.length ? { sanatci: a.trim(), sarki: b.join(" – ").trim() } : { sanatci: "", sarki: a.trim() };
}

export function bulmacaOku(wrap) {
  const gruplar = [1, 2, 3, 4].map((i) => {
    const parca = String(wrap.dataset[`g${i}`] || "").split("|").map((x) => x.trim()).filter(Boolean);
    return { ad: parca[0] || "", aciklama: wrap.dataset[`a${i}`] || "", sarkilar: parca.slice(1, 5).map(sarkiCoz), renk: i - 1 };
  });
  return gruplar.every((g) => g.ad && g.sarkilar.length === 4) ? gruplar : null;
}

export function dortDortluk(wrap, { topic, user, cevapYaz, bitti: bittiHaber }) {
  if (wrap.dataset.dortluk) {
    return;
  }
  wrap.dataset.dortluk = "1";
  const gruplar = bulmacaOku(wrap);
  if (!gruplar) {
    wrap.append(el("p", "chorus-dortluk__hata", "Bulmaca eksik: dört grubun her birinde bir ad ve dört şarkı olmalı."));
    return;
  }
  const no = wrap.dataset.no || "";
  const kutular = gruplar.flatMap((g, gi) => g.sarkilar.map((s, si) => ({ ...s, grup: gi, id: gi * 4 + si })));
  const anahtar = `chorus-dortluk-${topic?.id || no}`;
  const kayit = oku(anahtar, { bulunan: [], denemeler: [], hata: 0, bitti: false });
  let sira = karistir(kutular, topic?.id || 7).map((k) => k.id);
  const secili = new Set();

  wrap.classList.add("chorus-dortluk");
  const ust = el("div", "chorus-dortluk__ust");
  ust.append(el("span", "chorus-dortluk__etiket", `DÖRT DÖRTLÜK${no ? ` · #${no}` : ""}`));
  const haklar = el("span", "chorus-dortluk__haklar");
  ust.append(haklar);
  const nasil = el("p", "chorus-dortluk__nasil", "16 şarkı, dört gizli bağ. Aynı bağı taşıyan dördünü seç, Bağla'ya bas. Kulağın yetmezse ▶ ile 15 saniye dinle. Dört hata hakkın var.");
  const cozulen = el("div", "chorus-dortluk__cozulen");
  const izgara = el("div", "chorus-dortluk__izgara");
  izgara.setAttribute("role", "group");
  izgara.setAttribute("aria-label", "Şarkılar");
  const mesaj = el("p", "chorus-dortluk__mesaj");
  mesaj.setAttribute("aria-live", "polite");
  const eylem = el("div", "chorus-dortluk__eylem");
  const karBtn = dugme("btn btn-flat", "Karıştır", () => {
    sira = karistir(sira, Date.now());
    ciz();
  });
  const temizBtn = dugme("btn btn-flat", "Seçimi bırak", () => {
    secili.clear();
    ciz();
  });
  const baglaBtn = dugme("btn btn-primary", "Bağla", () => bagla());
  eylem.append(karBtn, temizBtn, baglaBtn);
  const son = el("div", "chorus-dortluk__son");
  wrap.append(ust, nasil, cozulen, izgara, mesaj, eylem, son);

  function kaydet() {
    yaz(anahtar, kayit);
  }

  function grupSatiri(g) {
    const s = el("div", `chorus-dortluk__grup is-${RENK[g.renk]}`);
    s.append(el("strong", null, g.ad));
    s.append(el("span", null, g.sarkilar.map((x) => (x.sanatci ? `${x.sanatci} – ${x.sarki}` : x.sarki)).join(" · ")));
    if (g.aciklama) {
      s.append(el("em", null, g.aciklama));
    }
    return s;
  }

  function onizle(k, btn) {
    if (kesitSahibi() === btn) {
      kesitDurdur();
      return;
    }
    btn.classList.add("is-yukleniyor");
    onizlemeBul(k.sanatci, k.sarki).then((o) => {
      btn.classList.remove("is-yukleniyor");
      if (!o) {
        btn.textContent = "–";
        btn.title = "Önizleme bulunamadı";
        btn.disabled = true;
        return;
      }
      btn.textContent = "■";
      kesitCal(o.preview, { start: 5, saniye: 15, sahip: btn, bitince: () => (btn.textContent = "▶") });
    });
  }

  function ciz() {
    haklar.replaceChildren(
      el("span", "chorus-dortluk__hak-etiket", "Hata hakkı"),
      ...Array.from({ length: HAK }, (_, i) => el("span", `chorus-dortluk__hak${i < HAK - kayit.hata ? " is-var" : ""}`))
    );
    cozulen.replaceChildren(...kayit.bulunan.map((gi) => grupSatiri(gruplar[gi])));
    const kalan = sira.map((id) => kutular[id]).filter((k) => !kayit.bulunan.includes(k.grup));
    izgara.replaceChildren(
      ...kalan.map((k) => {
        const kutu = el("div", `chorus-dortluk__kutu${secili.has(k.id) ? " is-secili" : ""}`);
        const sec = dugme("chorus-dortluk__sec", "");
        sec.setAttribute("aria-pressed", secili.has(k.id) ? "true" : "false");
        sec.append(el("strong", null, k.sarki));
        if (k.sanatci) {
          sec.append(el("span", null, k.sanatci));
        }
        sec.disabled = kayit.bitti;
        sec.addEventListener("click", () => {
          if (secili.has(k.id)) {
            secili.delete(k.id);
          } else if (secili.size < 4) {
            secili.add(k.id);
          }
          mesaj.textContent = "";
          ciz();
        });
        const dinle = dugme("chorus-dortluk__dinle", "▶");
        dinle.setAttribute("aria-label", `${k.sarki} için 15 saniye dinle`);
        dinle.addEventListener("click", () => onizle(k, dinle));
        kutu.append(sec, dinle);
        return kutu;
      })
    );
    izgara.hidden = kalan.length === 0;
    eylem.hidden = kayit.bitti;
    baglaBtn.disabled = secili.size !== 4;
    temizBtn.disabled = secili.size === 0;
    if (kayit.bitti) {
      bitir();
    }
  }

  function bagla() {
    if (secili.size !== 4) {
      return;
    }
    const ids = [...secili];
    const tekrar = kayit.denemeler.some((d) => d.length === 4 && ids.every((x) => d.includes(x)));
    if (tekrar) {
      mesaj.textContent = "Bu dördünü zaten denedin.";
      return;
    }
    kayit.denemeler.push(ids);
    const sayac = [0, 0, 0, 0];
    ids.forEach((id) => sayac[kutular[id].grup]++);
    const tam = sayac.findIndex((n) => n === 4);
    if (tam > -1) {
      kayit.bulunan.push(tam);
      secili.clear();
      mesaj.textContent = `Bağ bulundu: ${gruplar[tam].ad}`;
      if (kayit.bulunan.length === 4) {
        kayit.bitti = true;
      }
    } else {
      kayit.hata++;
      mesaj.textContent = sayac.includes(3) ? "Bir eksik! Biri yanlış masada." : "Bu dördü aynı bağı taşımıyor.";
      izgara.classList.remove("is-sallan");
      void izgara.offsetWidth;
      izgara.classList.add("is-sallan");
      if (kayit.hata >= HAK) {
        kayit.bitti = true;
        [0, 1, 2, 3].forEach((gi) => !kayit.bulunan.includes(gi) && kayit.bulunan.push(gi));
        mesaj.textContent = "Haklar bitti. Bağlar şunlardı:";
      }
    }
    kaydet();
    ciz();
  }

  function sonucMetni() {
    const satirlar = kayit.denemeler.map((d) => d.map((id) => KARE[kutular[id].grup]).join(""));
    return `Chorus · Dört Dörtlük${no ? ` #${no}` : ""}\n${satirlar.join("\n")}\n${window.location.host}/t/${topic?.id || ""}`;
  }

  function bitir() {
    if (son.dataset.cizildi) {
      return;
    }
    son.dataset.cizildi = "1";
    kesitDurdur();
    const kazandi = kayit.hata < HAK;
    son.append(
      el(
        "p",
        "chorus-dortluk__sonuc",
        kazandi ? (kayit.hata === 0 ? "Dört dörtlük. Tek hata yok." : `Hepsini buldun, ${kayit.hata} hatayla.`) : "Bu ay bağlar seni yendi. Gelecek ay rövanş."
      )
    );
    const kare = el("pre", "chorus-dortluk__kareler", sonucMetni().split("\n").slice(1, -1).join("\n"));
    const satir = el("div", "chorus-dortluk__eylem");
    const p = dugme("btn btn-small", "Sonucu paylaş");
    p.addEventListener("click", () => paylas(sonucMetni(), p));
    satir.append(p);
    if (user && cevapYaz) {
      satir.append(dugme("btn btn-primary btn-small", "Sonucunu konuya yaz", () => cevapYaz(`${sonucMetni().split("\n").slice(1, -1).join("\n")}\n\nEn çok zorlandığım bağ: `)));
    }
    son.append(kare, satir);
    bittiHaber?.();
  }

  ciz();
  return kayit;
}

export function dortlukBittiMi(topicId) {
  return !!oku(`chorus-dortluk-${topicId}`, {}).bitti;
}
