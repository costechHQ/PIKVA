import { describe, expect, test } from "bun:test";

import { BinaryBitmap, HybridBinarizer, QRCodeReader, RGBLuminanceSource } from "@zxing/library";

import { QR_MARGIN, encodeQr, qrSvgPath } from "@/lib/qr";

describe("qrSvgPath", () => {
  test("draws one square per dark module", () => {
    const dark = new Set(["0,0", "1,1"]);
    const matrix = { getWidth: () => 2, getHeight: () => 2, get: (x: number, y: number) => dark.has(`${x},${y}`) };
    expect(qrSvgPath(matrix)).toEqual({ size: 2, path: "M0 0h1v1h-1zM1 1h1v1h-1z" });
  });
});

describe("encodeQr", () => {
  const payload = '{"code":"7F3B9K2D","code_date":"2026-10-15","expires_at":"2026-10-16T00:00:00Z"}';

  test("includes the quiet zone", async () => {
    const { size, path } = await encodeQr(payload);
    expect(size).toBeGreaterThan(21 + 2 * QR_MARGIN - 1);
    expect(path).not.toContain(`M0 0h`); // the corner is quiet zone, never dark
  });

  test("a scanner reads back exactly the payload", async () => {
    const { size, path } = await encodeQr(payload);

    // Paint the modules into a grey-scale image, 4 pixels per module, and decode it.
    const scale = 4;
    const pixels = new Uint8ClampedArray(size * scale * size * scale).fill(255);
    for (const [, x, y] of path.matchAll(/M(\d+) (\d+)/g)) {
      for (let dy = 0; dy < scale; dy++) {
        for (let dx = 0; dx < scale; dx++) pixels[(Number(y) * scale + dy) * size * scale + Number(x) * scale + dx] = 0;
      }
    }
    const source = new RGBLuminanceSource(pixels, size * scale, size * scale);
    const result = new QRCodeReader().decode(new BinaryBitmap(new HybridBinarizer(source)));

    expect(result.getText()).toBe(payload);
  });
});
