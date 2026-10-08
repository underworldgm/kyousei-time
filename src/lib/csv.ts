/**
 * CSV バックアップの読み込み (sessionsToCsv の書き出し形式)。
 *   日付,開始時間,終了時間,装着時間,目標時間,達成
 * 書き出し時に日付またぎで分割された行 (…,24:00 と 翌日 00:00,…) は1つの区間に戻す。
 */
import { DAY_MS, dayKeyOf, dayStartMs, fromJst, type Interval } from "./time";

export interface CsvParseResult {
  intervals: Interval[];
  /** 読めなかった行 (1始まりの行番号) */
  invalidLines: number[];
}

function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (quoted) {
      if (c === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (c === '"') quoted = false;
      else cur += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") {
      out.push(cur);
      cur = "";
    } else cur += c;
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]?\d|2[0-4]):[0-5]\d$/;

export function parseSessionsCsv(text: string): CsvParseResult {
  const lines = text.replace(/^﻿/, "").split(/\r?\n/);
  const raw: Interval[] = [];
  const invalidLines: number[] = [];
  lines.forEach((line, idx) => {
    if (!line.trim()) return;
    const [date, start, end] = splitCsvLine(line);
    if (idx === 0 && !DATE_RE.test(date ?? "")) return; // ヘッダー
    if (!DATE_RE.test(date ?? "") || !TIME_RE.test(start ?? "") || !TIME_RE.test(end ?? "")) {
      invalidLines.push(idx + 1);
      return;
    }
    const pad = (t: string) => t.padStart(5, "0");
    const s = pad(start) === "24:00" ? dayStartMs(date) + DAY_MS : fromJst(date, pad(start));
    let e = pad(end) === "24:00" ? dayStartMs(date) + DAY_MS : fromJst(date, pad(end));
    // 終了が開始以前なら翌日の時刻とみなす (手書きCSVの 23:00,02:00 など)
    if (e <= s) e += DAY_MS;
    if (!Number.isFinite(s) || !Number.isFinite(e)) {
      invalidLines.push(idx + 1);
      return;
    }
    raw.push({ start: s, end: e });
  });
  raw.sort((a, b) => a.start - b.start);
  // ちょうど接している区間 (日付またぎで分割された行) だけを結合する
  const intervals: Interval[] = [];
  for (const iv of raw) {
    const last = intervals[intervals.length - 1];
    if (last && last.end === iv.start && iv.start === dayStartMs(dayKeyOf(iv.start))) last.end = iv.end;
    else intervals.push({ ...iv });
  }
  return { intervals, invalidLines };
}
