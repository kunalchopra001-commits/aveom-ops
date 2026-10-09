// Print capstone/case-study.html to PDF (light theme, A4, no animation).
import puppeteer from "puppeteer-core";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
const dir = path.dirname(fileURLToPath(import.meta.url));
const src = path.join(dir, "..", "case-study.html");
const out = path.join(dir, "out", "AVEOM-OPS-Case-Study.pdf");
const browser = await puppeteer.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true });
const page = await browser.newPage();
await page.emulateMediaFeatures([
  { name: "prefers-color-scheme", value: "light" },
  { name: "prefers-reduced-motion", value: "reduce" },
]);
await page.goto(pathToFileURL(src).href, { waitUntil: "networkidle0" });
await page.evaluate(() => document.fonts.ready);
await page.pdf({
  path: out, format: "A4", printBackground: true, scale: 0.8,
  margin: { top: "14mm", bottom: "16mm", left: "12mm", right: "12mm" },
  displayHeaderFooter: true, headerTemplate: "<span></span>",
  footerTemplate: '<div style="font-size:8px;color:#888;width:100%;text-align:center;font-family:sans-serif">AVEOM OPS · Case study · <span class="pageNumber"></span>/<span class="totalPages"></span></div>',
});
await browser.close();
console.log("wrote", out);
