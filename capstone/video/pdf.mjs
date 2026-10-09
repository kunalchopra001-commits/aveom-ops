// Print capstone/case-study.html to PDF (light theme, A4, no animation).
import puppeteer from "puppeteer-core";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
const dir = path.dirname(fileURLToPath(import.meta.url));
const src = path.join(dir, "..", "case-study.html");
const out = path.join(dir, "out", process.env.DEMO_PASSWORD ? "AVEOM-OPS-Case-Study-reviewers.pdf" : "AVEOM-OPS-Case-Study.pdf");
const browser = await puppeteer.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true });
const page = await browser.newPage();
await page.emulateMediaFeatures([
  { name: "prefers-color-scheme", value: "light" },
  { name: "prefers-reduced-motion", value: "reduce" },
]);
await page.goto(pathToFileURL(src).href, { waitUntil: "networkidle0" });
await page.evaluate(() => document.fonts.ready);

// Reviewer access box: the demo password comes from the environment at print time and is
// never stored in the repo. Usage:  $env:DEMO_PASSWORD="..."; node pdf.mjs
const demoPassword = process.env.DEMO_PASSWORD;
if (demoPassword) {
  await page.evaluate((pw) => {
    const box = document.createElement("section");
    box.className = "callout";
    box.innerHTML = `
      <span class="eyebrow">Reviewer access</span>
      <h3>Try it yourself: <a href="https://aveom-ops-demo.web.app">aveom-ops-demo.web.app</a></h3>
      <p class="small">A separate demo copy with a month of sample data — nothing here touches AVEOM's real records.
      Every login below uses the same password.</p>
      <table style="min-width:0;font-size:0.9rem">
        <tr><td class="num">demo.manager</td><td>Production Manager — full access, approves bills, logs</td></tr>
        <tr><td class="num">demo.owner</td><td>Owner — sends petty cash, reviews the manager's bills</td></tr>
        <tr><td class="num">demo.accountant</td><td>Accountant — view and download reports only</td></tr>
        <tr><td class="num">demo.crew</td><td>Crew member — logs shifts, confirms payments, adds bills</td></tr>
        <tr><td><b>Password</b></td><td class="num"><b></b></td></tr>
      </table>`;
    box.querySelector("tr:last-child b.num, tr:last-child td.num b").textContent = pw;
    document.querySelector("header").after(box);
  }, demoPassword);
}
await page.pdf({
  path: out, format: "A4", printBackground: true, scale: 0.8,
  margin: { top: "14mm", bottom: "16mm", left: "12mm", right: "12mm" },
  displayHeaderFooter: true, headerTemplate: "<span></span>",
  footerTemplate: '<div style="font-size:8px;color:#888;width:100%;text-align:center;font-family:sans-serif">AVEOM OPS · Case study · <span class="pageNumber"></span>/<span class="totalPages"></span></div>',
});
await browser.close();
console.log("wrote", out);
