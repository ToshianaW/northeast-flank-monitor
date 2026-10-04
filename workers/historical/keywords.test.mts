/**
 * Title keyword prefilter (no network). Run: npm test
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { matchesMilitaryKeywords } from "./keywords.mjs";

test("military titles match in English, Polish, Lithuanian and Estonian", () => {
  for (const title of [
    "US Army in Lithuania a new outpost on the eastern flank? No: troops rotate",
    "Russia and Belarus: Zapad-2021 exercises begin",
    "Air defence integration in the Union State",
    "Ćwiczenia wojsk na poligonie w Drawsku",
    "Lietuvos kariuomenės pratybos prie sienos",
    "Kaitseväe õppus Kevadtorm algas",
    "Naval drills in the Baltic Sea",
    "Russian navy ships enter the Baltic",
    "Naval build-up near Kaliningrad",
    "Mobilisation of reservists announced",
  ]) assert.ok(matchesMilitaryKeywords(title), title);
});

test("unrelated titles do not match", () => {
  for (const title of [
    "Kyrgyzstan Japarov and the presidential republic victorious",
    "Nord Stream 2 construction resumes under pressure from sanctions",
    "Israel ahead of its fourth early elections",
    "The pandemic takes its toll Russias demographic crisis",
    "Navalny arrested upon his return to Russia",
  ]) assert.ok(!matchesMilitaryKeywords(title), title);
});

test("OSW context filter: wider includes, with energy, COVID, Navalny and similar excluded", async () => {
  const { matchesOswContext } = await import("./keywords.mjs");
  for (const t of [
    "Russia demonstrates its power in Belarus and on the oceans worldwide",
    "US Army in Lithuania a new outpost on the eastern flank",
    "The Zapad-2021 exercises. Russian strategy in practice",
    "Reinforcing the frontier the Baltic states Armed Forces in border protection tasks",
    "Kaliningrad: new missile brigade",
    "Naval exercises in the Gulf of Finland",
  ]) assert.ok(matchesOswContext(t), t);
  // Word starts only: "pressure" must not count as an include, "Gasparov" must not trip the "gas" exclude.
  assert.ok(!matchesOswContext("Japan under pressure"));
  assert.ok(matchesOswContext("Gasparov and the Russian army reform"));
  for (const t of [
    "Nord Stream 2 construction resumes under pressure from sanctions",
    "Russia mass protests in defence of Navalny",
    "Russia: the pandemic takes its toll",
    "An attempt at a new start in energy cooperation between Belarus and Russia",
    "Kyrgyzstan Japarov and the presidential republic victorious",
  ]) assert.ok(!matchesOswContext(t), t);
});
