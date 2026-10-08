/**
 * プレビュー版 (claude.ai の Artifact として公開する版) 専用。
 * 埋め込み表示やサムネイル撮影などでブラウザの IndexedDB が使えないときは、
 * メモリ上の IndexedDB (fake-indexeddb) で動かして画面が壊れないようにする。
 * 本番ビルドからは読み込まれない。
 */
import { IDBKeyRange as FakeKeyRange, indexedDB as fakeIndexedDB } from "fake-indexeddb";

function realIndexedDbUsable(): boolean {
  try {
    return typeof indexedDB !== "undefined" && indexedDB !== null && typeof indexedDB.open === "function";
  } catch {
    return false;
  }
}

if (!realIndexedDbUsable()) {
  (globalThis as { __KYOUSEI_IDB_DEPS__?: unknown }).__KYOUSEI_IDB_DEPS__ = { indexedDB: fakeIndexedDB, IDBKeyRange: FakeKeyRange };
}
