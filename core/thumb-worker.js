// Neon OS core: makes small previews of pictures off the main thread (Photos)
// Gets { key, blob, size } and answers { key, blob } with a WebP (or JPEG) whose short side is `size`,
// or { key, blob: null } when it can't (an SVG, a broken file); Photos then shows the original.
async function decode(blob, opts) {
  try { return await createImageBitmap(blob, { imageOrientation: "from-image", ...opts }); }
  catch (e) { return await createImageBitmap(blob, opts); }
}
self.onmessage = async e => {
  const { key, blob, size } = e.data;
  try {
    // ask the decoder for a small picture straight away (much faster than decoding it whole)
    let bmp = await decode(blob, { resizeWidth: size, resizeQuality: "medium" });
    if (bmp.height < size) { bmp.close(); bmp = await decode(blob, { resizeHeight: size, resizeQuality: "medium" }); } // wide: by height instead
    const cv = new OffscreenCanvas(bmp.width, bmp.height);
    cv.getContext("2d").drawImage(bmp, 0, 0); bmp.close();
    let out = await cv.convertToBlob({ type: "image/webp", quality: 0.78 });
    if (out.type !== "image/webp") out = await cv.convertToBlob({ type: "image/jpeg", quality: 0.8 });
    self.postMessage({ key, blob: out });
  } catch (err) { self.postMessage({ key, blob: null }); }
};
