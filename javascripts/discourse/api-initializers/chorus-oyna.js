import { apiInitializer } from "discourse/lib/api";
import ChorusMuzikoloji from "../components/chorus-muzikoloji";
import { dortDortluk, dortlukBittiMi } from "../lib/chorus-dortluk";
import { korOyunu } from "../lib/chorus-kor-oyun";
import { gonderiNotu, miniNotu, notlariYukle, sohbetNotu } from "../lib/chorus-notlar";
import { kesitDurdur } from "../lib/chorus-onizleme";
import { ortakCevap, ortakListe } from "../lib/chorus-ortak";
import { nowPlaying } from "../lib/chorus-queue";
import { dugme, el } from "../lib/chorus-oyun";
import { ARCHIVE_TOPIC, CHANNEL_ID, yildizTemizle } from "../lib/chorus-radyo";
import { gununSorusu } from "../lib/chorus-soru";

// Kör Dinleme: şarkı açık olan ekip üyesine (konuyu açtı ya da cevap yazdı) oyunu deneme düğmesi.
// Deneme bu tarayıcıya kaydedilmez, cevaplar bulanıklaşmaz; konuya yeniden girince baştan başlar.
function ekipDenemesi(w, secenek) {
  if (w.dataset.korOyun || w.nextElementSibling?.classList.contains("chorus-kor-dene")) {
    return;
  }
  const kutu = el("div", "chorus-kor-dene");
  const b = dugme("btn btn-small", "Oyunu üye gibi dene");
  kutu.append(b, el("span", null, "Şarkı sana açık: konuyu sen açtın ya da cevap yazdın. Deneme kaydedilmez."));
  b.addEventListener("click", () => {
    kutu.remove();
    w.classList.add("chorus-kor", "is-locked");
    korOyunu(w, { ...secenek, kalici: false });
  });
  w.after(kutu);
}

// Chorus · Oyna, notlar ve ortak liste
// 1 · Kepenk'in notları: mini çalar, radyo sohbeti ve şarkı gönderileri (lib/chorus-notlar.js)
// 2 · Kör Dinleme oyunu: [wrap=kor-dinleme sanatci="…" sarki="…"] (lib/chorus-kor-oyun.js)
// 3 · Dört Dörtlük: [wrap=dort-dortluk …] (lib/chorus-dortluk.js)
// 4 · Günün Sorusu: anket ya da [wrap=bilgi dogru="…"] (lib/chorus-soru.js)
// 5 · Ortak liste: "ortak-liste" etiketli liste konuları (lib/chorus-ortak.js)
//     Radyo sohbetinde ve radyonun defterinde kaçışlı ** işaretleri silinir (lib/chorus-radyo.js)
// 6 · Müzikoloji kartları: Oku ve Oku › Müzikoloji sayfasının başı (components/chorus-muzikoloji.gjs)

export default apiInitializer((api) => {
  const user = api.getCurrentUser();
  const composer = () => api.container.lookup("service:composer");

  // Notları erken yükle; mini çalarda şarkı değişince not var mı bak
  setTimeout(() => notlariYukle(), 3000);
  let sonUrl = null;
  document.addEventListener("chorus:queue", (e) => {
    const url = e.detail?.playing ? e.detail.url : null;
    if (url && url !== sonUrl) {
      sonUrl = url;
      miniNotu(nowPlaying().item);
    }
  });

  const cevapYaz = (topic) => (metin) =>
    composer().open({ action: "reply", topic, draftKey: topic.draft_key, draftSequence: topic.draft_sequence, reply: metin });

  api.decorateCookedElement(
    (elem, helper) => {
      const post = helper?.getModel?.();
      const topic = post?.topic;
      if (!post || !topic) {
        return;
      }
      const ilk = post.post_number === 1;

      // 2 · Kör Dinleme oyunu. Şarkı açıksa (konuyu açan ekip ya da cevap yazmış) oyun çıkmaz;
      //     ekip "Oyunu üye gibi dene" ile dener (eski yol: konsolda window.chorusOyunTest = true).
      if (ilk) {
        elem.querySelectorAll(".d-wrap[data-wrap='kor-dinleme'][data-sanatci][data-sarki]").forEach((w) => {
          const zorla = !!window.chorusOyunTest;
          if (!w.classList.contains("is-locked") && !zorla) {
            if (user?.staff) {
              ekipDenemesi(w, { topic, user, cevapYaz: cevapYaz(topic) });
            }
            return;
          }
          if (zorla) {
            w.classList.add("is-locked");
            document.body.dataset.chorusKorLocked = String(topic.id);
          }
          korOyunu(w, { topic, user, cevapYaz: cevapYaz(topic) });
        });
      }

      // 3 · Dört Dörtlük: bitirmeden cevaplar bulanık
      if (ilk) {
        const dd = elem.querySelector(".d-wrap[data-wrap='dort-dortluk']");
        if (dd) {
          if (!dortlukBittiMi(topic.id)) {
            document.body.dataset.chorusDortlukLocked = String(topic.id);
          }
          dortDortluk(dd, { topic, user, cevapYaz: cevapYaz(topic), bitti: () => delete document.body.dataset.chorusDortlukLocked });
        }
      }

      // 4 · Günün Sorusu (anket olan her ilk gönderi; bilgi sorusunda doğru cevap işaretlenir)
      if (ilk && elem.querySelector(".poll, .poll-outlet")) {
        gununSorusu(elem, { post, topic });
      }

      // 5 · Ortak liste: ilk gönderide bütün şarkılar, cevaplarda ▶ bütün listeyi çalar
      if (ilk) {
        ortakListe(elem, { topic, user, composer: composer() });
      } else {
        ortakCevap(elem, { topic, post });
      }

      // radyonun defterinde kaçışlı ** görünmesin
      if (topic.id === ARCHIVE_TOPIC) {
        yildizTemizle(elem);
      }

      // 1 · Kepenk'in notu (not defterinde, radyo defterinde ve oyunlarda değil: cevabı ele vermesin)
      if (![34, 35].includes(topic.id) && ![11, 19, 20].includes(topic.category_id)) {
        gonderiNotu(elem);
      }
    },
    { id: "chorus-oyna", afterAdopt: true }
  );

  // 1 · radyo sohbetinde şarkının altında Kepenk'in notu
  // Sohbet süsleyicisi yalnızca mesajın öğesini verir (kanal ve mesaj gelmez) ve bunu öğe sayfaya
  // eklenmeden yapar; öğe yerine oturunca hangi kanalda olduğuna bakılır.
  const radyoMu = (elem) => {
    const kanal = elem?.closest?.(".chat-channel[data-id]")?.dataset.id || elem?.closest?.("[data-chat-channel-id]")?.dataset.chatChannelId;
    return Number(kanal) === CHANNEL_ID;
  };
  api.decorateChatMessage?.((elem) => {
    const bak = (deneme = 0) => {
      if (!elem?.isConnected) {
        if (deneme < 5) {
          requestAnimationFrame(() => bak(deneme + 1));
        }
        return;
      }
      if (radyoMu(elem)) {
        yildizTemizle(elem);
        sohbetNotu(elem);
      }
    };
    bak();
  });

  api.onPageChange((url) => {
    kesitDurdur();
    const id = document.body.dataset.chorusDortlukLocked;
    if (id && !url.includes(`/${id}`)) {
      delete document.body.dataset.chorusDortlukLocked;
    }
  });

  // 6 · müzikoloji kartları
  api.renderInOutlet("discovery-list-container-top", ChorusMuzikoloji);
});
