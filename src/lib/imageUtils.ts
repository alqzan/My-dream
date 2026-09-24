// Public image helpers stay at the historical import path. Browser APIs and
// HEIC decoding live behind the replaceable platform boundary.
export { compressImage, compressImageSmart, estimateSize } from "./platform/image";
