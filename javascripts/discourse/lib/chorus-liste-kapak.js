// Chorus · liste kapağı
// Liste ve seçki konularında kapak gönderinin başında durur; basınca liste çalar.
// Kapak: liste oluşturucunun koyduğu "liste kapağı" görseli (Spotify'ın kapağı ya da yüklenen görsel);
// o yoksa gönderideki ilk görsel (eski listelerde kişinin yazı kutusuna eklediği görsel).
// Görsel kendi yerinde gizlenir; tüm listenin Spotify oynatıcısı küçük kalır (chorus-katilim),
// böylece iki kapak yarışmaz.
import { KAPAK_ALT } from "./chorus-list-builder";
import { listItems } from "./chorus-media";
import { el } from "./chorus-oyun";
import { playQueue } from "./chorus-queue";

function kapakGorseli(elem) {
  const adaylar = [...elem.querySelectorAll("img")].filter(
    (i) =>
      !i.classList.contains("emoji") &&
      !i.classList.contains("avatar") &&
      !i.closest(".onebox, aside, blockquote, .chorus-spotify, .chorus-ortak, li, .chorus-liste-kapak")
  );
  return adaylar.find((i) => i.getAttribute("alt") === KAPAK_ALT) || adaylar[0] || null;
}

// meta: { title, url, cooked }
export function listeKapagi(elem, meta) {
  if (!elem || elem.querySelector(".chorus-liste-kapak")) {
    return;
  }
  const img = kapakGorseli(elem);
  if (!img) {
    return;
  }
  const yer = img.closest(".lightbox-wrapper") || img;
  const p = yer.closest("p");
  const kaynak = p && elem.contains(p) && p.textContent.trim() === "" ? p : yer;
  kaynak.classList.add("chorus-kapak-kaynak");

  const kutu = el("div", "chorus-liste-kapak");
  const dugme = el("button", "chorus-liste-kapak__resim");
  dugme.type = "button";
  dugme.setAttribute("aria-label", "Listeyi çal");
  const resim = el("img");
  resim.src = img.currentSrc || img.getAttribute("src");
  resim.alt = "";
  resim.loading = "lazy";
  dugme.append(resim, el("span", "chorus-vitrin__play", "▶"));
  dugme.addEventListener("click", () => {
    const items = listItems(meta?.cooked || "", meta?.title || "");
    if (items.length) {
      playQueue(items, 0, meta?.title ? { title: meta.title, url: meta.url } : null);
    }
  });
  kutu.appendChild(dugme);
  elem.prepend(kutu);
}
