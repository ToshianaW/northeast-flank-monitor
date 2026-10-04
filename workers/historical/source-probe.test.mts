/**
 * Source-probe rules (no network). Run: npm test
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { isLegalPageUrl, selectLegalLinks, TermsGate } from "./source-probe.mjs";

test("legal pages are recognised; article pages are not, even with 'terms' in the slug", () => {
  for (const url of [
    "https://defence24.com/term-of-use",
    "https://www.gov.pl/web/gov/prawa-autorskie",
    "https://info.err.ee/982667/kasutustingimused-ja-kommenteerimine",
    "https://notesfrompoland.com/terms-of-use/",
    "https://www.aljazeera.com/terms-and-conditions",
    "http://en.kremlin.ru/about/copyrights",
    "https://example.org/robots.txt",
  ]) assert.ok(isLegalPageUrl(url), url);
  for (const url of [
    "https://www.osw.waw.pl/en/publikacje/analyses/2026-09-24/kosovo-former-guerrilla-leaders-sentenced-to-lengthy-prison-terms",
    "https://defence24.com/industry/the-rockets-game-why-is-poland-still-waiting-for-permission-to-produce-himars-munitions",
    "https://defence24.com/geopolitics/determinants-and-evolution-of-the-russian-concept-of-information-warfare",
    "https://www.nato.int/en/about-us/organization/founding-treaty",
    "https://www.mod.gov.lv/en/about-us",
  ]) assert.ok(!isLegalPageUrl(url), url);
});

test("selectLegalLinks keeps same-site legal links only", () => {
  const html = `
    <a href="/term-of-use">Terms of use</a>
    <a href="/industry/the-rockets-game-why-is-poland-still-waiting-for-permission">Permission to produce</a>
    <a href="/about-us">About us</a>
    <a href="https://other.example.com/terms">Other site terms</a>
    <a href="/wp-admin/post.php?post=1&amp;action=edit">Edit</a>`;
  assert.deepEqual(selectLegalLinks(html, "https://defence24.com/"), ["https://defence24.com/term-of-use"]);
});

test("the aif.ru case: anchor text that says 'rules' or 'правила' never makes an article a legal link", () => {
  const html = `
    <a href="https://hab.aif.ru/health/ryba-v-racione-norma-polzy-pravila-infografika">Рыба в рационе: правила</a>
    <a href="/health/food">Правила питания</a>
    <a href="/static/1965027">Rules</a>
    <a href="https://aif.ru/privacy-policy/">Политика конфиденциальности</a>`;
  assert.deepEqual(selectLegalLinks(html, "https://klg.aif.ru/"), ["https://aif.ru/privacy-policy/"]);
  for (const url of [
    "https://hab.aif.ru/health/ryba-v-racione-norma-polzy-pravila-infografika",
    "https://aif.ru/health/food",
  ]) assert.ok(!isLegalPageUrl(url), url);
  for (const url of [
    "https://www.15min.lt/privatumo-politika",
    "https://info.lsm.lv/privatuma-politika",
    "https://www.example.pl/polityka-prywatnosci",
  ]) assert.ok(isLegalPageUrl(url), url);
});

test("German, Estonian and transliterated Russian legal paths are recognised; articles are not", () => {
  for (const url of [
    "https://www.spiegel.de/impressum",
    "https://www.spiegel.de/nutzungsbedingungen",
    "https://www.bundeswehr.de/de/impressum",
    "https://www.fontanka.ru/polzovatelskoe-soglashenie/",
    "https://www.example.ee/privaatsuspoliitika",
    "https://www.example.ee/kasutajatingimused",
  ]) assert.ok(isLegalPageUrl(url), url);
  for (const url of [
    "https://www.spiegel.de/politik/deutschland/bundeswehr-uebung-in-litauen-a-123",
    "https://www.fontanka.ru/2026/10/04/7512345/",
    "https://news.postimees.ee/1234567/estonia-hosts-nato-exercise",
  ]) assert.ok(!isLegalPageUrl(url), url);
});

test("regex escapes in source-probe.mts are intact", () => {
  const source = readFileSync("workers/historical/source-probe.mts", "utf8");
  assert.ok(!/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(source), "control character (an escape was mangled)");
  for (const fragment of ["usloviya-ispolzovaniya)([-_.]|$)/i", '/<a\\b[^>]*href="([^"#]+)"/gi']) {
    assert.ok(source.includes(fragment), `missing pattern fragment: ${fragment}`);
  }
});

test("TermsGate refuses article fetches until the site's terms were read", () => {
  const gate = new TermsGate();
  assert.throws(() => gate.assertArticleAllowed("https://www.osw.waw.pl/en/publikacje/analyses/2021-01-14/x"), /have not been read/);
  gate.markTermsRead("https://www.osw.waw.pl/en", "no terms page found");
  gate.assertArticleAllowed("https://www.osw.waw.pl/en/publikacje/analyses/2021-01-14/x");
  assert.equal(gate.termsSummary("https://www.osw.waw.pl/x"), "no terms page found");
  assert.throws(() => gate.assertArticleAllowed("https://defence24.com/news/x"), /have not been read/, "other sites stay closed");
});
