import { ocr, OCR_LATIN, MODEL_TYPES } from '@qvac/sdk';
import { parsePlateText, type PlateExtraction } from '../core/normalize/plate';
import type { Modality } from '../core/schema/observation';
import { withModel, type OnProgress } from './modelManager';

export type PlateScanResult = PlateExtraction & { rawLines: string[] };

/**
 * Runs on-device OCR (ggml-ocr / OCR_LATIN — EasyOCR pipeline) over a nameplate photo and
 * parses the recognized text blocks into structured fields. See
 * src/core/normalize/plate.ts for the regex + catalog matching; this module only owns the
 * QVAC model lifecycle and the image-to-text-blocks call.
 */
export async function scanPlate(imagePath: string, modality?: Modality | null, onProgress?: OnProgress): Promise<PlateScanResult> {
  // expo-image-picker returns a 'file://' URI, but QVAC's ocr() reads the path directly
  // off the filesystem (not through a URI-aware loader) — passed through unmodified, it
  // fails with "Image file not found or not accessible" quoting the URI verbatim.
  const path = imagePath.startsWith('file://') ? imagePath.slice('file://'.length) : imagePath;

  return withModel(
    {
      modelSrc: OCR_LATIN,
      modelType: MODEL_TYPES.ggmlOcr,
      onProgress,
    },
    async (modelId) => {
      const { blocks } = ocr({ modelId, image: path, stream: false });
      const resolved = await blocks;
      const rawLines = resolved.map((b) => b.text).filter((t) => t.trim().length > 0);
      return { ...parsePlateText(rawLines, modality), rawLines };
    }
  );
}
