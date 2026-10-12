// ORION · Alexa request verification (required for HTTPS endpoints that are not AWS Lambda).
// Amazon signs every request: header Signature-256 = RSA-SHA256(raw body) with the key of the certificate chain
// published at SignatureCertChainUrl. We check the URL shape, the chain up to a pinned Amazon/Starfield root,
// the leaf's validity window and its SAN (echo-api.amazon.com), then the body signature and the timestamp.
import "npm:reflect-metadata@0.2.2"; // @peculiar/x509 (tsyringe) needs the Reflect polyfill first
import * as x509 from "npm:@peculiar/x509@2.1.0";

x509.cryptoProvider.set(crypto);

/** SHA-256 of the SubjectPublicKeyInfo (base64) of the roots Amazon chains to (macOS system roots, 2026-10). */
export const AMAZON_ROOT_PINS = new Set([
  "++MBgDH5WGvL9Bcn5Be30cRcL0f5O+NyoXuWtQdX1aI=", // Amazon Root CA 1
  "f0KW/FtqTjs108NpYj42SrGvOB2PpxIVM8nWxjPqJGE=", // Amazon Root CA 2
  "NqvDJlas/GRcYbcWE8S/IceH9cq77kg0jVhZeAPXq8k=", // Amazon Root CA 3
  "9+ze1cZgR9KO1kZrVDxA4HQ6voHRCSVNz4RdTCx4U8U=", // Amazon Root CA 4
  "KwccWaCgrnaw6tsrrSO61FgLacNgG2MMLq8GE6+oP5I=", // Starfield Services Root Certificate Authority - G2
]);

export class VerificationError extends Error {}

/** Amazon's rules: https, host s3.amazonaws.com, path under /echo.api/, port 443 when given. */
export function validCertUrl(raw: string): boolean {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return false;
  }
  if (u.protocol !== "https:" || u.hostname.toLowerCase() !== "s3.amazonaws.com") return false;
  if (u.port && u.port !== "443") return false;
  // URL normalises "/echo.api/../x" to "/x", so a traversal can't sneak past this prefix check.
  return u.pathname.startsWith("/echo.api/");
}

const b64 = (buf: ArrayBuffer) => btoa(String.fromCharCode(...new Uint8Array(buf)));
const spkiPin = async (c: x509.X509Certificate) => b64(await crypto.subtle.digest("SHA-256", c.publicKey.rawData));

export interface VerifyOptions {
  now?: Date;
  pins?: Set<string>;
  fetchPem?: (url: string) => Promise<string>;
  /** Accept any certificate URL (tests with a local CA). */
  skipUrlCheck?: boolean;
  /** SAN the leaf must carry. */
  san?: string;
}

const chainCache = new Map<string, { key: CryptoKey; until: number }>();

async function defaultFetchPem(url: string) {
  const r = await fetch(url);
  if (!r.ok) throw new VerificationError(`cert chain ${r.status}`);
  return await r.text();
}

/** Returns the leaf public key once the chain is trusted (cached per URL until the leaf expires). */
export async function trustedKey(certUrl: string, opts: VerifyOptions = {}): Promise<CryptoKey> {
  const now = opts.now ?? new Date();
  const cached = chainCache.get(certUrl);
  if (cached && cached.until > now.getTime() && !opts.fetchPem) return cached.key;
  if (!opts.skipUrlCheck && !validCertUrl(certUrl)) throw new VerificationError("bad cert url");
  const pem = await (opts.fetchPem ?? defaultFetchPem)(certUrl);
  const certs = x509.PemConverter.decode(pem).map((der) => new x509.X509Certificate(der));
  if (!certs.length) throw new VerificationError("empty chain");
  const leaf = certs[0]!;
  if (now < leaf.notBefore || now > leaf.notAfter) throw new VerificationError("leaf expired");
  const san = leaf.getExtension(x509.SubjectAlternativeNameExtension);
  const want = opts.san ?? "echo-api.amazon.com";
  if (!san?.names.items.some((n) => n.type === "dns" && n.value.toLowerCase() === want)) throw new VerificationError("leaf SAN");
  // Walk up: every cert must be signed by the next one, until a cert whose key is pinned.
  const pins = opts.pins ?? AMAZON_ROOT_PINS;
  let trusted = false;
  for (let i = 0; i < certs.length; i++) {
    const c = certs[i]!;
    if (pins.has(await spkiPin(c))) {
      trusted = true;
      break;
    }
    if (now < c.notBefore || now > c.notAfter) throw new VerificationError("chain cert expired");
    const issuer = certs[i + 1];
    if (!issuer) break;
    if (!(await c.verify({ publicKey: issuer, signatureOnly: true }))) throw new VerificationError("chain signature");
  }
  if (!trusted) throw new VerificationError("untrusted root");
  const key = await crypto.subtle.importKey("spki", leaf.publicKey.rawData, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
  if (!opts.fetchPem) chainCache.set(certUrl, { key, until: Math.min(leaf.notAfter.getTime(), now.getTime() + 6 * 3.6e6) });
  return key;
}

/** Throws VerificationError unless the request is a genuine, fresh Alexa request. */
export async function verifyAlexaRequest(headers: Headers, rawBody: string, opts: VerifyOptions = {}) {
  const certUrl = headers.get("SignatureCertChainUrl") ?? headers.get("signaturecertchainurl");
  const sig = headers.get("Signature-256") ?? headers.get("signature-256");
  if (!certUrl || !sig) throw new VerificationError("missing signature headers");
  const key = await trustedKey(certUrl, opts);
  const sigBytes = Uint8Array.from(atob(sig.replace(/\s+/g, "")), (c) => c.charCodeAt(0));
  const ok = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, sigBytes, new TextEncoder().encode(rawBody));
  if (!ok) throw new VerificationError("body signature");
  let ts: number;
  try {
    ts = new Date(JSON.parse(rawBody)?.request?.timestamp).getTime();
  } catch {
    throw new VerificationError("body");
  }
  // Amazon allows at most 150 seconds of skew.
  if (!Number.isFinite(ts) || Math.abs((opts.now ?? new Date()).getTime() - ts) > 150_000) throw new VerificationError("stale request");
}
