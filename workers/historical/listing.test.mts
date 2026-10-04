/**
 * Archive listing parser (no network). Run: npm test
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { dateFromUrl, pageUrl, parseListing } from "./listing.mjs";

const html = `
<a href="/en/publikacje?f%5B0%5D=publikacje%3A481">Analyses filter link text long</a>
<div class="views-row"><time datetime="2021-01-29T12:00:00Z">2021-01-29</time>
<h3><a href="/en/publikacje/analyses/2021-01-29/belarus-readiness-check">Belarus: a snap readiness check</a></h3></div>
<div class="views-row"><time datetime="2021-01-28T12:00:00Z">2021-01-28</time>
<h3><a href="/en/publikacje/analyses/2021-01-27/zapad-preparations">Zapad-2021 preparations &amp; Russian units</a></h3></div>
<div class="views-row"><span>12.01.2021</span><a href="/en/publikacje/osw-commentary/no-date-slug">A commentary without a date in its URL</a></div>
<a href="/en/about">About OSW and its mission statement</a>
<a href="https://other.example.org/2021-01-10/x">Another site entirely, same length</a>
<a href="/en/publikacje/analyses/2021-01-29/belarus-readiness-check">Belarus: a snap readiness check</a>`;

test("parseListing keeps dated same-host article links with URL and listing dates", () => {
  const items = parseListing(html, "https://www.osw.waw.pl/en/publikacje?page=3");
  assert.deepEqual(
    items.map((i) => [i.url.replace("https://www.osw.waw.pl", ""), i.urlDate, i.listingDate]),
    [
      ["/en/publikacje/analyses/2021-01-29/belarus-readiness-check", "2021-01-29", "2021-01-29"],
      ["/en/publikacje/analyses/2021-01-27/zapad-preparations", "2021-01-27", "2021-01-28"],
      ["/en/publikacje/osw-commentary/no-date-slug", null, "2021-01-12"],
    ],
  );
  assert.equal(items[1].title, "Zapad-2021 preparations & Russian units");
});

test("dateFromUrl and pageUrl", () => {
  assert.equal(dateFromUrl("https://x.org/a/2021/02/03/slug"), "2021-02-03");
  assert.equal(dateFromUrl("https://x.org/a/2021-02-30/slug"), null);
  assert.equal(pageUrl("https://x.org/list?f%5B0%5D=a%3A1&page=2", 7), "https://x.org/list?f%5B0%5D=a%3A1&page=7");
});
