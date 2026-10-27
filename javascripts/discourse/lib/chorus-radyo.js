import { ajax } from "discourse/lib/ajax";
import { mediaFromUrl } from "./chorus-media";
import { playQueue } from "./chorus-queue";

// Chorus · Kepenk Radyosu
// Kanaldaki radyo şarkılarını okur ve mini çalara sıra kurar. Ana sayfa kartı (chorus-radyo)
// ve kanal çubuğu (chorus-radyo-bar) bunu kullanır.
// Radyo şarkısı = "— Seçen: …" ya da "— Bugünün küratörü: @…" imzasıyla biten mesaj;
// sohbette yazılan diğer mesajlar sıraya girmez.

export const CHANNEL_ID = 3;
export const CHANNEL_URL = "/chat/c/kepenk-radyosu/3";
export const CHANNEL_PATH = "/chat/c/kepenk-radyosu";
const SLOTS = ["10:00", "14:00", "19:00"];
// Hesabı olmayanlar için radyonun defteri: çalan her şarkı buraya da yazılır (Workflows › Kepenk Radyosu · yayın)
export const ARCHIVE_TOPIC = 34;
export const ARCHIVE_URL = "/t/kepenk-radyosu-calanlar/34";
const TZ = "Europe/Istanbul";
const SIGN = /\n[—–-]{1,2}\s*(Seçen:\s*[^\n]+|Bugünün küratörü:\s*@\S+)\s*(?:\n|$)/i; // telefonda "-" yazılsa da tanır

export function istanbul(date) {
  const parts = new Intl.DateTimeFormat("tr-TR", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const get = (type) => parts.find((p) => p.type === type)?.value || "";
  return {
    day: `${get("year")}-${get("month")}-${get("day")}`,
    time: `${get("hour")}:${get("minute")}`,
  };
}

export function nextSlot(now = new Date()) {
  const { time } = istanbul(now);
  const slot = SLOTS.find((s) => s > time);
  return slot || `yarın ${SLOTS[0]}`;
}

// Radyo kuyruğu zengin yazı kutusunda yazılırsa elle yazılan ** kaçışlı kaydedilir
// ("**\*\*Şarkı\*\***"); okurken kaçışları çöz, üst üste binen yıldızları tek kalına indir.
export function duzMetin(text) {
  return String(text || "")
    .replace(/\\([!-/:-@[-`{-~])/g, "$1")
    .replace(/\*{3,}/g, "**");
}

// Sohbette ve radyonun defterinde bu yüzden görünen ** işaretlerini sil (kod blokları hariç)
export function yildizTemizle(elem) {
  if (!elem) {
    return;
  }
  const walker = document.createTreeWalker(elem, NodeFilter.SHOW_TEXT, {
    acceptNode: (n) => (n.parentElement?.closest("code, pre") || !n.nodeValue.includes("**") ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
  });
  const nodes = [];
  while (walker.nextNode()) {
    nodes.push(walker.currentNode);
  }
  nodes.forEach((n) => (n.nodeValue = n.nodeValue.replace(/\*\*/g, "")));
}

function clean(text) {
  return String(text || "")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/\*\*|__|`/g, "")
    .replace(/^[*_]|[*_]$/g, "")
    .trim();
}

// Radyo mesajını parçalarına ayırır: { url, artist, title, note, by, at }; radyo mesajı değilse null
export function parseRadioMessage(m) {
  const raw = duzMetin(m?.message);
  const sign = raw.match(SIGN);
  if (!sign) {
    return null;
  }
  const body = raw.slice(0, sign.index);
  const url = (body.match(/https?:\/\/[^\s)>\]]+/) || [])[0] || null;
  const bolds = [...body.matchAll(/\*\*([^*\n]+)\*\*/g)].map((x) => x[1].trim());
  const head = bolds.find((b) => !b.endsWith(":")) || "";
  const parts = head.split(/\s+[–—-]\s+/);
  const artist = parts.length > 1 ? clean(parts[0]) : "";
  const title = clean(parts.length > 1 ? parts.slice(1).join(" – ") : head) || "Kepenk'in seçtiği şarkı";

  const why = body.match(/\*\*Neden bilmiyorsun:\*\*\s*([^\n]+)/);
  let note = why ? clean(why[1]) : "";
  if (!note) {
    note =
      body
        .split("\n")
        .map(clean)
        .find((l) => l && !/^https?:/.test(l) && l !== clean(head) && !l.includes(head)) || "";
  }
  if (note.length > 160) {
    note = `${note.slice(0, 157).trimEnd()}…`;
  }
  return { url, artist, title, note, by: clean(sign[1]), at: new Date(m.created_at) };
}

// Kanaldaki radyo şarkıları, eskiden yeniye
export async function loadRadioSongs(limit = 50) {
  const data = await ajax(`/chat/api/channels/${CHANNEL_ID}/messages`, {
    data: { page_size: limit, direction: "past" },
  });
  return (data.messages || [])
    .filter((m) => !m.deleted_at)
    .map(parseRadioMessage)
    .filter(Boolean)
    .sort((a, b) => a.at - b.at);
}

// Radyonun defterinden son şarkılar (ziyaretçiler için), eskiden yeniye
export async function loadArchiveSongs(limit = 3) {
  const t = await ajax(`/t/${ARCHIVE_TOPIC}.json`);
  const ids = (t.post_stream?.stream || []).slice(-(limit + 8));
  if (!ids.length) {
    return [];
  }
  const r = await ajax(`/t/${ARCHIVE_TOPIC}/posts.json`, { data: { post_ids: ids, include_raw: 1 } });
  return (r.post_stream?.posts || [])
    .filter((p) => p.post_type === 1 && p.post_number > 1)
    .map((p) => parseRadioMessage({ message: p.raw, created_at: p.created_at }))
    .filter(Boolean)
    .sort((a, b) => a.at - b.at)
    .slice(-limit);
}

// Çalma sırası: en son günün (bugün varsa bugünün) şarkıları baştan; bitince önceki günlere geçer.
// Yalnızca Spotify ve YouTube bağlantıları çalara girer.
export function dayQueue(songs, now = new Date()) {
  const rows = (songs || [])
    .map((s) => ({ s, media: s.url ? mediaFromUrl(s.url) : null, day: istanbul(s.at).day }))
    .filter((x) => x.media);
  if (!rows.length) {
    return { items: [], count: 0, label: "", latestIndex: 0 };
  }
  const days = [...new Set(rows.map((x) => x.day))].sort().reverse();
  const ordered = days.flatMap((d) => rows.filter((x) => x.day === d));
  const count = rows.filter((x) => x.day === days[0]).length;
  const today = istanbul(now).day;
  const yesterday = istanbul(new Date(now.getTime() - 864e5)).day;
  let label;
  if (days[0] === today) {
    label = count === 1 ? "bugünün şarkısı" : `bugünün ${count} şarkısı`;
  } else if (days[0] === yesterday) {
    label = count === 1 ? "dünün şarkısı" : `dünün ${count} şarkısı`;
  } else {
    label = count === 1 ? "son şarkı" : `son ${count} şarkı`;
  }
  return {
    items: ordered.map((x) => ({ ...x.media, artist: x.s.artist, title: x.s.title, note: x.s.note })),
    count,
    label,
    latestIndex: count - 1,
  };
}

export function playRadio(queue, start = 0, url = CHANNEL_URL) {
  if (!queue?.items?.length) {
    return;
  }
  playQueue(queue.items, start, { title: "Kepenk Radyosu", url });
}

// Mini çalardan gelen olay radyo sırasına mı ait?
export function isRadioEvent(detail) {
  return !!detail?.playing && (detail?.listUrl === CHANNEL_URL || detail?.listUrl === ARCHIVE_URL);
}
