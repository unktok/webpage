import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const requiredMetadata = [
  "og:type",
  "og:title",
  "og:description",
  "og:url",
  "og:image",
  "twitter:card",
  "twitter:image",
];

function metaContent(html, key) {
  for (const [tag] of html.matchAll(/<meta\b[^>]*>/gi)) {
    const attributes = {};
    for (const match of tag.matchAll(/([:\w-]+)\s*=\s*(["'])(.*?)\2/gis)) {
      attributes[match[1].toLowerCase()] = match[3];
    }
    if ((attributes.property || attributes.name || "").toLowerCase() === key) {
      return attributes.content || "";
    }
  }
  return "";
}

function imageDimensions(file) {
  const bytes = fs.readFileSync(file);
  if (bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) {
    return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
  }
  if (bytes[0] === 0xff && bytes[1] === 0xd8) {
    let offset = 2;
    while (offset + 9 < bytes.length) {
      if (bytes[offset] !== 0xff) {
        offset += 1;
        continue;
      }
      const marker = bytes[offset + 1];
      if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker)) {
        return { width: bytes.readUInt16BE(offset + 7), height: bytes.readUInt16BE(offset + 5) };
      }
      if (marker === 0xd8 || marker === 0xd9 || (marker >= 0xd0 && marker <= 0xd7)) {
        offset += 2;
      } else {
        offset += 2 + bytes.readUInt16BE(offset + 2);
      }
    }
  }
  return null;
}

const failures = [];
const pages = fs.readdirSync(path.join(root, "blog"))
  .filter((name) => name.endsWith(".html") && name !== "index.html")
  .map((name) => path.join(root, "blog", name));

for (const page of pages) {
  const html = fs.readFileSync(page, "utf8");
  const metadata = Object.fromEntries(requiredMetadata.map((key) => [key, metaContent(html, key)]));
  for (const key of requiredMetadata) {
    if (!metadata[key]) failures.push(`${path.relative(root, page)}: missing ${key}`);
  }
  if (metadata["twitter:card"] && metadata["twitter:card"] !== "summary_large_image") {
    failures.push(`${path.relative(root, page)}: twitter:card must be summary_large_image`);
  }
  for (const key of ["og:url", "og:image", "twitter:image"]) {
    if (metadata[key] && !metadata[key].startsWith("https://")) {
      failures.push(`${path.relative(root, page)}: ${key} must use an absolute HTTPS URL`);
    }
  }

  const image = metadata["og:image"];
  if (image?.startsWith("https://unktok.com/")) {
    const imagePath = path.join(root, decodeURIComponent(new URL(image).pathname).replace(/^\/+/, ""));
    if (!fs.existsSync(imagePath)) {
      failures.push(`${path.relative(root, page)}: social image does not exist at ${path.relative(root, imagePath)}`);
    } else {
      const size = imageDimensions(imagePath);
      if (!size || size.width < 600 || size.height < 315) {
        failures.push(`${path.relative(root, page)}: social image must be a PNG or JPEG of at least 600×315 pixels`);
      }
    }
  }
}

if (failures.length) {
  console.error(`Social preview validation failed:\n${failures.map((failure) => `- ${failure}`).join("\n")}`);
  process.exit(1);
}

console.log(`Validated social previews for ${pages.length} Unktok blog posts.`);
