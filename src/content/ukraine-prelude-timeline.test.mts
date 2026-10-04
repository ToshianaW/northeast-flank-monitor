/**
 * Context timeline content checks (no network). Run: npm test
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { findBannedPhrase } from "../lib/banned-phrases";
import { PRELUDE_TIMELINE } from "./ukraine-prelude-timeline";

const milestones = PRELUDE_TIMELINE.flatMap((s) => s.milestones.map((m) => ({ ...m, stretch: s })));

/** Outlets whose terms forbid automated use or AI analysis, plus everything barred, citation-only or no-AI. */
const FLAGGED = ["aljazeera.com", "brookings.edu", "militarytimes.com", "armytimes.com", "notesfrompoland.com", "thedefensepost.com"];
const collector = JSON.parse(readFileSync("data/sources/collector.json", "utf8")) as {
  blocked_automated_access: string[];
  tos_prohibited_domains: string[];
};
const BARRED = [
  ...collector.blocked_automated_access,
  ...collector.tos_prohibited_domains,
  "rferl.org",
  "npr.org",
  "stripes.com",
  "theatlantic.com",
  "lrt.lt",
];

test("the two exclusion lists: automated-access blocks and terms prohibitions, no overlap", () => {
  assert.deepEqual(collector.blocked_automated_access, ["kam.lt", "kariuomene.lt", "reuters.com"]);
  assert.deepEqual(collector.tos_prohibited_domains, ["t.me", "telegram.me", "telegram.org", "discord.com", "discord.gg"]);
  assert.ok(!collector.blocked_automated_access.some((d) => collector.tos_prohibited_domains.includes(d)));
});

test("five stretches in order, each with 1-4 milestones", () => {
  assert.equal(PRELUDE_TIMELINE.length, 5);
  for (const s of PRELUDE_TIMELINE) {
    assert.ok(s.milestones.length >= 1 && s.milestones.length <= 4, s.id);
    assert.ok(s.from <= s.to, s.id);
  }
  for (let i = 1; i < PRELUDE_TIMELINE.length; i++) assert.ok(PRELUDE_TIMELINE[i - 1].to < PRELUDE_TIMELINE[i].from);
});

test("every milestone has a real date inside its stretch and before 25 February 2022", () => {
  for (const m of milestones) {
    assert.match(m.date, /^\d{4}-\d{2}-\d{2}$/, m.text);
    assert.equal(new Date(`${m.date}T00:00:00Z`).toISOString().slice(0, 10), m.date);
    assert.ok(m.date.slice(0, 7) >= m.stretch.from && m.date.slice(0, 7) <= m.stretch.to, `${m.date} outside ${m.stretch.id}`);
    assert.ok(m.date >= "2020-08-01" && m.date <= "2022-02-24", m.date);
  }
});

test("every milestone has at least one source with a name and an http(s) URL", () => {
  for (const m of milestones) {
    assert.ok(m.sources.length >= 1, m.date);
    for (const src of m.sources) {
      assert.ok(src.name.trim().length > 0);
      assert.match(src.url, /^https?:\/\/[^\s]+$/);
      new URL(src.url);
    }
  }
});

test("no flagged, barred, citation-only or no-AI outlet appears", () => {
  for (const m of milestones) {
    for (const src of m.sources) {
      const host = new URL(src.url).hostname.replace(/^www\./, "");
      for (const d of [...FLAGGED, ...BARRED]) {
        assert.ok(host !== d && !host.endsWith(`.${d}`), `${m.date}: ${host} is flagged (${d})`);
      }
    }
  }
});

test("no phase labels, prediction wording or banned phrases", () => {
  const PHASE = /\bphase\b|\bP[0-4]\b|phase [0-4]/i;
  const PREDICTION = /\b(will|imminent|inevitabl\w*|likely|foreshadow\w*|prelude to|warning sign|lead(s|ing)? to war|on the brink)\b/i;
  for (const s of PRELUDE_TIMELINE) {
    assert.ok(!PHASE.test(s.label), s.label);
    assert.ok(!PREDICTION.test(s.label), s.label);
  }
  for (const m of milestones) {
    assert.ok(!PHASE.test(m.text), `phase wording: ${m.text}`);
    assert.ok(!PREDICTION.test(m.text), `prediction wording: ${m.text}`);
    assert.equal(findBannedPhrase(m.text), null, m.text);
  }
});

test("entries resting on a state source are labelled as claims", () => {
  for (const m of milestones) {
    if (m.sources.some((s) => s.state)) assert.ok(m.claim, `${m.date} cites a state source but has no claim label`);
  }
  assert.ok(milestones.every((m) => m.sources.every((s) => !/kremlin\.ru/.test(s.url) || s.state)), "Kremlin links are state sources");
});

test("display details: February date line, Zelenskyy quote, caption wording", () => {
  const feb = PRELUDE_TIMELINE.find((s) => s.id === "february-2022")!;
  assert.equal(feb.dateLabel, "21-24 Feb 2022");
  assert.ok(PRELUDE_TIMELINE.filter((s) => s.id !== "february-2022").every((s) => !s.dateLabel));
  const zelenskyy = milestones.find((m) => m.date === "2021-11-11")!;
  assert.match(zelenskyy.text, /Zelenskyy said .*"almost 100,000 troops on our border"/);
  assert.ok(zelenskyy.sources.every((s) => s.url.startsWith("https://en.lb.ua/")));
  const component = readFileSync("src/components/historical/context-timeline.tsx", "utf8");
  assert.ok(component.includes("Gaps mean no milestone is listed, not that nothing happened."));
  assert.ok(component.includes("The milestones are a selection, not a complete chronology."));
  assert.ok(component.includes("sm:grid-cols-5"), "five equal segments");
});
