import type { SessionManager } from "@earendil-works/pi-coding-agent";
import { describe, expect, it } from "vitest";
import { imageAttachmentId } from "./attachment-id.ts";
import { findAttachmentInManager } from "./attachment-reader.ts";

const data = Buffer.from("\x89PNG fake").toString("base64");

// A SessionManager stand-in: the reader only calls getBranch().
function manager(entries: unknown[]): SessionManager {
  return { getBranch: () => entries } as unknown as SessionManager;
}

describe("findAttachmentInManager", () => {
  it("returns the image bytes whose content hash matches, across message kinds", () => {
    const m = manager([
      { type: "message", message: { role: "user", content: "hi" } },
      {
        type: "message",
        message: {
          role: "user",
          content: [
            { type: "text", text: "what is this?" },
            { type: "image", data, mimeType: "image/png" },
          ],
        },
      },
    ]);
    const found = findAttachmentInManager(m, imageAttachmentId(data));
    expect(found?.mimeType).toBe("image/png");
    expect(Buffer.from(found!.bytes).toString("base64")).toBe(data);
  });

  it("also scans custom_message content", () => {
    const m = manager([
      { type: "custom_message", content: [{ type: "image", data, mimeType: "image/jpeg" }] },
    ]);
    expect(findAttachmentInManager(m, imageAttachmentId(data))?.mimeType).toBe("image/jpeg");
  });

  it("returns undefined for an unknown id or a string-content message", () => {
    const m = manager([{ type: "message", message: { role: "user", content: "no images here" } }]);
    expect(findAttachmentInManager(m, imageAttachmentId(data))).toBeUndefined();
    expect(findAttachmentInManager(manager([]), "0".repeat(64))).toBeUndefined();
  });
});
