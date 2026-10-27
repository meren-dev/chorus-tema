// Chorus · Ortak liste
// "ortak-liste" etiketli liste konularında herkes şarkı ekler: "+ Şarkı ekle" liste oluşturucuyu açar,
// eklenen şarkı cevap olarak düşer (kim eklediği görünür). İlk gönderideki liste, cevaplarla gelen
// şarkıları da altına alır: konunun başında tek liste, her satırda kimin eklediği.
// ▶ nereye basılırsa basılsın (ilk gönderi, cevap, "Tümünü çal") bütün liste o şarkıdan çalar.
// Yeni şarkı gelince liste ve (bu liste çalıyorsa) mini çaların sırası kendiliğinden uzar.
import { ajax } from "discourse/lib/ajax";
import { openListBuilder } from "./chorus-list-builder";
import { itemsFromCooked } from "./chorus-media";
import { extendQueue, nowPlaying, playQueue } from "./chorus-queue";
import { dugme, el } from "./chorus-oyun";

export const ORTAK_ETIKET = "ortak-liste";
const TAZE = 30 * 1000;

export function ortakMi(topic) {
  return (topic?.tags || []).some((t) => (typeof t === "string" ? t : t?.name) === ORTAK_ETIKET);
}

async function topla(topicId) {
  const t = await ajax(`/t/${topicId}.json`);
  const ids = t.post_stream?.stream || [];
  const gonderiler = [];
  for (let i = 0; i < ids.length; i += 50) {
    const r = await ajax(`/t/${topicId}/posts.json`, { data: { post_ids: ids.slice(i, i + 50) } });
    gonderiler.push(...(r.post_stream?.posts || []));
  }
  const kisiler = new Set();
  const gorulen = new Set();
  const items = [];
  const sonPost = Math.max(0, ...gonderiler.map((p) => p.post_number || 0));
  gonderiler
    .filter((p) => p.post_type === 1 && !p.deleted_at && !p.hidden)
    .sort((a, b) => a.post_number - b.post_number)
    .forEach((p) => {
      itemsFromCooked(p.cooked).forEach((it) => {
        if (gorulen.has(it.url)) {
          return;
        }
        gorulen.add(it.url);
        kisiler.add(p.username);
        items.push({ ...it, post: p.post_number, kim: p.username });
      });
    });
  return { items, kisi: kisiler.size, baslik: t.title, url: `/t/${t.slug}/${t.id}`, sonPost };
}

// Konunun bütün şarkıları. 30 saniye önbellekte kalır; taze = true yeniden okur.
const veriler = new Map();
export function ortakVeri(topicId, taze = false) {
  const kayit = veriler.get(topicId);
  if (taze || !kayit || Date.now() - kayit.zaman > TAZE) {
    const p = topla(topicId);
    veriler.set(topicId, { p, zaman: Date.now() });
    p.catch(() => veriler.delete(topicId));
    return p;
  }
  return kayit.p;
}

// Mini çalardaki satırda kimin eklediği görünsün
function kuyruk(v) {
  return v.items.map((it) => ({ ...it, note: it.note ? `${it.note} · @${it.kim}` : `@${it.kim} ekledi` }));
}

function cal(v, url = null) {
  const i = url ? v.items.findIndex((x) => x.url === url) : 0;
  playQueue(kuyruk(v), Math.max(0, i), { title: `${v.baslik} · ortak liste`, url: v.url });
}

// Satırlardaki ▶ ve "Çal" düğmeleri (liste süslemesinin koyduğu) yalnızca kendi gönderisini çalar;
// ortak listede tıklamayı önce yakalayıp bütün listeye yönlendir.
function yonlendir(kok, topicId) {
  if (kok.dataset.chorusOrtak) {
    return;
  }
  kok.dataset.chorusOrtak = "1";
  kok.addEventListener(
    "click",
    (e) => {
      const b = e.target.closest?.(".chorus-play-row, .chorus-play-all");
      if (!b || !kok.contains(b)) {
        return;
      }
      const li = b.closest("li[data-chorus-url]");
      if (!li && !b.classList.contains("chorus-play-all")) {
        return;
      }
      e.preventDefault();
      e.stopPropagation();
      ortakVeri(topicId)
        .then((v) => cal(v, li?.dataset.chorusUrl || null))
        .catch(() => {});
    },
    true
  );
}

function satir(it, v, np) {
  const li = el("li", "chorus-ortak__satir");
  li.dataset.chorusUrl = it.url;
  const simdi = np.item?.url === it.url;
  li.classList.toggle("is-now", simdi);
  const b = dugme("chorus-play-row", simdi && np.playing ? "❚❚" : "▶");
  b.setAttribute("aria-label", "Bu şarkıdan çal");
  const kim = el("a", "chorus-ortak__kim", `@${it.kim}`);
  kim.href = `${v.url}/${it.post}`;
  li.append(b, document.createTextNode(`${[it.artist, it.title, it.note].filter(Boolean).join(" · ")} `), kim);
  return li;
}

// Cevaplardan gelen şarkılar ilk gönderideki listenin sonuna (liste yoksa ortak kutusunun altına)
function eklenenler(elem, v) {
  elem.querySelectorAll(".chorus-ortak__satir").forEach((n) => n.remove());
  const gelen = v.items.filter((it) => it.post > 1);
  let ol = elem.querySelector("ol.chorus-list, ul.chorus-list");
  if (!ol && gelen.length) {
    ol = el("ol", "chorus-list chorus-ortak__liste");
    ol.dataset.chorusList = "1";
    elem.querySelector(".chorus-ortak")?.after(ol);
  }
  const np = nowPlaying();
  gelen.forEach((it) => ol.appendChild(satir(it, v, np)));
}

// İlk gönderi: ortak liste kutusu ve bütün şarkılar
export function ortakListe(elem, { topic, user, composer }) {
  if (!ortakMi(topic) || elem.querySelector(".chorus-ortak")) {
    return;
  }
  elem.classList.add("chorus-ortak-ilk");
  const kutu = el("div", "chorus-ortak");
  const ust = el("div", "chorus-ortak__ust");
  const etiket = el("span", "chorus-ortak__etiket", "ORTAK LİSTE");
  const sayi = el("span", "chorus-ortak__sayi", "şarkılar toplanıyor…");
  ust.append(etiket, sayi);
  const tumu = dugme("chorus-play-all", "▶ Tümünü çal");
  tumu.disabled = true;
  const ekle = dugme("btn btn-primary btn-small", "+ Şarkı ekle");
  const alt = el("p", "chorus-ortak__alt", "Herkes ekleyebilir. Eklediğin şarkı cevap olarak düşer ve bu listenin sonuna eklenir; yanına neden burada olduğunu tek cümleyle yaz.");
  const satirlar = el("div", "chorus-ortak__eylem");
  satirlar.append(tumu, ekle);
  kutu.append(ust, satirlar, alt);
  // Kutunun yeri: şarkı listesinin başı; liste yoksa (yalnızca tüm liste) davet cümlesinin önü
  const yer =
    elem.querySelector(".chorus-list-head") ||
    elem.querySelector("ol.chorus-list, ul.chorus-list") ||
    [...elem.children].find((n) => n.tagName === "P" && /^Bu ortak bir liste/i.test(n.textContent.trim())) ||
    elem.querySelector(".chorus-link-work");
  if (yer) {
    yer.before(kutu);
  } else {
    elem.appendChild(kutu);
  }
  yonlendir(elem, topic.id);

  const ciz = (v) => {
    sayi.textContent = `${v.items.length} şarkı · ${v.kisi} kişi`;
    tumu.disabled = !v.items.length;
    eklenenler(elem, v);
  };
  // konuda bilinenden yeni bir gönderi varsa listeyi tazele
  ortakVeri(topic.id)
    .then((v) => (topic.highest_post_number > v.sonPost ? ortakVeri(topic.id, true) : v))
    .then(ciz)
    .catch(() => (sayi.textContent = ""));

  const dinle = (e) => {
    if (e.detail?.topicId !== topic.id) {
      return;
    }
    if (!elem.isConnected) {
      document.removeEventListener("chorus:ortak", dinle);
      return;
    }
    ciz(e.detail.veri);
  };
  document.addEventListener("chorus:ortak", dinle);

  ekle.addEventListener("click", () => {
    if (!user) {
      window.location.href = "/login";
      return;
    }
    openListBuilder({
      mode: "insert",
      onDone: async ({ markdown }) => {
        // yarım kalmış bir cevap varsa üstüne yazma, sonuna ekle
        await composer.open({ action: "reply", topic, draftKey: topic.draft_key, draftSequence: topic.draft_sequence });
        const m = composer.model;
        if (m) {
          const eski = String(m.reply || "").trim();
          m.set("reply", eski ? `${eski}\n\n${markdown.trim()}\n` : `${markdown.trim()}\n`);
        }
      },
    });
  });
}

// Cevap: kendi "Çal" başlığı gizlenir (common.scss), ▶ bütün listeyi o şarkıdan çalar.
// Yeni gelen bir cevapsa ilk gönderideki liste ve çalan sıra güncellenir.
export function ortakCevap(elem, { topic, post }) {
  if (!ortakMi(topic) || !post?.post_number || post.post_number <= 1) {
    return;
  }
  elem.classList.add("chorus-ortak-cevap");
  yonlendir(elem, topic.id);
  ortakVeri(topic.id)
    .then((v) => {
      if (post.post_number <= v.sonPost) {
        return;
      }
      return ortakVeri(topic.id, true).then((yeni) => {
        document.dispatchEvent(new CustomEvent("chorus:ortak", { detail: { topicId: topic.id, veri: yeni } }));
        extendQueue(yeni.url, kuyruk(yeni));
      });
    })
    .catch(() => {});
}
