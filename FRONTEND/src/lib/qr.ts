/**
 * QR codes for the parent's pickup code (SRS 10, 18.9), drawn as SVG from
 * the encoder in @zxing/library (already used by the gate scanner), so no
 * extra dependency. The encoder loads only when a code is shown.
 */

/** The parts of a zxing BitMatrix this needs. */
export type QrMatrix = { getWidth(): number; getHeight(): number; get(x: number, y: number): boolean };

/** Quiet zone around the code, in modules; 4 is what scanners expect. */
export const QR_MARGIN = 4;

/** An SVG path drawing every dark module as a 1x1 square, with the matrix size. */
export function qrSvgPath(matrix: QrMatrix): { size: number; path: string } {
  const parts: string[] = [];
  for (let y = 0; y < matrix.getHeight(); y++) {
    for (let x = 0; x < matrix.getWidth(); x++) {
      if (matrix.get(x, y)) parts.push(`M${x} ${y}h1v1h-1z`);
    }
  }
  return { size: matrix.getWidth(), path: parts.join("") };
}

/** Encode text as a QR code (smallest size, margin included). Browser or server. */
export async function encodeQr(text: string): Promise<{ size: number; path: string }> {
  const { BarcodeFormat, EncodeHintType, QRCodeWriter } = await import("@zxing/library");
  const hints = new Map([[EncodeHintType.MARGIN, QR_MARGIN]]);
  // Width and height 0: one unit per module; the SVG scales it up.
  const matrix = new QRCodeWriter().encode(text, BarcodeFormat.QR_CODE, 0, 0, hints);
  return qrSvgPath(matrix);
}
