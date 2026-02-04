const IPFS_GATEWAYS = [
  "https://ipfs.io/ipfs/",
  "https://cloudflare-ipfs.com/ipfs/",
  "https://gateway.pinata.cloud/ipfs/",
];

export function isIPFSReference(str: string): boolean {
  if (!str || typeof str !== "string") return false;
  const s = str.trim();
  return s.startsWith("ipfs://") || s.startsWith("Qm") || s.startsWith("bafy");
}

export async function fetchFromIPFS(cid: string): Promise<string | object> {
  const cleanCID = cid
    .replace("ipfs://", "")
    .replace("/ipfs/", "")
    .trim();

  if (!cleanCID) throw new Error("Invalid IPFS CID");

  for (const gateway of IPFS_GATEWAYS) {
    try {
      const url = `${gateway}${cleanCID}`;
      const response = await fetch(url, {
        signal: AbortSignal.timeout(10000),
        headers: { Accept: "application/json, text/plain, */*" },
      });

      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const contentType = response.headers.get("content-type") || "";
      if (contentType.includes("application/json")) {
        return await response.json();
      }
      return await response.text();
    } catch {
      continue;
    }
  }

  throw new Error(`Failed to fetch CID ${cleanCID} from all gateways`);
}

export function parseContent(str: string | object): object {
  if (typeof str === "object") return str;

  try {
    return JSON.parse(str as string);
  } catch {
    return { description: str };
  }
}
