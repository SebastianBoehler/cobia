import { isIP } from "node:net";

const LOCAL_NAMES = new Set(["localhost", "localhost.localdomain"]);

function isPublicIpv4(value: string): boolean {
  const octets = value.split(".").map(Number);
  if (octets.length !== 4 || octets.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return false;
  const [a, b] = octets as [number, number, number, number];
  if (a === 0 || a === 10 || a === 127 || a >= 224) return false;
  if (a === 100 && b >= 64 && b <= 127) return false;
  if (a === 169 && b === 254) return false;
  if (a === 172 && b >= 16 && b <= 31) return false;
  if (a === 192 && (b === 0 || b === 168)) return false;
  if (a === 198 && (b === 18 || b === 19 || b === 51)) return false;
  if (a === 203 && b === 0) return false;
  return true;
}

function isPublicIpv6(value: string): boolean {
  const normalized = value.toLowerCase().replace(/^\[|\]$/g, "");
  const mapped = normalized.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/)?.[1];
  if (mapped) return isPublicIpv4(mapped);
  if (normalized === "::" || normalized === "::1") return false;
  if (/^(?:fc|fd)/.test(normalized) || /^fe[89ab]/.test(normalized)) return false;
  if (normalized.startsWith("ff") || normalized.startsWith("2001:db8:")) return false;
  if (/^2001:(?:0|1|2|10):/.test(normalized)) return false;
  return true;
}

export function isPublicIpV1(value: string): boolean {
  const family = isIP(value.replace(/^\[|\]$/g, ""));
  if (family === 4) return isPublicIpv4(value);
  if (family === 6) return isPublicIpv6(value);
  return false;
}

export function assertPublicCommerceUrlV1(input: string, addresses: readonly string[]): URL {
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    throw new Error("Commerce discovery URL is invalid");
  }
  if (url.protocol !== "https:") throw new Error("Commerce discovery requires HTTPS");
  if (url.username || url.password) throw new Error("Credential-bearing commerce URLs are forbidden");
  if (url.port && url.port !== "443") throw new Error("Commerce discovery permits only HTTPS port 443");

  const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (LOCAL_NAMES.has(hostname) || hostname.endsWith(".localhost") ||
    hostname.endsWith(".local") || hostname.endsWith(".internal")) {
    throw new Error("Commerce discovery hostname is blocked");
  }
  if (addresses.length === 0) throw new Error("Commerce discovery DNS returned no addresses");
  if (addresses.some((address) => !isPublicIpV1(address))) {
    throw new Error("Commerce discovery DNS contains a blocked address");
  }
  return url;
}
