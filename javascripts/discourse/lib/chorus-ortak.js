// Chorus · Ortak liste
// "ortak-liste" etiketli liste konularında herkes şarkı ekler: "Şarkı ekle" liste oluşturucuyu açar,
// eklenen şarkılar cevap olarak düşer (kim eklediği görünür). "Tümünü çal" ilk gönderiyle
// bütün cevaplardaki şarkıları sırayla çalar.
import { ajax } from "discourse/lib/ajax";
import { openListBuilder } from "./chorus-list-builder";
import { itemsFromCooked } from "./chorus-media";
import { playQueue } from "./chorus-queue";
import { dugme, el } from "./chorus-oyun";

export const ORTAK_ETIKET = "ortak-liste";

export function ortakMi(topic) {
  return (topic?.tags || []).some((t) => (typeof t === "string" ? t : t?.name) === ORTAK_ETIKET);
}

async function tumSarkilar(topicId) {
  const t = await ajax(`/t/${topicId}.json`);
  const ids = t.post_stream?.stream || [];
  const gonderiler = [];
  for (let i = 0; i < ids.length; i += 50) {
    const r = await ajax(`/t/${topicId}/posts.json`, { data: { post_ids: ids.slice(i, i + 50) } });
    gonderiler.push(...(r.post_stream?.posts || []));
  }
  const kisiler = new Set();
  const items = [];
  const gorulen = new Set();
  gonderiler
    .filter((p) => p.post_type === 1)
    .sort((a, b) => a.post_number - b.post_number)
    .forEach((p) => {
      itemsFromCooked(p.cooked).forEach((it) => {
        if (gorulen.has(it.url)) {
          return;
        }
        gorulen.add(it.url);
        kisiler.add(p.username);
        items.push({ ...it, note: it.note ? `${it.note} · @${p.username}` : `@${p.username} ekledi` });
      });
    });
  return { items, kisi: kisiler.size, baslik: t.title, url: `/t/${t.slug}/${t.id}` };
}

export function ortakListe(elem, { topic, user, composer }) {
  if (!ortakMi(topic) || elem.querySelector(".chorus-ortak")) {
    return;
  }
  const kutu = el("div", "chorus-ortak");
  const ust = el("div", "chorus-ortak__ust");
  const etiket = el("span", "chorus-ortak__etiket", "ORTAK LİSTE");
  const sayi = el("span", "chorus-ortak__sayi", "şarkılar toplanıyor…");
  ust.append(etiket, sayi);
  const cal = dugme("chorus-play-all", "▶ Tümünü çal");
  cal.disabled = true;
  const ekle = dugme("btn btn-primary btn-small", "+ Şarkı ekle");
  const alt = el("p", "chorus-ortak__alt", "Herkes ekleyebilir. Eklediğin şarkı cevap olarak düşer; yanına neden burada olduğunu tek cümleyle yaz.");
  const satir = el("div", "chorus-ortak__eylem");
  satir.append(cal, ekle);
  kutu.append(ust, satir, alt);
  const head = elem.querySelector(".chorus-list-head");
  (head || elem.firstElementChild || elem).before(kutu);

  let veri = null;
  const yukle = () =>
    tumSarkilar(topic.id)
      .then((v) => {
        veri = v;
        sayi.textContent = `${v.items.length} şarkı · ${v.kisi} kişi`;
        cal.disabled = !v.items.length;
      })
      .catch(() => (sayi.textContent = ""));
  yukle();

  cal.addEventListener("click", () => veri && playQueue(veri.items, 0, { title: `${veri.baslik} · ortak liste`, url: veri.url }));
  ekle.addEventListener("click", () => {
    if (!user) {
      window.location.href = "/login";
      return;
    }
    openListBuilder({
      mode: "insert",
      onDone: ({ markdown }) =>
        composer.open({
          action: "reply",
          topic,
          draftKey: topic.draft_key,
          draftSequence: topic.draft_sequence,
          reply: `${markdown.trim()}\n`,
        }),
    });
  });
}
