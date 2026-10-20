// Chorus · sayfadaki oynatıcı
// Spotify ve YouTube oynatıcılarını sayfadan çıkmadan yönetir:
// - zaman etiketine tıklayınca parçayı o saniyeye sarar,
// - yazı kutusundaki saat düğmesi için çalan parçanın saniyesini tutar.
// Spotify oynatıcısı "playback_update" mesajı gönderir; YouTube ise enablejsapi=1 ile açılan
// oynatıcıda "infoDelivery" mesajıyla o anki saniyeyi bildirir.

const SPOTIFY_ORIGIN = "https://open.spotify.com";
const YT_ORIGIN = /^https:\/\/www\.youtube(-nocookie)?\.com$/;
const last = { kind: null, frame: null, seconds: null, at: 0, started: new WeakSet() };
let listening = false;

function parse(data) {
  if (typeof data !== "string") {
    return data;
  }
  try {
    return JSON.parse(data);
  } catch {
    return null;
  }
}

export function listen() {
  if (listening) {
    return;
  }
  listening = true;
  window.addEventListener("message", (e) => {
    if (e.origin === SPOTIFY_ORIGIN) {
      const d = parse(e.data);
      if (d?.type !== "playback_update" || !d.payload) {
        return;
      }
      const frame = [...document.querySelectorAll(".chorus-spotify iframe")].find((f) => f.contentWindow === e.source);
      if (!frame) {
        return;
      }
      if (d.payload.duration > 0) {
        last.started.add(frame);
      }
      if (d.payload.position > 0 || !d.payload.isPaused) {
        Object.assign(last, { kind: "spotify", frame, seconds: Math.floor(d.payload.position / 1000), at: Date.now() });
      }
    } else if (YT_ORIGIN.test(e.origin)) {
      const d = parse(e.data);
      const t = d?.info?.currentTime;
      if (typeof t !== "number") {
        return;
      }
      const frame = [...document.querySelectorAll("iframe.chorus-yt")].find((f) => f.contentWindow === e.source);
      if (frame) {
        Object.assign(last, { kind: "youtube", frame, seconds: Math.floor(t), at: Date.now() });
      }
    }
  });
}

// Çalan (ya da en son duraklatılan) parçanın saniyesi; yoksa null
export function currentSeconds() {
  if (!last.frame || !document.body.contains(last.frame) || Date.now() - last.at > 60 * 60 * 1000) {
    return null;
  }
  return last.seconds;
}

export function fmt(secs) {
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export function youtubeFrame(id, start = 0, autoplay = false) {
  const box = document.createElement("div");
  box.className = "chorus-yt-box";
  const f = document.createElement("iframe");
  f.className = "chorus-yt";
  f.title = "YouTube oynatıcı";
  f.src =
    `https://www.youtube.com/embed/${id}?enablejsapi=1&rel=0&playsinline=1` +
    `&origin=${encodeURIComponent(window.location.origin)}&start=${start}${autoplay ? "&autoplay=1" : ""}`;
  f.setAttribute("allow", "autoplay; encrypted-media; picture-in-picture; fullscreen");
  f.setAttribute("allowfullscreen", "");
  f.addEventListener("load", () => {
    f.contentWindow?.postMessage(JSON.stringify({ event: "listening", id: 1, channel: "widget" }), "*");
  });
  box.appendChild(f);
  return box;
}

const LAZY_YT = ".lazy-video-container.youtube-onebox, .lazy-video-container[data-provider-name='youtube']";

function lazyYoutubeId(el) {
  if (el.dataset.videoId) {
    return el.dataset.videoId;
  }
  const href = el.querySelector("a[href]")?.getAttribute("href") || "";
  const src = el.querySelector("img[src]")?.getAttribute("src") || "";
  const m =
    href.match(/[?&]v=([\w-]{11})/) || href.match(/youtu\.be\/([\w-]{11})/) || href.match(/embed\/([\w-]{11})/) || src.match(/\/vi(?:_webp)?\/([\w-]{11})\//);
  return m ? m[1] : null;
}

function ytCommand(frame, func, args = []) {
  frame.contentWindow?.postMessage(JSON.stringify({ event: "command", func, args }), "*");
}

function spotifyCommand(frame, command, extra = {}) {
  frame.contentWindow?.postMessage({ command, ...extra }, SPOTIFY_ORIGIN);
}

// Etiketin bulunduğu gönderide, yoksa konunun ilk gönderisinde oynatıcıyı bul
function findPlayer(chip) {
  const scopes = [chip.closest(".cooked"), document.querySelector("#post_1 .cooked"), document.querySelector("#topic, .topic-area")];
  for (const scope of scopes) {
    if (!scope) {
      continue;
    }
    const p =
      scope.querySelector("iframe.chorus-yt") ||
      scope.querySelector(LAZY_YT) ||
      scope.querySelector(".chorus-spotify iframe");
    if (p) {
      return p;
    }
  }
  return null;
}

export function seekFromChip(chip) {
  const secs = parseInt(chip.dataset.seconds, 10) || 0;
  const p = findPlayer(chip);
  if (!p) {
    return false;
  }
  if (p.classList.contains("lazy-video-container")) {
    const id = lazyYoutubeId(p);
    if (!id) {
      return false;
    }
    const box = youtubeFrame(id, secs, true);
    (p.closest(".lazy-video-wrapper") || p).replaceWith(box);
    box.scrollIntoView({ behavior: "smooth", block: "center" });
    return true;
  }
  if (p.classList.contains("chorus-yt")) {
    ytCommand(p, "seekTo", [secs, true]);
    ytCommand(p, "playVideo");
  } else {
    // Spotify: henüz hiç çalmadıysa önce başlat, sonra sar
    if (!last.started.has(p)) {
      spotifyCommand(p, "toggle");
      setTimeout(() => spotifyCommand(p, "seek", { timestamp: secs }), 900);
    } else {
      spotifyCommand(p, "seek", { timestamp: secs });
      spotifyCommand(p, "resume");
    }
  }
  p.scrollIntoView({ behavior: "smooth", block: "center" });
  return true;
}

// Discourse'un YouTube önizlemesine tıklanınca kendi oynatıcımızı aç (saniyeyi izleyebilmek için)
export function takeOverYoutube(elem) {
  elem.addEventListener(
    "click",
    (e) => {
      const lazy = e.target.closest?.(LAZY_YT);
      const id = lazy && elem.contains(lazy) && lazyYoutubeId(lazy);
      if (!id) {
        return;
      }
      e.preventDefault();
      e.stopPropagation();
      (lazy.closest(".lazy-video-wrapper") || lazy).replaceWith(youtubeFrame(id, 0, true));
    },
    true
  );
}
