// Chorus · Nereye ne?
// Kepenk'in balonundan ve menüden açılan kısa rehber: ne yapmak istiyorsan nereye gidersin.
// Metin "Nereye ne?" konusundan gelir (tema ayarı rehber_konusu), böylece rehberi Discourse'ta
// düzenlemek yeter; konu yoksa ya da açılamazsa aşağıdaki hazır metin görünür.
import { ajax } from "discourse/lib/ajax";
import { el } from "./chorus-oyun";

let KONU = 0;

export function rehberAyarla({ konu } = {}) {
  KONU = Number(konu) || 0;
}

export function rehberAdresi() {
  return KONU ? `/t/${KONU}` : null;
}

const HAZIR = `
<table>
  <thead><tr><th>İstiyorum ki…</th><th>Git</th></tr></thead>
  <tbody>
    <tr><td>Yeni müzik bulayım</td><td><a href="/c/dinle/14">Dinle</a>: Kepenk Radyosu günde üç şarkı çalar (10:00 · 14:00 · 19:00), haftada bir Chorus seçkisi, üyelerin listeleri rafta.</td></tr>
    <tr><td>Bir şarkı paylaşayım</td><td><a href="/c/takil/simdi-caliyor/6">Takıl › Şimdi Çalıyor</a>: şarkı, neden o, seni yakalayan saniye.</td></tr>
    <tr><td>Liste yapayım</td><td><a href="/c/dinle/listeler/10">Dinle › Listeler</a>: bağlantıları yapıştır, sırala, istersen her şarkıya bir cümle.</td></tr>
    <tr><td>Bir şey sorayım, tartışayım</td><td><a href="/c/takil/acik-masalar/7">Takıl › Açık Masalar</a>: cevabı birikecek sorular.</td></tr>
    <tr><td>Şimdi biriyle laflayayım</td><td><a href="/chat/c/kepenk-radyosu/3">Radyo sohbeti</a>: anlık laf, radyo çalarken.</td></tr>
    <tr><td>Kendimi tanıtayım</td><td><a href="/c/takil/besliler/9">Beşlin</a>: seni anlatan beş şarkı. Burada yazdığın ilk şey o olur.</td></tr>
    <tr><td>Kendi müziğimi göstereyim</td><td><a href="/c/takil/yapim-asamasinda/8">Takıl › Yapım Aşamasında</a>: demo, yarım iş, nazik ve dürüst geri bildirim.</td></tr>
    <tr><td>Oynayayım</td><td><a href="/c/oyna/16">Oyna</a>: her gün Kör Dinleme ve Günün Sorusu, ayda bir Dört Dörtlük.</td></tr>
    <tr><td>Okuyayım</td><td><a href="/c/oku/15">Oku</a>: Common Hours'un müzik üstüne uzun yazıları.</td></tr>
    <tr><td>Bir şey bozuk, önerim var</td><td><a href="/c/takil/oneri-kutusu/2">Öneri Kutusu</a> (menüde).</td></tr>
  </tbody>
</table>
<p><strong>Kural:</strong> anlık laf sohbete, kalıcı soru Açık Masa'ya, bir şarkı üstüne söz o şarkının altına.</p>
<p>Her yerde sağ üstteki <strong>+ Yaz</strong> sana ne yapmak istediğini sorar ve doğru yere götürür.</p>`;

let onbellek = null;
function rehberMetni() {
  if (!KONU) {
    return Promise.resolve(null);
  }
  if (!onbellek) {
    onbellek = ajax(`/t/${KONU}.json`)
      .then((t) => t?.post_stream?.posts?.[0]?.cooked || null)
      .catch(() => {
        onbellek = null;
        return null;
      });
  }
  return onbellek;
}

export function openRehber() {
  document.querySelector(".chorus-rehber")?.remove();
  const wrap = el("div", "chorus-card-dialog chorus-rehber");
  wrap.setAttribute("role", "dialog");
  wrap.setAttribute("aria-modal", "true");
  wrap.setAttribute("aria-label", "Nereye ne?");
  const panel = el("div", "chorus-card-dialog__panel chorus-builder__panel chorus-rehber__panel");
  const kapat = el("button", "chorus-card-dialog__close", "×");
  kapat.type = "button";
  kapat.setAttribute("aria-label", "Kapat");
  const govde = el("div", "cooked chorus-rehber__govde");
  govde.innerHTML = HAZIR;
  const alt = el("div", "chorus-rehber__alt");
  panel.append(kapat, el("div", "chorus-card-dialog__label", "NEREYE NE?"), el("h3", null, "Chorus'ta nereye ne?"), govde, alt);
  wrap.appendChild(panel);

  const close = () => {
    wrap.remove();
    document.removeEventListener("keydown", onKey);
  };
  const onKey = (e) => e.key === "Escape" && close();
  wrap.addEventListener("click", (e) => {
    if (e.target === wrap || e.target.closest(".chorus-card-dialog__close")) {
      close();
      return;
    }
    // rehberdeki bir bağlantıya basınca pencere kapansın, sayfa oraya gitsin
    if (e.target.closest("a[href]")) {
      close();
    }
  });
  document.addEventListener("keydown", onKey);
  document.body.appendChild(wrap);
  kapat.focus();

  rehberMetni().then((cooked) => {
    if (!cooked || !wrap.isConnected) {
      return;
    }
    govde.innerHTML = cooked;
    const a = el("a", "chorus-rehber__sayfa", "Rehberin sayfası →");
    a.href = rehberAdresi();
    alt.replaceChildren(a);
  });
}
