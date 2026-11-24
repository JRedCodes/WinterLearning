import type { Thumbnailer } from "../domain/ports.js";

/** Dev stand-in for an image service: pretends to resize for a second. */
export class FakeThumbnailer implements Thumbnailer {
  async createThumbnail(imageUrl: string): Promise<string> {
    await new Promise((r) => setTimeout(r, 1000));
    const name = encodeURIComponent(new URL(imageUrl).pathname.split("/").pop() ?? "avatar");
    return `https://cdn.example.com/thumbs/128x128/${name}`;
  }
}
