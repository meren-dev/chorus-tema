import { apiInitializer } from "discourse/lib/api";

// Chorus · Signal — tema davranışları
export default apiInitializer((api) => {
  // 1 · Reddit paylaşımı (Instagram ve TikTok'un web paylaşım adresi yok;
  //     telefonda paylaş düğmesi zaten cihazın paylaşım menüsünü açıyor)
  api.addSharingSource({
    id: "reddit",
    icon: "fab-reddit",
    title: "Reddit",
    generateUrl(link, title) {
      return `https://www.reddit.com/submit?url=${encodeURIComponent(link)}&title=${encodeURIComponent(title || "")}`;
    },
    shouldOpenInPopup: true,
    popupHeight: 620,
  });

  // 2 · "Bir eser, bir neden": yalnızca bağlantıdan oluşan paylaşımı göndermeden önce durdur.
  //     Yönetim ekibi ve özel mesajlar hariç. Tarayıcı tarafında çalışır.
  const user = api.getCurrentUser();
  api.composerBeforeSave(function () {
    if (!user || user.staff || this.privateMessage) {
      return Promise.resolve();
    }
    const raw = String(this.reply || "");
    const hasLink = /https?:\/\/\S+/i.test(raw);
    const words = raw
      .replace(/\[quote[\s\S]*?\[\/quote\]/gi, " ")
      .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
      .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
      .replace(/https?:\/\/\S+/gi, " ")
      .replace(/[^\p{L}\p{N}]+/gu, "");
    if (hasLink && words.length < 20) {
      return Promise.reject(
        "Bağlantının yanına birkaç cümle ekle: bu eser neden şimdi? Chorus'ta her bağlantı bir nedenle gelir."
      );
    }
    return Promise.resolve();
  });
});
