// deno test -A supabase/functions/alexa/verify.test.ts
import { assert, assertEquals, assertRejects } from "jsr:@std/assert@1";
import "npm:reflect-metadata@0.2.2"; // @peculiar/x509 (tsyringe) needs the Reflect polyfill first
import * as x509 from "npm:@peculiar/x509@2.1.0";
import { trustedKey, validCertUrl, VerificationError, verifyAlexaRequest } from "./verify.ts";

x509.cryptoProvider.set(crypto);
const alg = { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256", publicExponent: new Uint8Array([1, 0, 1]), modulusLength: 2048 };
const b64 = (buf: ArrayBuffer) => btoa(String.fromCharCode(...new Uint8Array(buf)));

async function pki(san = "echo-api.amazon.com", leafDays = 30) {
  const rootKeys = await crypto.subtle.generateKey(alg, true, ["sign", "verify"]);
  const leafKeys = await crypto.subtle.generateKey(alg, true, ["sign", "verify"]);
  const now = Date.now();
  const root = await x509.X509CertificateGenerator.createSelfSigned({
    serialNumber: "01", name: "CN=Test Root", notBefore: new Date(now - 864e5), notAfter: new Date(now + 3650 * 864e5), keys: rootKeys, signingAlgorithm: alg,
  });
  const leaf = await x509.X509CertificateGenerator.create({
    serialNumber: "02", subject: `CN=${san}`, issuer: root.subject, notBefore: new Date(now - 864e5), notAfter: new Date(now + leafDays * 864e5),
    publicKey: leafKeys.publicKey, signingKey: rootKeys.privateKey, signingAlgorithm: alg,
    extensions: [new x509.SubjectAlternativeNameExtension([{ type: "dns", value: san }])],
  });
  const pin = b64(await crypto.subtle.digest("SHA-256", root.publicKey.rawData));
  return { pem: `${leaf.toString("pem")}\n${root.toString("pem")}`, pin, leafKeys };
}

async function signed(body: string, keys: CryptoKeyPair) {
  const sig = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", keys.privateKey, new TextEncoder().encode(body));
  return new Headers({ SignatureCertChainUrl: "https://s3.amazonaws.com/echo.api/echo-api-cert-test.pem", "Signature-256": b64(sig) });
}

Deno.test("cert url rules", () => {
  assert(validCertUrl("https://s3.amazonaws.com/echo.api/echo-api-cert.pem"));
  assert(validCertUrl("https://s3.amazonaws.com:443/echo.api/echo-api-cert.pem"));
  assert(validCertUrl("https://S3.AmazonAWS.com/echo.api/../echo.api/echo-api-cert.pem"));
  assert(!validCertUrl("http://s3.amazonaws.com/echo.api/echo-api-cert.pem"));
  assert(!validCertUrl("https://s3.amazonaws.com/EcHo.aPi/echo-api-cert.pem"));
  assert(!validCertUrl("https://s3.amazonaws.com/invalid.path/echo-api-cert.pem"));
  assert(!validCertUrl("https://s3.amazonaws.com:563/echo.api/echo-api-cert.pem"));
  assert(!validCertUrl("https://s3.amazonaws.com/echo.api/../invalid.path/echo-api-cert.pem"));
  assert(!validCertUrl("https://evil.com/echo.api/echo-api-cert.pem"));
});

Deno.test("accepts a correctly signed, fresh request", async () => {
  const { pem, pin, leafKeys } = await pki();
  const body = JSON.stringify({ request: { timestamp: new Date().toISOString() } });
  await verifyAlexaRequest(await signed(body, leafKeys), body, { pins: new Set([pin]), fetchPem: async () => pem });
});

Deno.test("rejects tampered body, wrong root, wrong SAN, stale timestamp", async () => {
  const { pem, pin, leafKeys } = await pki();
  const body = JSON.stringify({ request: { timestamp: new Date().toISOString() } });
  const headers = await signed(body, leafKeys);
  const opts = { pins: new Set([pin]), fetchPem: async () => pem };
  await assertRejects(() => verifyAlexaRequest(headers, body.replace("request", "requesT"), opts), VerificationError);
  await assertRejects(() => verifyAlexaRequest(headers, body, { ...opts, pins: new Set(["nope"]) }), VerificationError, "untrusted root");
  const other = await pki("evil.example.com");
  await assertRejects(() => trustedKey("https://s3.amazonaws.com/echo.api/x.pem", { pins: new Set([other.pin]), fetchPem: async () => other.pem }), VerificationError, "leaf SAN");
  const old = JSON.stringify({ request: { timestamp: new Date(Date.now() - 200_000).toISOString() } });
  await assertRejects(async () => verifyAlexaRequest(await signed(old, leafKeys), old, opts), VerificationError, "stale");
  await assertRejects(() => verifyAlexaRequest(new Headers(), body, opts), VerificationError, "missing");
});

Deno.test("rejects an expired leaf", async () => {
  const { pem, pin } = await pki("echo-api.amazon.com", 1);
  const err = await assertRejects(() => trustedKey("https://s3.amazonaws.com/echo.api/x.pem", { pins: new Set([pin]), fetchPem: async () => pem, now: new Date(Date.now() + 5 * 864e5) }), VerificationError);
  assertEquals(err.message, "leaf expired");
});
