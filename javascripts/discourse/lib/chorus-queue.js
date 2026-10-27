// Chorus · kalıcı mini çalar
// Bir listeye basınca liste baştan (ya da seçilen satırdan) çalmaya başlar; şarkı bitince sıradaki gelir.
// Çalar sayfanın dışında durur, site içinde gezerken müzik kesilmez.
// Spotify ve YouTube'un kendi oynatıcıları kullanılır; ses Chorus'ta barındırılmaz.

const SPOTIFY_ORIGIN = "https://open.spotify.com";
const YT_ORIGIN = /^https:\/\/www\.youtube(-nocookie)?\.com$/;

const state = {
  items: [],
  i: 0,
  meta: null,
  playing: false,
  frame: null,
  seen: false,
  bar: null,
  listening: false,
};

function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) {
    n.className = cls;
  }
  if (text !== undefined) {
    n.textContent = text;
  }
  return n;
}

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

function emit() {
  const it = state.items[state.i];
  document.dispatchEvent(new CustomEvent("chorus:queue", { detail: { url: it?.url || null, playing: state.playing, listUrl: state.meta?.url || null } }));
}

function bar() {
  if (state.bar) {
    return state.bar;
  }
  const b = el("aside", "chorus-mini");
  b.setAttribute("aria-label", "Chorus çalar");
  b.hidden = true;
  b.innerHTML = `
    <div class="chorus-mini__top">
      <span class="chorus-mini__dot" aria-hidden="true"></span>
      <span class="chorus-mini__label">ŞİMDİ ÇALIYOR</span>
      <a class="chorus-mini__list"></a>
      <span class="chorus-mini__count"></span>
    </div>
    <div class="chorus-mini__body">
      <div class="chorus-mini__frame"></div>
      <div class="chorus-mini__meta"><strong></strong><span></span><em></em></div>
      <div class="chorus-mini__ctrl">
        <button type="button" data-q="prev" aria-label="Önceki şarkı">⏮</button>
        <button type="button" data-q="toggle" aria-label="Çal ya da duraklat">⏯</button>
        <button type="button" data-q="next" aria-label="Sonraki şarkı">⏭</button>
        <button type="button" data-q="close" aria-label="Çaları kapat">×</button>
      </div>
    </div>`;
  b.addEventListener("click", (e) => {
    const q = e.target.closest("[data-q]")?.dataset.q;
    if (q === "prev") {
      go(state.i - 1);
    } else if (q === "next") {
      go(state.i + 1);
    } else if (q === "toggle") {
      toggle();
    } else if (q === "close") {
      stop();
    }
  });
  document.body.appendChild(b);
  state.bar = b;
  return b;
}

function render() {
  const b = bar();
  const it = state.items[state.i];
  b.hidden = !it;
  document.body.classList.toggle("chorus-mini-open", !!it);
  if (!it) {
    return;
  }
  b.classList.toggle("is-playing", state.playing);
  b.classList.toggle("is-youtube", it.kind === "youtube");
  const list = b.querySelector(".chorus-mini__list");
  list.textContent = state.meta?.title || "";
  list.href = state.meta?.url || "#";
  list.hidden = !state.meta?.title;
  b.querySelector(".chorus-mini__count").textContent = state.items.length > 1 ? `${state.i + 1} / ${state.items.length}` : "";
  b.querySelector(".chorus-mini__meta strong").textContent = it.title || "";
  b.querySelector(".chorus-mini__meta span").textContent = it.artist || "";
  b.querySelector(".chorus-mini__meta em").textContent = it.note || "";
  b.querySelector('[data-q="prev"]').disabled = state.i <= 0;
  b.querySelector('[data-q="next"]').disabled = state.i >= state.items.length - 1;
  b.querySelector('[data-q="toggle"]').textContent = state.playing ? "⏸" : "▶";
}

function frameFor(it, seconds = 0) {
  const f = document.createElement("iframe");
  f.setAttribute("allow", "autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture");
  f.setAttribute("frameborder", "0");
  if (it.kind === "spotify") {
    f.src = `https://open.spotify.com/embed/${it.type}/${it.id}?theme=0`;
    f.title = "Spotify oynatıcı";
    f.className = "chorus-mini__sp";
    f.addEventListener("load", () => {
      // Spotify oynatıcı hazır olunca çalmaya başlat (resume iki kez gelse de zararsız)
      setTimeout(() => command("resume"), 900);
      setTimeout(() => !state.seen && command("resume"), 2200);
    });
  } else {
    const list = it.type === "playlist" ? `videoseries?list=${it.id}&` : `${it.id}?`;
    const start = seconds > 0 ? `&start=${seconds}` : "";
    f.src = `https://www.youtube.com/embed/${list}enablejsapi=1&autoplay=1&playsinline=1&rel=0${start}&origin=${encodeURIComponent(window.location.origin)}`;
    f.title = "YouTube oynatıcı";
    f.className = "chorus-mini__yt";
    f.addEventListener("load", () => {
      f.contentWindow?.postMessage(JSON.stringify({ event: "listening", id: 1, channel: "widget" }), "*");
    });
  }
  return f;
}

function load(i, seconds = 0) {
  state.i = i;
  state.seen = false;
  // Spotify'da saniyeye sarma, şarkı çalmaya başladıktan sonra yapılır
  state.pendingSeek = seconds > 0 && state.items[i]?.kind === "spotify" ? seconds : 0;
  state.playing = true;
  const slot = bar().querySelector(".chorus-mini__frame");
  slot.replaceChildren();
  const it = state.items[i];
  if (it) {
    state.frame = frameFor(it, seconds);
    slot.appendChild(state.frame);
  }
  render();
  emit();
}

function command(cmd) {
  const it = state.items[state.i];
  const w = state.frame?.contentWindow;
  if (!it || !w) {
    return;
  }
  if (it.kind === "spotify") {
    w.postMessage({ command: cmd }, SPOTIFY_ORIGIN);
  } else {
    const func = { resume: "playVideo", pause: "pauseVideo", toggle: state.playing ? "pauseVideo" : "playVideo" }[cmd];
    w.postMessage(JSON.stringify({ event: "command", func, args: [] }), "*");
  }
}

function toggle() {
  const it = state.items[state.i];
  if (it?.kind === "spotify") {
    command("toggle");
  } else {
    command(state.playing ? "pause" : "resume");
  }
}

function go(i) {
  if (i < 0 || i >= state.items.length) {
    return;
  }
  load(i);
}

// Tek şarkılık bağlantılarda (track, video) bitişte sıradakine geç; albüm ve çalma listesini oynatıcı kendisi yürütür
function autoAdvances(it) {
  return it && (it.type === "track" || it.type === "episode" || it.type === "video");
}

function ended() {
  if (autoAdvances(state.items[state.i]) && state.i < state.items.length - 1) {
    load(state.i + 1);
  } else {
    state.playing = false;
    render();
    emit();
  }
}

function listen() {
  if (state.listening) {
    return;
  }
  state.listening = true;
  window.addEventListener("message", (e) => {
    if (!state.frame || e.source !== state.frame.contentWindow) {
      return;
    }
    const d = parse(e.data);
    if (!d) {
      return;
    }
    if (e.origin === SPOTIFY_ORIGIN) {
      if (d.type === "ready") {
        command("resume");
      }
      if (d.type !== "playback_update" || !d.payload) {
        return;
      }
      const p = d.payload;
      if (p.position > 0 && !p.isPaused) {
        state.seen = true;
        if (state.pendingSeek) {
          const secs = state.pendingSeek;
          state.pendingSeek = 0;
          state.frame.contentWindow?.postMessage({ command: "seek", timestamp: secs }, SPOTIFY_ORIGIN);
        }
      }
      const wasPlaying = state.playing;
      state.playing = !p.isPaused;
      if (state.seen && p.isPaused && p.duration > 0 && (p.position === 0 || p.duration - p.position < 1500)) {
        state.seen = false;
        return ended();
      }
      if (wasPlaying !== state.playing) {
        render();
        emit();
      }
    } else if (YT_ORIGIN.test(e.origin)) {
      const st = d.event === "onStateChange" ? d.info : d.info?.playerState;
      if (typeof st !== "number") {
        return;
      }
      if (st === 0) {
        return ended();
      }
      const playing = st === 1 || st === 3;
      if (playing !== state.playing && st !== -1) {
        state.playing = playing;
        render();
        emit();
      }
    }
  });
}

// Listeyi çal: items = [{ kind, type, id, url, artist, title, note }], meta = { title, url }
export function playQueue(items, start = 0, meta = null, seconds = 0) {
  const list = (items || []).filter((x) => x && x.kind && x.id);
  if (!list.length) {
    return;
  }
  listen();
  state.items = list;
  state.meta = meta;
  const s = Math.max(0, Math.min(list.length - 1, start));
  load(s, seconds);
}

// Çalan sıra bu listeye aitse yeni parçaları sona ekle (ortak listeye şarkı eklenince sıra uzar)
export function extendQueue(listUrl, items) {
  if (!listUrl || state.meta?.url !== listUrl || !state.items.length) {
    return false;
  }
  const mevcut = new Set(state.items.map((x) => x.url));
  const yeni = (items || []).filter((x) => x && x.kind && x.id && !mevcut.has(x.url));
  if (!yeni.length) {
    return false;
  }
  state.items = [...state.items, ...yeni];
  render();
  return true;
}

export function stop() {
  state.items = [];
  state.playing = false;
  state.frame = null;
  bar().querySelector(".chorus-mini__frame").replaceChildren();
  render();
  emit();
}

// Başka bir ses çalacaksa (önizleme kesiti) mini çaları duraklat
export function pause() {
  if (state.playing && state.frame) {
    command("pause");
    state.playing = false;
    render();
    emit();
  }
}

export function nowPlaying() {
  return { item: state.items[state.i] || null, playing: state.playing, meta: state.meta };
}

// Çalan şarkıyı saniyeye sar; şarkı zaten çalıyorsa çaları yeniden kurmaz
export function seekCurrent(url, seconds) {
  const it = state.items[state.i];
  if (!it || it.url !== url || !state.frame) {
    return false;
  }
  if (it.kind === "spotify") {
    state.frame.contentWindow?.postMessage({ command: "seek", timestamp: seconds }, SPOTIFY_ORIGIN);
    state.frame.contentWindow?.postMessage({ command: "resume" }, SPOTIFY_ORIGIN);
  } else {
    state.frame.contentWindow?.postMessage(JSON.stringify({ event: "command", func: "seekTo", args: [seconds, true] }), "*");
    state.frame.contentWindow?.postMessage(JSON.stringify({ event: "command", func: "playVideo", args: [] }), "*");
  }
  return true;
}
