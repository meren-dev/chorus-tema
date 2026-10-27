import { apiInitializer } from "discourse/lib/api";
import DiscourseURL from "discourse/lib/url";
import ChorusBesliBanner from "../components/chorus-besli-banner";
import ChorusProfile from "../components/chorus-profile";
import ChorusVitrin from "../components/chorus-vitrin";
import ChorusRadyoBar from "../components/chorus-radyo-bar";
import { BESLILER, findBesli, gateDialog, openBesliComposer, rememberBesli } from "../lib/chorus-besli";
import { anCard, openCardDialog } from "../lib/chorus-card";
import { eserleriGoster } from "../lib/chorus-eser";
import { CHORUS_SECKILERI, isCurator, LISTELER, openListBuilder } from "../lib/chorus-list-builder";
import { EKIP, openSoruBuilder, soruBekliyor, soruZamanla } from "../lib/chorus-soru-builder";
import { decorateLists } from "../lib/chorus-lists";
import { mediaFromUrl } from "../lib/chorus-media";
import { playQueue, seekCurrent } from "../lib/chorus-queue";
import { densityStrip, linkWorkButton, listMoments, sixthPieces, targetFor, topicItems } from "../lib/chorus-witness";
import { currentSeconds, fmt, listen, seekFromChip, takeOverYoutube } from "../lib/chorus-player";

// Chorus · katılım katmanı
// 1 · Tam burada: gönderilerdeki 02:14 gibi zaman damgaları etikete dönüşür;
//     konuda Spotify ya da YouTube oynatıcısı varsa etiket şarkıyı sayfadan çıkmadan o saniyeye sarar.
// 2 · Yazı kutusunda "Tam burada" düğmesi: çalan şarkının o anki saniyesini yazar.
// 3 · Bir anı Story kartı olarak paylaşma.
// 4 · Kör dinleme: [wrap=kor-dinleme] içindeki şarkının adı, cevap yazana kadar kapalı.
// 5 · Profil bloğu (components/chorus-profile.gjs).
// 0 · Spotify bağlantılarını oynatıcıya çevirme.
// 6 · Beşli kuralı: ilk paylaşım beşli; herkesin tek beşlisi var (lib/chorus-besli.js).
// 7 · Listeler: liste oluşturucu (lib/chorus-list-builder.js) ve kalıcı mini çalar (lib/chorus-queue.js).
//     Günün Sorusu: soru penceresi ve yayın zamanlayıcısı (lib/chorus-soru-builder.js).
// 8 · Aktif tanık: Tam burada yoğunluk şeridi ve "Bir eser bağla" (lib/chorus-witness.js, lib/chorus-eser.js).

const TS_TEST = /(^|[^\d:])(\d{1,2}):([0-5]\d)(?![\d:])/;
const TS_ALL = /(^|[^\d:])(\d{1,2}):([0-5]\d)(?![\d:])/g;
const SKIP = "a, code, pre, .chorus-ts, .onebox, aside, .lazy-video-container, .d-wrap[data-wrap='kor-dinleme'], .mention";

function youtubeId(cooked) {
  const s = String(cooked || "");
  const m =
    s.match(/data-video-id="([\w-]{11})"[^>]*data-provider-name="youtube"/) ||
    s.match(/data-provider-name="youtube"[^>]*data-video-id="([\w-]{11})"/) ||
    s.match(/youtube\.com\/watch\?v=([\w-]{11})/) ||
    s.match(/youtu\.be\/([\w-]{11})/);
  return m ? m[1] : null;
}

const SPOTIFY_LINK = /open\.spotify\.com\/(?:intl-[a-z-]+\/)?(?:track|album|playlist|episode)\//;

function hasMedia(...cooked) {
  return cooked.some((c) => youtubeId(c) || SPOTIFY_LINK.test(String(c || "")));
}

function decorateTimestamps(elem, playable) {
  const nodes = [];
  const walker = document.createTreeWalker(elem, NodeFilter.SHOW_TEXT, {
    acceptNode(n) {
      const p = n.parentElement;
      if (!p || p.closest(SKIP)) {
        return NodeFilter.FILTER_REJECT;
      }
      return TS_TEST.test(n.nodeValue) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
    },
  });
  while (walker.nextNode()) {
    nodes.push(walker.currentNode);
  }
  const chips = [];
  nodes.forEach((node) => {
    const text = node.nodeValue;
    const frag = document.createDocumentFragment();
    let last = 0;
    text.replace(TS_ALL, (match, pre, mm, ss, offset) => {
      const start = offset + pre.length;
      frag.appendChild(document.createTextNode(text.slice(last, start)));
      const label = `${mm.padStart(2, "0")}:${ss}`;
      const secs = parseInt(mm, 10) * 60 + parseInt(ss, 10);
      let chip;
      if (playable) {
        chip = document.createElement("button");
        chip.type = "button";
        chip.title = "Şarkıyı bu saniyeden çal";
      } else {
        chip = document.createElement("span");
      }
      chip.className = "chorus-ts";
      chip.textContent = label;
      chip.dataset.seconds = secs;
      frag.appendChild(chip);
      chips.push(chip);
      last = start + match.length - pre.length;
      return match;
    });
    frag.appendChild(document.createTextNode(text.slice(last)));
    node.parentNode.replaceChild(frag, node);
  });
  return chips;
}

// Spotify bağlantıları sunucuda yalnızca kapak görseline dönüşüyor (Spotify oynatıcı vermiyor).
// Tek başına duran Spotify bağlantısını Spotify'ın kendi oynatıcısıyla değiştiriyoruz.
const SPOTIFY = /^https:\/\/open\.spotify\.com\/(?:intl-[a-z-]+\/)?(track|album|playlist|episode|artist|show)\/([A-Za-z0-9]{22})/;

function embedSpotify(elem) {
  elem.querySelectorAll('a[href*="open.spotify.com/"]').forEach((a) => {
    if (a.closest("blockquote, aside.quote, .chorus-spotify")) {
      return;
    }
    const m = (a.getAttribute("href") || "").match(SPOTIFY);
    const block = a.closest("p, aside.onebox");
    if (!m || !block || !elem.contains(block)) {
      return;
    }
    const solo = block.tagName === "ASIDE" || block.textContent.trim() === a.textContent.trim();
    if (!solo) {
      return;
    }
    const box = document.createElement("div");
    box.className = "chorus-spotify";
    const f = document.createElement("iframe");
    f.src = `https://open.spotify.com/embed/${m[1]}/${m[2]}?theme=0`;
    f.width = "100%";
    f.height = m[1] === "track" || m[1] === "episode" ? "152" : "352";
    f.setAttribute("frameborder", "0");
    f.setAttribute("allow", "autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture");
    f.setAttribute("loading", "lazy");
    f.title = "Spotify oynatıcı";
    box.appendChild(f);
    block.replaceWith(box);
  });
}

function isRevealed(topic, user) {
  if (!user || !topic) {
    return false;
  }
  if (user.staff && user.id === topic.details?.created_by?.id) {
    return true;
  }
  if ((topic.details?.participants || []).some((p) => p.id === user.id)) {
    return true;
  }
  return (topic.postStream?.posts || []).some((p) => p.user_id === user.id && p.post_number > 1);
}

function unlockKor() {
  delete document.body.dataset.chorusKorLocked;
  document.querySelectorAll(".chorus-kor.is-locked").forEach((el) => el.classList.remove("is-locked"));
}

export default apiInitializer((api) => {
  const user = api.getCurrentUser();
  listen();

  // etikete tıklayınca sayfadaki oynatıcıyı o saniyeye sar
  document.addEventListener("click", (e) => {
    const chip = e.target.closest?.("button.chorus-ts");
    if (!chip) {
      return;
    }
    e.preventDefault();
    const secs = parseInt(chip.dataset.seconds, 10) || 0;
    const scope = chip.closest(".cooked");
    // gönderinin kendi oynatıcısı varsa o sarılır; yoksa etiketin ait olduğu şarkı mini çalarda o saniyeden başlar
    const ownPlayer = scope?.querySelector("iframe, .lazy-video-container");
    const topic = api.container.lookup("controller:topic")?.model;
    const t = !ownPlayer && scope && !chip.classList.contains("chorus-density__dot") ? targetFor(scope, chip, topicItems(topic)) : null;
    if (t) {
      const it = t.items[t.index];
      if (!seekCurrent(it.url, secs)) {
        playQueue(t.items, t.index, topic ? { title: topic.title, url: `/t/${topic.slug}/${topic.id}` } : null, secs);
      }
    } else {
      seekFromChip(chip);
    }
  });

  // 5 · profil bloğu
  api.renderInOutlet("above-user-summary-stats", ChorusProfile);

  // 6 · beşli kuralı
  api.renderInOutlet("above-main-container", ChorusBesliBanner);
  // 9 · ziyaretçi vitrini (components/chorus-vitrin.gjs)
  api.renderInOutlet("above-main-container", ChorusVitrin);
  api.renderInOutlet("above-main-container", ChorusRadyoBar);
  const gated = () => {
    if (!user) {
      return false;
    }
    try {
      return !user.staff || localStorage.getItem("chorus-gate-test") === "1";
    } catch {
      return !user.staff;
    }
  };
  const besliFirst = (composer) =>
    gateDialog({
      label: "İLK ADIM",
      title: "Önce kendini tanıt",
      text: "Burada yazdığın ilk şey beşlin olur: seni anlatan beş şarkı, her birine tek cümle. Sonra istediğin yerde yazabilirsin. Sadece dinlemek için buna gerek yok.",
      actions: [
        { label: "Beş şarkımı seç", primary: true, run: () => openBesliComposer(composer, api.container.lookup("service:site"), user) },
        { label: "Şimdilik sadece dinleyeceğim" },
      ],
    });
  const alreadyHave = (b) =>
    gateDialog({
      label: "BEŞLİN",
      title: "Beşlin zaten var",
      text: "Herkesin tek bir beşlisi olur. Değiştirmek için beşlinin ilk gönderisini düzenle; profilin kendiliğinden güncellenir.",
      actions: [{ label: "Beşlime git", primary: true, run: () => DiscourseURL.routeTo(`/t/${b.slug}/${b.id}`) }, { label: "Vazgeç" }],
    });

  api.modifyClass(
    "service:composer",
    (Superclass) =>
      class extends Superclass {
        async open(opts = {}) {
          const act = opts.action;
          if (gated() && (act === "createTopic" || act === "reply")) {
            const cat = Number(opts.topicCategoryId ?? opts.categoryId ?? opts.prioritizedCategoryId ?? opts.category?.id);
            const b = await findBesli(user.username);
            if (!b && !(act === "createTopic" && cat === BESLILER)) {
              besliFirst(this);
              return;
            }
            if (b && act === "createTopic" && cat === BESLILER) {
              alreadyHave(b);
              return;
            }
          }
          // Listeler'de yeni konu: önce liste oluşturucu, sonra hazır gövdeyle yazı kutusu
          if (act === "createTopic" && !opts.topicBody && !opts.chorusSkipBuilder) {
            const cat = Number(opts.topicCategoryId ?? opts.categoryId ?? opts.prioritizedCategoryId ?? opts.category?.id);
            if (cat === LISTELER || cat === CHORUS_SECKILERI) {
              const site = api.container.lookup("service:site");
              openListBuilder({
                staff: isCurator(user),
                onDone: ({ title, body, categoryId, tags }) =>
                  this.openNewTopic({ category: (site.categories || []).find((c) => c.id === categoryId), title, body, tags }),
              });
              return;
            }
            // Günün Sorusu: iki biçimli şablon yerine soru penceresi (lib/chorus-soru-builder.js).
            // Ekip yayın saatini seçer: konu ekip içinde açılır, kaydedilince taşıma zamanlayıcısı kurulur.
            const gununSorusu = Number(settings.gunun_sorusu) || 19;
            if (cat === gununSorusu && isCurator(user)) {
              const site = api.container.lookup("service:site");
              const kat = (id) => (site.categories || []).find((c) => c.id === id);
              openSoruBuilder({
                zamanla: !!user.staff && !!kat(EKIP),
                onDone: ({ title, body, zaman }) => {
                  soruBekliyor(zaman ? title : null, zaman, gununSorusu);
                  this.openNewTopic({ category: kat(zaman ? EKIP : gununSorusu), title, body });
                },
              });
              return;
            }
          }
          return super.open(...arguments);
        }
      }
  );

  // yazı kutusunda kategori sonradan değiştirilirse gönderirken yine bak
  api.composerBeforeSave?.(async () => {
    const model = api.container.lookup("service:composer")?.model;
    if (!gated() || !model || !["createTopic", "reply"].includes(model.action)) {
      return;
    }
    const b = await findBesli(user.username);
    const inBesliler = model.action === "createTopic" && model.categoryId === BESLILER;
    if (!b && !inBesliler) {
      besliFirst(api.container.lookup("service:composer"));
      return Promise.reject();
    }
    if (b && inBesliler) {
      alreadyHave(b);
      return Promise.reject();
    }
  });

  api.onAppEvent("topic:created", (createdPost, composer) => {
    const cat = composer?.categoryId ?? composer?.category?.id;
    if (user && cat === BESLILER && createdPost?.topic_id) {
      rememberBesli(user.username, { id: createdPost.topic_id, slug: createdPost.topic_slug || "-", title: composer?.title });
      api.container.lookup("service:app-events").trigger("chorus:besli-created");
    }
    // ekip içinde açılan Günün Sorusu: yayın zamanlayıcısını kur
    soruZamanla(createdPost, composer, {
      toasts: api.container.lookup("service:toasts"),
      dialog: api.container.lookup("service:dialog"),
    });
  });

  // 1, 3, 4 · gönderi süslemeleri
  api.decorateCookedElement(
    (elem, helper) => {
      const post = helper?.getModel?.();
      const topic = post?.topic;

      // 0 · Spotify oynatıcısı ve saniyesi izlenebilen YouTube oynatıcısı
      decorateLists(elem, topic ? { title: topic.title, url: `/t/${topic.slug}/${topic.id}` } : null);
      embedSpotify(elem);
      takeOverYoutube(elem);
      // bağlanan eserler: Instagram gömülü, eski biçimdeki "Eserin bağlantısı: …" önizlemeli
      // (yazı kutusunun önizlemesinde değil: her tuşta yeniden yüklenmesin)
      if (post) {
        eserleriGoster(elem);
      }

      // 4 · kör dinleme
      const kor = elem.querySelectorAll(".d-wrap[data-wrap='kor-dinleme']");
      if (kor.length) {
        const open = isRevealed(topic, user);
        kor.forEach((w) => {
          w.classList.add("chorus-kor");
          if (!w.querySelector(".chorus-kor__veil")) {
            const veil = document.createElement("div");
            veil.className = "chorus-kor__veil";
            veil.innerHTML =
              '<span class="chorus-kor__label">KÖR DİNLEME</span><span class="chorus-kor__hint">Şarkının adı gizli. Dinle, ne hissettiğini tek kelimeyle yaz, adı açılsın.</span>';
            w.appendChild(veil);
          }
          w.classList.toggle("is-locked", !open);
        });
        if (!open && topic?.id) {
          document.body.dataset.chorusKorLocked = String(topic.id);
        }
      }

      // 8 · aktif tanık: ilk gönderide yoğunluk şeridi ve "Bir eser bağla"
      if (post?.post_number === 1 && topic) {
        densityStrip(elem, topic);
        listMoments(elem, topic);
        if (topic.category_id === BESLILER) {
          sixthPieces(elem, topic, user, api.container.lookup("service:composer"));
        }
        if ([6, 10, 12].includes(topic.category_id) && user) {
          linkWorkButton(elem, topic, api.container.lookup("service:composer"));
        }
      }

      // 1 · zaman damgaları
      const firstCooked = topic?.postStream?.posts?.[0]?.cooked || "";
      const chips = decorateTimestamps(elem, hasMedia(post?.cooked, firstCooked));

      // 3 · anı Story kartı olarak paylaş
      if (chips.length && user && post && !elem.querySelector(".chorus-an-share")) {
        const chip = chips[0];
        const block = chip.closest("p, li") || elem;
        const note = block.textContent.replace(chip.textContent, "").replace(/^[\s·:.\-]+/, "").trim();
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "btn btn-flat btn-small chorus-an-share";
        btn.textContent = "Bu anı paylaş";
        btn.addEventListener("click", async () => {
          const links = [...elem.querySelectorAll("a[href]")].map((a) => a.getAttribute("href"));
          const firstLinks = [...new DOMParser().parseFromString(firstCooked, "text/html").querySelectorAll("a[href]")].map((a) => a.getAttribute("href"));
          const media = [...links, ...firstLinks].map(mediaFromUrl).find(Boolean) || null;
          const c = await anCard({
            media,
            time: chip.textContent,
            note: note.slice(0, 220),
            track: topic?.title || "",
            name: post.name || post.username,
          });
          await openCardDialog(c, {
            filename: `chorus-an-${post.id}.png`,
            title: "Tam burada",
            link: `${window.location.origin}/t/${topic?.slug || "-"}/${topic?.id}/${post.post_number}`,
          });
        });
        elem.appendChild(btn);
      }
    },
    { id: "chorus-katilim" }
  );

  api.onAppEvent("post:created", () => unlockKor());
  api.onAppEvent("composer:created-post", () => unlockKor());
  api.onPageChange((url) => {
    const id = document.body.dataset.chorusKorLocked;
    if (id && !url.includes(`/${id}`)) {
      delete document.body.dataset.chorusKorLocked;
    }
  });

  // 2 · yazı kutusunda "Tam burada" ve "Liste" düğmeleri
  api.onToolbarCreate((toolbar) => {
    toolbar.addButton({
      id: "chorus-liste",
      group: "extras",
      icon: "list-ol",
      translatedTitle: "Liste ekle: bağlantıları yapıştır, sırala, her şarkıya tek cümle",
      perform: (e) => openListBuilder({ mode: "insert", onDone: ({ markdown }) => e.addText(markdown) }),
    });
    toolbar.addButton({
      id: "chorus-tam-burada",
      group: "extras",
      icon: "clock",
      translatedTitle: "Çalan şarkının şu anki saniyesini ekle (Tam burada)",
      perform: (e) => {
        const secs = currentSeconds();
        e.addText(`\n${secs === null ? "00:00" : fmt(secs)} · `);
      },
    });
  });
});
