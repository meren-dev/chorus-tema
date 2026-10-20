// Chorus · Günün Sorusu
// İki biçim, aynı konu yapısı: önce [poll results=on_vote], altında Kepenk'in notu ve şarkı.
// 1) "Sen ne dersin?": doğru cevabı yok; oy verince sonuç görünür.
// 2) "Biliyor muydun?": notu ve şarkıyı [wrap=bilgi dogru="2"] … [/wrap] içine al (dogru = doğru seçeneğin sırası).
//    Oy verene kadar not kapalı; oy verince doğru seçenek yeşil, seninki yanlışsa domates olur.
// Herkese aynı: oy verince seri (art arda günler) ve cevabı vermeden paylaşılan bir sonuç satırı.
import { bugun, dugme, el, kisaTarih, oku, paylas, yaz } from "./chorus-oyun";

const SERI = "chorus-soru-seri";
const CEVAP = "chorus-soru-cevap";

function seriGuncelle(topicId) {
  const cevaplar = oku(CEVAP, {});
  const s = oku(SERI, { son: null, sayi: 0 });
  if (cevaplar[topicId]) {
    return s;
  }
  const g = bugun();
  const dun = bugun(new Date(Date.now() - 864e5));
  if (s.son !== g) {
    s.sayi = s.son === dun ? s.sayi + 1 : 1;
    s.son = g;
  }
  yaz(SERI, s);
  return s;
}

function cevapKaydet(topicId, sonuc) {
  const c = oku(CEVAP, {});
  if (!c[topicId]) {
    c[topicId] = sonuc;
    const anahtarlar = Object.keys(c);
    if (anahtarlar.length > 200) {
      delete c[anahtarlar[0]];
    }
    yaz(CEVAP, c);
  }
  return c[topicId];
}

function metin(n) {
  return (n?.textContent || "").replace(/\s+/g, " ").trim();
}

// Pişmiş gönderideki seçenekler, yazıldıkları sırayla
function secenekler(cooked) {
  const d = new DOMParser().parseFromString(cooked || "", "text/html");
  return [...d.querySelectorAll(".poll li[data-poll-option-id]")].map((li) => ({ id: li.dataset.pollOptionId, metin: metin(li) }));
}

export function gununSorusu(elem, { post, topic }) {
  const poll = elem.querySelector(".poll, .poll-outlet");
  if (!poll || elem.dataset.chorusSoru) {
    return;
  }
  elem.dataset.chorusSoru = "1";
  const bilgi = elem.querySelector(".d-wrap[data-wrap='bilgi']");
  const opts = secenekler(post?.cooked);
  const dogruSira = parseInt(bilgi?.dataset.dogru, 10);
  const dogru = bilgi && opts[dogruSira - 1];
  if (bilgi) {
    bilgi.classList.add("chorus-bilgi");
    elem.classList.add("chorus-soru--bilgi");
  }
  const kutu = el("div", "chorus-soru");
  kutu.hidden = true;
  (bilgi || poll).after(kutu);

  let bitti = false;

  // Kişinin seçtiği seçeneklerin metni (sonuç listesinde "chosen" işaretli satırlar ya da modeldeki oy)
  function oyum() {
    const secilen = [...elem.querySelectorAll(".poll ul.results li.chosen")];
    if (secilen.length) {
      return secilen.map((li) => metin(li));
    }
    const votes = post?.polls_votes || {};
    const ad = Object.keys(votes)[0];
    const ids = ad ? votes[ad] : null;
    return ids?.length ? ids.map((x) => opts.find((o) => o.id === x)?.metin || String(x)) : null;
  }

  function sonucVar() {
    return !!elem.querySelector(".poll ul.results, .poll .poll-results-standard, .poll .poll-results-ranked-choice");
  }

  function isaretle() {
    if (!dogru) {
      return;
    }
    elem.querySelectorAll(".poll ul.results li").forEach((li) => {
      const buDogru = metin(li).includes(dogru.metin);
      li.classList.toggle("is-dogru", buDogru);
      li.classList.toggle("is-yanlis", li.classList.contains("chosen") && !buDogru);
    });
  }

  function goster() {
    const secimler = oyum();
    if (!secimler && !sonucVar()) {
      return;
    }
    const dogruMu = dogru ? !!secimler?.some((x) => x.includes(dogru.metin)) : null;
    isaretle();
    if (bitti) {
      return;
    }
    bitti = true;
    const s = seriGuncelle(topic.id);
    const sonuc = cevapKaydet(topic.id, dogru ? (dogruMu ? "bildi" : "bilemedi") : "oy");
    bilgi?.classList.add("is-acik");
    const gun = kisaTarih(topic.created_at ? new Date(topic.created_at).toISOString().slice(0, 10) : bugun());
    const satir = dogru ? (sonuc === "bildi" ? "🟩 Bildim" : "🟥 Bilemedim") : "🗳️ Oyumu verdim";
    const paylasim = `Chorus · Günün Sorusu ${gun}\n${satir} · seri ${s.sayi}\n${window.location.host}/t/${topic.id}`;
    kutu.replaceChildren();
    const ust = el("p", "chorus-soru__sonuc");
    ust.textContent = dogru ? (sonuc === "bildi" ? "Bildin." : `Bu sefer olmadı. Doğrusu: ${dogru.metin}`) : "Oyun sayıldı. Herkes ne demiş, yukarıda.";
    const seri = el("span", "chorus-soru__seri", s.sayi > 1 ? `${s.sayi} gündür buradasın` : "Seri başladı: yarın da gel");
    const p = dugme("btn btn-small", "Paylaş");
    p.addEventListener("click", () => paylas(paylasim, p));
    const alt = el("div", "chorus-soru__alt");
    alt.append(seri, p);
    kutu.append(ust, alt);
    kutu.hidden = false;
  }

  // oy verilince poll bileşeni kendini yeniden çizer; onu izle
  const goz = new MutationObserver(() => goster());
  goz.observe(elem, { childList: true, subtree: true });
  setTimeout(goster, 300);
}

// Ana sayfadaki Bugün bloğu için: konu hangi biçimde?
export function soruBicimi(cooked) {
  return /data-wrap="bilgi"/.test(cooked || "") ? "bilgi" : "anket";
}
