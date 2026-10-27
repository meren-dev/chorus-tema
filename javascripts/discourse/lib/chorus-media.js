// Chorus · liste biçimi ve parça bilgisi
// Beşli, liste ve seçki aynı satır biçimini kullanır:
//   1. Sanatçı · Parça · neden bu parça, tek cümle · bağlantı
// Satırdaki ilk Spotify ya da YouTube bağlantısı o satırın parçasıdır.

const SPOTIFY = /open\.spotify\.com\/(?:intl-[a-z-]+\/)?(?:embed\/)?(track|album|playlist|episode)\/([A-Za-z0-9]{22})/;
const YOUTUBE = /(?:youtube\.com\/watch\?(?:.*&)?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/shorts\/|music\.youtube\.com\/watch\?(?:.*&)?v=)([\w-]{11})/;
const YT_LIST = /[?&]list=([\w-]{10,})/;

export function mediaFromUrl(url) {
  const s = String(url || "");
  let m = s.match(SPOTIFY);
  if (m) {
    return {
      kind: "spotify",
      type: m[1],
      id: m[2],
      url: `https://open.spotify.com/${m[1]}/${m[2]}`,
      embed: `https://open.spotify.com/embed/${m[1]}/${m[2]}?theme=0`,
      height: m[1] === "track" || m[1] === "episode" ? 80 : 152,
    };
  }
  m = s.match(YOUTUBE);
  if (m) {
    return { kind: "youtube", type: "video", id: m[1], url: `https://www.youtube.com/watch?v=${m[1]}`, height: 200 };
  }
  m = s.match(YT_LIST);
  if (m && /youtube\.com/.test(s)) {
    return { kind: "youtube", type: "playlist", id: m[1], url: `https://www.youtube.com/playlist?list=${m[1]}`, height: 200 };
  }
  return null;
}

// Bir liste satırından (li) parça: { url, kind, type, id, artist, title, note }
export function itemFromLi(li) {
  const clone = li.cloneNode(true);
  clone.querySelectorAll("ol, ul, .chorus-listen, .chorus-play-row, iframe").forEach((n) => n.remove());
  let media = null;
  clone.querySelectorAll("a[href]").forEach((a) => {
    const m = mediaFromUrl(a.getAttribute("href"));
    if (m && !media) {
      media = m;
    }
    if (m) {
      a.remove();
    }
  });
  if (!media) {
    return null;
  }
  const text = clone.textContent.replace(/https?:\/\/\S+/g, "");
  const parts = text.split("·").map((x) => x.trim()).filter(Boolean);
  return {
    ...media,
    artist: parts.length > 1 ? parts[0] : "",
    title: parts.length > 1 ? parts[1] : parts[0] || "",
    note: parts.slice(2).join(" · "),
  };
}

// Pişmiş gönderi HTML'inden ilk numaralı listenin parçaları
export function itemsFromCooked(cooked, limit = 200) {
  const doc = new DOMParser().parseFromString(cooked || "", "text/html");
  const list = [...doc.querySelectorAll("ol, ul")].find((l) => !l.closest("blockquote, aside") && [...l.children].some((li) => itemFromLi(li)));
  if (!list) {
    return [];
  }
  return [...list.children].map(itemFromLi).filter(Boolean).slice(0, limit);
}

// Gönderideki "tüm liste": numaralı satırların dışındaki ilk Spotify çalma listesi / albüm
// ya da YouTube çalma listesi (bağlantı ya da sunucunun koyduğu oynatıcı)
export function sourceFromCooked(cooked) {
  const doc = new DOMParser().parseFromString(cooked || "", "text/html");
  for (const n of doc.querySelectorAll("a[href], iframe[src]")) {
    if (n.closest("li, blockquote, aside.quote")) {
      continue;
    }
    const m = mediaFromUrl(n.getAttribute("href") || n.getAttribute("src"));
    if (m && (m.type === "playlist" || m.type === "album")) {
      return m;
    }
  }
  return null;
}

// Bir liste gönderisinde çalınacaklar: numaralı şarkılar; şarkı yoksa tüm listenin kendisi (tum: true)
export function listItems(cooked, title = "", limit = 200) {
  const items = itemsFromCooked(cooked, limit);
  if (items.length) {
    return items;
  }
  const src = sourceFromCooked(cooked);
  return src ? [{ ...src, artist: "Tüm liste", title: title || "", note: "", tum: true }] : [];
}

// oEmbed (Spotify ve YouTube): başlık ve küçük görsel. Aynı bağlantı bir kez sorulur.
const oembedCache = new Map();
export function oembed(media) {
  if (!media?.url) {
    return Promise.resolve(null);
  }
  const key = `${media.kind}:${media.type}:${media.id}`;
  if (!oembedCache.has(key)) {
    const api =
      media.kind === "spotify"
        ? `https://open.spotify.com/oembed?url=${encodeURIComponent(media.url)}`
        : `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(media.url)}`;
    oembedCache.set(
      key,
      fetch(api, { credentials: "omit" })
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null)
    );
  }
  return oembedCache.get(key);
}

// Spotify'ın oEmbed'i sanatçıyı vermiyor. Künye Chorus'un kendi adresinden gelir
// (Workflows › "Spotify künye": Spotify'ın gömülü oynatıcı sayfasını okur). Gelmezse null.
// Çerez gönderilmez: istek herkese açık, akışın kayıtlarına oturum bilgisi düşmesin.
const KUNYE = "/workflows/webhooks/spotify-kunye";
const kunyeCache = new Map();
function spotifyKunye(media) {
  if (!kunyeCache.has(media.url)) {
    const ctrl = typeof AbortController === "undefined" ? null : new AbortController();
    const timer = ctrl ? setTimeout(() => ctrl.abort(), 8000) : null;
    kunyeCache.set(
      media.url,
      fetch(`${KUNYE}?u=${encodeURIComponent(media.url)}`, {
        headers: { Accept: "application/json" },
        credentials: "omit",
        signal: ctrl?.signal,
      })
        .then((r) => (r.ok ? r.json() : null))
        .then((j) => (j && (j.title || j.artist) ? { artist: String(j.artist || "").trim(), title: String(j.title || "").trim() } : null))
        .catch(() => null)
        .finally(() => clearTimeout(timer))
    );
  }
  return kunyeCache.get(media.url);
}

// Bağlantıdan başlık ve sanatçı. Bulamazsa boş döner.
const YT_NOISE = /\s*[([](official|resmi|lyric|lyrics|audio|video|music video|hd|4k|remaster|visualizer|klip)[^)\]]*[)\]]/gi;

export async function resolveMeta(media) {
  if (!media) {
    return { artist: "", title: "" };
  }
  try {
    if (media.kind === "spotify") {
      const [k, j] = await Promise.all([spotifyKunye(media), oembed(media)]);
      return { artist: k?.artist || "", title: k?.title || j?.title || "" };
    }
    const j = await oembed(media);
    const raw = String(j?.title || "").replace(YT_NOISE, "").trim();
    const dash = raw.match(/^(.+?)\s+[-–—]\s+(.+)$/);
    if (dash) {
      return { artist: dash[1].trim(), title: dash[2].trim() };
    }
    return { artist: String(j?.author_name || "").replace(/\s*(- Topic|VEVO)$/i, "").trim(), title: raw };
  } catch {
    return { artist: "", title: "" };
  }
}

// Parçaları liste satırlarına çevir
export function itemsToMarkdown(items) {
  return items
    .map((it, i) => {
      const parts = [it.artist, it.title, it.note].map((x) => String(x || "").replace(/·/g, "-").trim());
      while (parts.length && !parts[parts.length - 1]) {
        parts.pop();
      }
      return `${i + 1}. ${[...parts, it.url].join(" · ")}`;
    })
    .join("\n");
}

// Kapak görseli: Spotify ve YouTube'un herkese açık küçük görselleri (canvas'a çizilebilir, CORS açık).
// YouTube için 16:9 kare kırpma bilgisi de döner.
const coverCache = new Map();
export function coverFor(media) {
  if (!media?.id) {
    return Promise.resolve(null);
  }
  const key = `${media.kind}:${media.id}`;
  if (!coverCache.has(key)) {
    coverCache.set(
      key,
      (async () => {
        if (media.kind === "youtube" && media.type === "video") {
          return { src: `https://i.ytimg.com/vi/${media.id}/hqdefault.jpg`, crop: { x: 105, y: 45, s: 270 } };
        }
        const j = await oembed(media);
        let src = j?.thumbnail_url || null;
        // Spotify 300px yerine 640px kapak (albüm kapağı ve dörtlü çalma listesi kolajı)
        if (src && media.kind === "spotify") {
          src = src.replace("ab67616d00001e02", "ab67616d0000b273").replace("mosaic.scdn.co/300/", "mosaic.scdn.co/640/");
        }
        return src ? { src, crop: media.kind === "youtube" ? { x: 105, y: 45, s: 270 } : null } : null;
      })().catch(() => null)
    );
  }
  return coverCache.get(key);
}
