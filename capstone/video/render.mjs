#!/usr/bin/env node
/**
 * Render scenes.html to video (or stills) with headless Chrome + ffmpeg.
 *
 *   node render.mjs --ar 16x9                         full 60 s MP4
 *   node render.mjs --ar 9x16 --audio voice.mp3       vertical, with voiceover
 *   node render.mjs --ar 16x9 --from 22 --to 28       a clip
 *   node render.mjs --ar 16x9 --stills 3,12,27,42     PNG stills
 *
 * Every frame is drawn by calling window.render(t) — no real-time playback — so
 * output is frame-exact regardless of machine speed.
 */
import { spawn } from "node:child_process";
import { mkdirSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import puppeteer from "puppeteer-core";

const dir = path.dirname(fileURLToPath(import.meta.url));
const arg = (k, d) => {
  const i = process.argv.indexOf(`--${k}`);
  return i > -1 ? process.argv[i + 1] : d;
};
const AR = arg("ar", "16x9");
const FPS = Number(arg("fps", 30));
const portrait = AR === "9x16";
const [W, H] = portrait ? [1080, 1920] : [1920, 1080];
const out = path.join(dir, "out");
mkdirSync(out, { recursive: true });

const CHROME = [
  process.env.CHROME_PATH,
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
].find((p) => p && existsSync(p));

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  args: ["--hide-scrollbars", "--force-color-profile=srgb", "--disable-lcd-text"],
});
const page = await browser.newPage();
await page.setViewport({ width: W, height: H, deviceScaleFactor: 1 });
await page.goto(pathToFileURL(path.join(dir, "scenes.html")).href + `?ar=${AR}`, { waitUntil: "networkidle0" });
await page.evaluate(() => window.ready);
const duration = await page.evaluate(() => window.DURATION);
const stage = await page.$("#stage");

async function frame(t) {
  await page.evaluate((tt) => window.render(tt), t);
  return stage.screenshot({ type: "png", omitBackground: false });
}

const stills = arg("stills");
if (stills) {
  for (const t of stills.split(",").map(Number)) {
    const file = path.join(out, `still-${AR}-${String(t).replace(".", "_")}s.png`);
    await page.evaluate((tt) => window.render(tt), t);
    await stage.screenshot({ path: file });
    console.log("wrote", file);
  }
  await browser.close();
  process.exit(0);
}

const from = Number(arg("from", 0));
const to = Number(arg("to", duration));
const audio = arg("audio");
const name = arg("name", `aveom-ops-${AR}${from || to !== duration ? `-${from}-${to}` : ""}`);
const file = path.join(out, `${name}.mp4`);

const ff = [
  "-y", "-f", "image2pipe", "-framerate", String(FPS), "-i", "-",
  ...(audio ? ["-ss", String(from), "-i", path.resolve(audio)] : []),
  "-c:v", "libx264", "-preset", "medium", "-crf", "18", "-pix_fmt", "yuv420p", "-movflags", "+faststart",
  ...(audio ? ["-c:a", "aac", "-b:a", "192k", "-shortest"] : []),
  file,
];
const ffmpeg = spawn("ffmpeg", ff, { stdio: ["pipe", "ignore", "inherit"] });
const total = Math.round((to - from) * FPS);
const started = Date.now();
for (let i = 0; i < total; i++) {
  const buf = await frame(from + i / FPS);
  if (!ffmpeg.stdin.write(buf)) await new Promise((r) => ffmpeg.stdin.once("drain", r));
  if (i % (FPS * 5) === 0) process.stdout.write(`\r${Math.round((i / total) * 100)}%  `);
}
ffmpeg.stdin.end();
await new Promise((r) => ffmpeg.on("close", r));
await browser.close();
console.log(`\nwrote ${file} (${total} frames in ${Math.round((Date.now() - started) / 1000)} s)`);
