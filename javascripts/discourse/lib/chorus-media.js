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

// Bağlantıdan başlık ve sanatçı (Spotify ve YouTube oEmbed). Bulamazsa boş döner.
const YT_NOISE = /\s*[([](official|resmi|lyric|lyrics|audio|video|music video|hd|4k|remaster|visualizer|klip)[^)\]]*[)\]]/gi;

export async function resolveMeta(media) {
  if (!media) {
    return { artist: "", title: "" };
  }
  try {
    if (media.kind === "spotify") {
      const j = await fetch(`https://open.spotify.com/oembed?url=${encodeURIComponent(media.url)}`).then((r) => r.json());
      return { artist: "", title: j.title || "" };
    }
    const j = await fetch(`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(media.url)}`).then((r) => r.json());
    const raw = String(j.title || "").replace(YT_NOISE, "").trim();
    const dash = raw.match(/^(.+?)\s+[-–—]\s+(.+)$/);
    if (dash) {
      return { artist: dash[1].trim(), title: dash[2].trim() };
    }
    return { artist: String(j.author_name || "").replace(/\s*(- Topic|VEVO)$/i, "").trim(), title: raw };
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
        const api =
          media.kind === "spotify"
            ? `https://open.spotify.com/oembed?url=${encodeURIComponent(media.url)}`
            : `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(media.url)}`;
        const j = await fetch(api).then((r) => r.json());
        let src = j.thumbnail_url || null;
        // Spotify 300px yerine 640px kapak
        if (src && media.kind === "spotify") {
          src = src.replace("ab67616d00001e02", "ab67616d0000b273");
        }
        return src ? { src, crop: media.kind === "youtube" ? { x: 105, y: 45, s: 270 } : null } : null;
      })().catch(() => null)
    );
  }
  return coverCache.get(key);
}
