// Chorus · gönderideki listeler
// Şarkı bağlantısı olan her numaralı liste: üstte "Listeyi çal", her satırda ▶.
// Basınca mini çalar listeyi o satırdan başlatır; çalan satır işaretlenir.
import { listCard, openCardDialog } from "./chorus-card";
import { itemFromLi } from "./chorus-media";
import { nowPlaying, playQueue } from "./chorus-queue";

function markPlaying(root = document) {
  const { item, playing } = nowPlaying();
  root.querySelectorAll("li[data-chorus-url]").forEach((li) => {
    const on = !!item && li.dataset.chorusUrl === item.url;
    li.classList.toggle("is-now", on);
    const b = li.querySelector(":scope > .chorus-play-row");
    if (b) {
      b.textContent = on && playing ? "❚❚" : "▶";
      b.setAttribute("aria-label", on && playing ? "Çalıyor" : "Bu şarkıdan çal");
    }
  });
}

let watching = false;
function watch() {
  if (!watching) {
    watching = true;
    document.addEventListener("chorus:queue", () => markPlaying());
  }
}

export function decorateLists(elem, meta) {
  watch();
  elem.querySelectorAll("ol, ul").forEach((list) => {
    if (list.dataset.chorusList || list.closest("blockquote, aside.quote, .chorus-kor.is-locked")) {
      return;
    }
    const rows = [...list.children].filter((li) => li.tagName === "LI");
    const items = [];
    rows.forEach((li) => {
      const it = itemFromLi(li);
      if (!it) {
        return;
      }
      const index = items.length;
      items.push(it);
      li.dataset.chorusUrl = it.url;
      // bağlantıyı satırdan çıkar, yerine ▶ koy; satır sonundaki ayırıcıyı temizle
      li.querySelectorAll(":scope a[href]").forEach((a) => {
        if (a.href && a.href.includes(it.id)) {
          const prev = a.previousSibling;
          if (prev && prev.nodeType === Node.TEXT_NODE) {
            prev.nodeValue = prev.nodeValue.replace(/\s*·\s*$/, "");
          }
          a.remove();
        }
      });
      const b = document.createElement("button");
      b.type = "button";
      b.className = "chorus-play-row";
      b.textContent = "▶";
      b.setAttribute("aria-label", "Bu şarkıdan çal");
      b.addEventListener("click", () => playQueue(items, index, meta));
      li.prepend(b);
    });
    if (!items.length) {
      return;
    }
    list.dataset.chorusList = "1";
    list.classList.add("chorus-list");
    const head = document.createElement("div");
    head.className = "chorus-list-head";
    const play = document.createElement("button");
    play.type = "button";
    play.className = "chorus-play-all";
    play.innerHTML = `<span aria-hidden="true">▶</span> ${items.length > 1 ? "Listeyi çal" : "Çal"}`;
    play.addEventListener("click", () => playQueue(items, 0, meta));
    const count = document.createElement("span");
    count.className = "chorus-list-count";
    count.textContent = `${items.length} şarkı`;
    head.append(play, count);
    // Liste Story kartı: kapaklı ilk beş şarkı
    if (meta?.title && items.length > 1) {
      const story = document.createElement("button");
      story.type = "button";
      story.className = "chorus-list-story";
      story.textContent = "Paylaş";
      story.title = "Instagram Story için görsel hazırla";
      story.addEventListener("click", async () => {
        const besli = /·\s*beşli$/i.test(meta.title);
        const c = await listCard({
          kicker: besli ? "BENİ BEŞ ŞARKIYLA TANI" : "CHORUS · LİSTE",
          name: besli ? meta.title.replace(/\s*·\s*beşli$/i, "") : meta.title,
          items,
          url: `${window.location.host}${meta.url}`,
          logo: document.querySelector('link[rel="apple-touch-icon"]')?.href,
          cta: besli ? "Sen altıncıya ne eklerdin?" : "Sen bu listeye ne eklerdin?",
        });
        await openCardDialog(c, { filename: "chorus-liste.png", title: meta.title, link: `${window.location.origin}${meta.url}` });
      });
      head.append(story);
    }
    list.before(head);
  });
  markPlaying(elem);
}
