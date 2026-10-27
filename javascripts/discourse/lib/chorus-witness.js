import { openEserDialog } from "./chorus-eser";
import { playQueue } from "./chorus-queue";
import { itemsFromCooked, mediaFromUrl } from "./chorus-media";

// Chorus · aktif tanık
// 1 · Yoğunluk şeridi: bir konudaki bütün "Tam burada" anları şarkının oynatıcısının altında tek bir şeritte.
//     Kimse bir şey yazmadan da başkalarının nerede durduğu görülür; noktaya basınca şarkı o saniyeye sarılır.
// 2 · "Bir eser bağla": ilk gönderinin altında; eser bağlantısı (önizlemesiyle) + "neden buraya" cümlesi
//     penceresini açar, sonra cevap kutusunu bağlantı kendi satırında olacak şekilde doldurur (lib/chorus-eser.js).

const TS = /(^|[^\d:])(\d{1,2}):([0-5]\d)(?![\d:])/g;
const PLAYER = ".chorus-spotify, .chorus-yt-box, .lazy-video-wrapper, .lazy-video-container, .onebox.video-onebox, aside.onebox[data-onebox-src*='youtube']";

function fmt(secs) {
  return `${String(Math.floor(secs / 60)).padStart(2, "0")}:${String(secs % 60).padStart(2, "0")}`;
}

function secondsIn(cooked) {
  const doc = new DOMParser().parseFromString(cooked || "", "text/html");
  doc.querySelectorAll("blockquote, aside.quote, code, pre, a").forEach((n) => n.remove());
  const text = doc.body.textContent || "";
  const out = [];
  for (const m of text.matchAll(TS)) {
    out.push(parseInt(m[2], 10) * 60 + parseInt(m[3], 10));
  }
  return out;
}

export function densityStrip(elem, topic) {
  if (elem.querySelector(".chorus-density")) {
    return;
  }
  const player = elem.querySelector(PLAYER);
  const posts = topic?.postStream?.posts || [];
  if (!player || !posts.length) {
    return;
  }
  // her kişinin her anı bir kez sayılır; 4 saniyelik yakınlıklar aynı ana düşer
  const buckets = new Map();
  posts.forEach((p) => {
    new Set(secondsIn(p.cooked)).forEach((s) => {
      const k = Math.round(s / 4) * 4;
      const b = buckets.get(k) || { secs: s, people: new Set() };
      b.people.add(p.username);
      buckets.set(k, b);
    });
  });
  if (!buckets.size) {
    return;
  }
  const marks = [...buckets.values()].sort((a, b) => a.secs - b.secs);
  const total = marks.reduce((n, m) => n + m.people.size, 0);
  const end = Math.max(...marks.map((m) => m.secs)) * 1.12 + 10;
  const peak = Math.max(...marks.map((m) => m.people.size));

  const strip = document.createElement("div");
  strip.className = "chorus-density";
  strip.innerHTML = `<div class="chorus-density__label"><span>İNSANLARIN DURDUĞU ANLAR</span><em></em></div><div class="chorus-density__track" role="list"></div>`;
  strip.querySelector("em").textContent =
    total > 1 ? `${total} işaret · insanlar en çok ${fmt(marks.find((m) => m.people.size === peak).secs)} civarında durmuş` : "ilk işaret";
  const track = strip.querySelector(".chorus-density__track");
  marks.forEach((m) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "chorus-ts chorus-density__dot";
    b.dataset.seconds = m.secs;
    b.style.left = `${(m.secs / end) * 100}%`;
    b.style.setProperty("--w", String(0.6 + (m.people.size / peak) * 0.9));
    b.setAttribute("role", "listitem");
    b.setAttribute("aria-label", `${fmt(m.secs)} · ${m.people.size} kişi`);
    b.title = `${fmt(m.secs)} · ${m.people.size} kişi burada durdu`;
    track.appendChild(b);
  });
  player.after(strip);
}

export function linkWorkButton(elem, topic, composer) {
  if (elem.querySelector(".chorus-link-work") || !topic) {
    return;
  }
  const box = document.createElement("div");
  box.className = "chorus-link-work";
  box.innerHTML = `<button type="button" class="btn btn-small">Bağlantı ekle</button><span>Bu konuyu bir şarkıya, filme ya da kitaba bağla. Nedenini tek cümleyle yaz.</span>`;
  box.querySelector("button").addEventListener("click", () => {
    openEserDialog({
      onDone: async ({ markdown }) => {
        // yarım kalmış bir cevap varsa üstüne yazma, sonuna ekle
        await composer.open({ action: "reply", topic, draftKey: topic.draft_key, draftSequence: topic.draft_sequence });
        const m = composer.model;
        if (m) {
          const eski = String(m.reply || "").trim();
          m.set("reply", eski ? `${eski}\n\n${markdown}` : markdown);
        }
      },
    });
  });
  elem.appendChild(box);
}

// ── Zaman etiketinin hangi şarkıya ait olduğu ─────────────────────────────
// Sıra: etiketin bulunduğu liste satırı → aynı gönderideki Spotify/YouTube bağlantısı →
// gönderide adı geçen liste şarkısı. Hiçbiri yoksa null (eski davranış: sayfadaki oynatıcı).

const lower = (s) => String(s || "").toLocaleLowerCase("tr");

export function topicItems(topic) {
  const first = topic?.postStream?.posts?.find((p) => p.post_number === 1);
  return first ? itemsFromCooked(first.cooked) : [];
}

export function targetFor(scope, chip, items) {
  const row = chip?.closest?.("li[data-chorus-url]");
  if (row) {
    const i = items.findIndex((x) => x.url === row.dataset.chorusUrl);
    if (i > -1) {
      return { items, index: i };
    }
  }
  const link = [...scope.querySelectorAll("a[href]")]
    .filter((a) => !a.closest("li[data-chorus-url], blockquote, aside.quote"))
    .map((a) => mediaFromUrl(a.getAttribute("href")))
    .find(Boolean);
  if (link) {
    const i = items.findIndex((x) => x.url === link.url);
    if (i > -1) {
      return { items, index: i };
    }
    return { items: [{ ...link, title: "", artist: "", note: "" }], index: 0 };
  }
  const text = lower(scope.textContent);
  const i = items.findIndex((x) => lower(x.title).length > 2 && text.includes(lower(x.title)));
  return i > -1 ? { items, index: i } : null;
}

// Liste konusunda: cevaplardaki zaman etiketleri ilgili şarkının satırında görünür (kim, hangi saniyede durdu)
export function listMoments(elem, topic) {
  const items = topicItems(topic);
  if (!items.length || elem.querySelector(".chorus-row-moments")) {
    return;
  }
  const byUrl = new Map();
  (topic.postStream?.posts || [])
    .filter((p) => p.post_number > 1)
    .forEach((p) => {
      const secs = secondsIn(p.cooked);
      if (!secs.length) {
        return;
      }
      const doc = new DOMParser().parseFromString(p.cooked || "", "text/html");
      const t = targetFor(doc.body, null, items);
      if (!t || t.items !== items) {
        return;
      }
      const url = items[t.index].url;
      const list = byUrl.get(url) || [];
      secs.forEach((s) => list.push({ s, who: p.name || p.username, post: p.post_number }));
      byUrl.set(url, list);
    });
  elem.querySelectorAll("li[data-chorus-url]").forEach((li) => {
    const marks = byUrl.get(li.dataset.chorusUrl);
    if (!marks?.length) {
      return;
    }
    const row = document.createElement("div");
    row.className = "chorus-row-moments";
    marks
      .sort((a, b) => a.s - b.s)
      .slice(0, 6)
      .forEach((m) => {
        const b = document.createElement("button");
        b.type = "button";
        b.className = "chorus-ts";
        b.dataset.seconds = m.s;
        b.textContent = fmt(m.s);
        b.title = `${m.who} burada durdu`;
        const who = document.createElement("span");
        who.textContent = m.who;
        const wrap = document.createElement("span");
        wrap.className = "chorus-row-moment";
        wrap.append(b, who);
        row.appendChild(wrap);
      });
    li.appendChild(row);
  });
}

// ── Altıncı şarkı: beşlinin altına gelen öneriler ve öneri düğmesi ─────────
// Cevaplardaki ilk Spotify/YouTube bağlantısı "altıncı şarkı" sayılır ve beşlinin altında,
// kimin önerdiğiyle birlikte toplanır. Beşli sahibi olmayan üyeye "Altıncı şarkıyı ekle" düğmesi çıkar.

export function sixthPieces(elem, topic, user, composer) {
  if (!topic || elem.querySelector(".chorus-sixth")) {
    return;
  }
  const own = topic.postStream?.posts?.[0];
  const inBesli = new Set(topicItems(topic).map((x) => x.url));
  const sixths = (topic.postStream?.posts || [])
    .filter((p) => p.post_number > 1 && p.user_id !== own?.user_id)
    .map((p) => {
      const doc = new DOMParser().parseFromString(p.cooked || "", "text/html");
      const media = [...doc.querySelectorAll("a[href]")].map((a) => mediaFromUrl(a.getAttribute("href"))).find(Boolean);
      // beşlideki bir şarkıdan söz eden cevap öneri sayılmaz
      if (!media || inBesli.has(media.url)) {
        return null;
      }
      doc.querySelectorAll("a, blockquote, aside").forEach((n) => n.remove());
      const why = (doc.body.textContent || "").replace(/\s+/g, " ").replace(/^altıncı (parça|şarkı)\s*:?\s*/i, "").trim().slice(0, 120);
      return { ...media, title: why || "Altıncı şarkı", artist: p.name || p.username, note: "", who: p.name || p.username, post: p.post_number };
    })
    .filter(Boolean);

  const box = document.createElement("div");
  box.className = "chorus-sixth";
  const head = document.createElement("div");
  head.className = "chorus-sixth__head";
  head.innerHTML = `<span class="chorus-sixth__label">ALTINCI ŞARKI</span>`;
  const count = document.createElement("em");
  count.textContent = sixths.length ? `bu beşliye ${sixths.length} şarkı önerildi` : "bu beşliye bir şarkı öner. İlk sen ol.";
  head.appendChild(count);
  box.appendChild(head);

  sixths.forEach((s, i) => {
    const row = document.createElement("div");
    row.className = "chorus-sixth__row";
    const b = document.createElement("button");
    b.type = "button";
    b.className = "chorus-play-row";
    b.textContent = "▶";
    b.setAttribute("aria-label", "Bu öneriyi çal");
    b.addEventListener("click", () => playQueue(sixths, i, { title: `${topic.title} · altıncı şarkılar`, url: `/t/${topic.slug}/${topic.id}` }));
    const text = document.createElement("a");
    text.href = `/t/${topic.slug}/${topic.id}/${s.post}`;
    text.innerHTML = `<strong></strong><span></span>`;
    text.querySelector("strong").textContent = s.who;
    text.querySelector("span").textContent = s.title;
    row.append(b, text);
    box.appendChild(row);
  });

  if (user && own && user.id !== own.user_id) {
    const add = document.createElement("button");
    add.type = "button";
    add.className = "btn btn-small chorus-sixth__add";
    add.textContent = "Bir şarkı öner";
    add.addEventListener("click", async () => {
      await composer.open({ action: "reply", topic, draftKey: topic.draft_key, draftSequence: topic.draft_sequence });
      const m = composer.model;
      if (m && !String(m.reply || "").trim()) {
        m.set("reply", "Altıncı şarkı: \n\nBu beşliye yakışır çünkü ");
      }
    });
    box.appendChild(add);
  }
  elem.appendChild(box);
}
