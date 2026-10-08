// 丸ゴシック (M PLUS Rounded 1c, SIL Open Font License) をアプリと一緒に配信する。
// unicode-range で分割されているので、画面で使う文字の分だけ読み込まれ、
// Service Worker (fonts キャッシュ) が端末に保存する → 2回目以降はオフラインでも同じ見た目。
import "@fontsource/m-plus-rounded-1c/500.css";
import "@fontsource/m-plus-rounded-1c/700.css";
import "@fontsource/m-plus-rounded-1c/800.css";
