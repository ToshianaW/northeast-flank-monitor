/**
 * Source-probe rules (no network). Run: npm test
 */
import assert from "node:assert/strict";
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

test("TermsGate refuses article fetches until the site's terms were read", () => {
  const gate = new TermsGate();
  assert.throws(() => gate.assertArticleAllowed("https://www.osw.waw.pl/en/publikacje/analyses/2021-01-14/x"), /have not been read/);
  gate.markTermsRead("https://www.osw.waw.pl/en", "no terms page found");
  gate.assertArticleAllowed("https://www.osw.waw.pl/en/publikacje/analyses/2021-01-14/x");
  assert.equal(gate.termsSummary("https://www.osw.waw.pl/x"), "no terms page found");
  assert.throws(() => gate.assertArticleAllowed("https://defence24.com/news/x"), /have not been read/, "other sites stay closed");
});
