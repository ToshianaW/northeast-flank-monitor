/**
 * OAuth 1.0a request signing (HMAC-SHA1) for X API user-context calls, such as posting as the
 * account owner. Built on node:crypto; no network here. For POST /2/tweets the body is JSON, so
 * only the OAuth parameters and any query parameters are signed.
 */
import { createHmac, randomBytes } from "node:crypto";

export type OAuthCredentials = {
  consumerKey: string;
  consumerSecret: string;
  accessToken: string;
  accessTokenSecret: string;
};

/** RFC 3986 percent-encoding, as OAuth 1.0a requires (stricter than encodeURIComponent). */
export function percentEncode(value: string): string {
  return encodeURIComponent(value).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
}

/** The HMAC-SHA1 signature for a request; `params` are the OAuth, query and form parameters to sign. */
export function oauthSignature(
  method: string,
  baseUrl: string,
  params: Record<string, string>,
  consumerSecret: string,
  tokenSecret: string,
): string {
  const paramString = Object.entries(params)
    .map(([k, v]) => [percentEncode(k), percentEncode(v)] as const)
    .sort(([ak, av], [bk, bv]) => (ak === bk ? (av < bv ? -1 : 1) : ak < bk ? -1 : 1))
    .map(([k, v]) => `${k}=${v}`)
    .join("&");
  const base = [method.toUpperCase(), percentEncode(baseUrl), percentEncode(paramString)].join("&");
  const key = `${percentEncode(consumerSecret)}&${percentEncode(tokenSecret)}`;
  return createHmac("sha1", key).update(base).digest("base64");
}

/** The Authorization header for a request. `nonce` and `timestamp` are injectable for tests. */
export function oauthHeader(
  method: string,
  url: string,
  creds: OAuthCredentials,
  extraParams: Record<string, string> = {},
  nonce: string = randomBytes(16).toString("hex"),
  timestamp: string = String(Math.floor(Date.now() / 1000)),
): string {
  const oauth: Record<string, string> = {
    oauth_consumer_key: creds.consumerKey,
    oauth_nonce: nonce,
    oauth_signature_method: "HMAC-SHA1",
    oauth_timestamp: timestamp,
    oauth_token: creds.accessToken,
    oauth_version: "1.0",
  };
  const u = new URL(url);
  const query = Object.fromEntries(u.searchParams.entries());
  const signature = oauthSignature(method, `${u.origin}${u.pathname}`, { ...query, ...extraParams, ...oauth }, creds.consumerSecret, creds.accessTokenSecret);
  const header = { ...oauth, oauth_signature: signature };
  return `OAuth ${Object.entries(header)
    .map(([k, v]) => `${percentEncode(k)}="${percentEncode(v)}"`)
    .join(", ")}`;
}
