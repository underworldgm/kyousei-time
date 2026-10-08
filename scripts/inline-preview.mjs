// プレビュー版 (dist-artifact) を1つの HTML にまとめる。
// claude.ai の Artifact はページ本文だけを受け取る (doctype/head/body は公開時に付与される) ため、
// JS と CSS を埋め込み、<title> を先頭に置いた本文だけのファイルを書き出す。
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const dir = "dist-artifact";
const out = process.argv[2] ?? join(dir, "kyousei-time-preview.html");
const html = readFileSync(join(dir, "preview.html"), "utf8");
const assets = join(dir, "assets");
const files = readdirSync(assets);
const css = files.filter((f) => f.endsWith(".css")).map((f) => readFileSync(join(assets, f), "utf8")).join("\n");
const jsFiles = [...html.matchAll(/<script[^>]+src="\.\/assets\/([^"]+)"[^>]*><\/script>/g)].map((m) => m[1]);
if (jsFiles.length !== 1) throw new Error(`script が1つではありません: ${jsFiles.join(", ")}`);
const js = readFileSync(join(assets, jsFiles[0]), "utf8").replace(/<\/script/gi, "<\\/script");

const page = `<title>きょうせいタイム</title>
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=M+PLUS+Rounded+1c:wght@500;700;800&display=swap" />
<style>
${css}
</style>
<div id="root"></div>
<script type="module">
${js}
</script>
`;
writeFileSync(out, page);
console.log(`wrote ${out} (${(page.length / 1024).toFixed(0)} KB)`);
