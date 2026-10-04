/**
 * OAuth 1.0a signing against the published reference example from X's (then Twitter's) developer
 * documentation, "Creating a signature". Uses only the documentation's sample credentials.
 * Run: npm test
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { oauthHeader, oauthSignature, percentEncode } from "./x-oauth1";

const doc = {
  consumerKey: "xvz1evFS4wEEPTGEFPHBog",
  consumerSecret: "kAcSOqF21Fu85e7zjz7ZN2U4ZRhfV3WpwPAoE3Z7kBw",
  accessToken: "370773112-GmHxMAgYyLbNEtIKZeRNFsMKPR9EyMZeS9weJAEb",
  accessTokenSecret: "LswwdoUaIvS8ltyTt5jkRh4J50vUPVVHtR2YPi5kE",
  nonce: "kYjzVBB8Y0ZFabxSWbWovY3uYSQ2pTgmZeNu2VS4cg",
  timestamp: "1318622958",
};

test("percent-encoding follows RFC 3986", () => {
  assert.equal(percentEncode("Ladies + Gentlemen"), "Ladies%20%2B%20Gentlemen");
  assert.equal(percentEncode("An encoded string!"), "An%20encoded%20string%21");
  assert.equal(percentEncode("Dogs, Cats & Mice"), "Dogs%2C%20Cats%20%26%20Mice");
  assert.equal(percentEncode("☃"), "%E2%98%83");
});

test("signature matches the documentation's reference example", () => {
  const signature = oauthSignature(
    "POST",
    "https://api.twitter.com/1.1/statuses/update.json",
    {
      status: "Hello Ladies + Gentlemen, a signed OAuth request!",
      include_entities: "true",
      oauth_consumer_key: doc.consumerKey,
      oauth_nonce: doc.nonce,
      oauth_signature_method: "HMAC-SHA1",
      oauth_timestamp: doc.timestamp,
      oauth_token: doc.accessToken,
      oauth_version: "1.0",
    },
    doc.consumerSecret,
    doc.accessTokenSecret,
  );
  assert.equal(signature, "hCtSmYh+iHYCEqBWrE7C7hYmtUk=");
});

test("header carries the OAuth fields and the same signature (query parameters signed)", () => {
  const header = oauthHeader(
    "POST",
    "https://api.twitter.com/1.1/statuses/update.json?include_entities=true",
    doc,
    { status: "Hello Ladies + Gentlemen, a signed OAuth request!" },
    doc.nonce,
    doc.timestamp,
  );
  assert.match(header, /^OAuth /);
  assert.match(header, /oauth_signature="hCtSmYh%2BiHYCEqBWrE7C7hYmtUk%3D"/);
  assert.match(header, /oauth_consumer_key="xvz1evFS4wEEPTGEFPHBog"/);
  assert.ok(!/status=/.test(header), "body parameters are signed but not sent in the header");
});
