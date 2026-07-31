import { z } from "zod"

/**
 * OCR multi-process response shape used to update Cosmos `fields`:
 * documents[0].result.results[0].data
 */
export const ocrProcessResponseSchema = z
  .object({
    documents: z
      .array(
        z
          .object({
            result: z
              .object({
                results: z
                  .array(
                    z
                      .object({
                        data: z.record(z.string(), z.unknown()),
                      })
                      .passthrough()
                  )
                  .min(1, "result.results must have at least 1 item"),
              })
              .passthrough(),
          })
          .passthrough()
      )
      .min(1, "documents must have at least 1 item"),
  })
  .passthrough()

export type OcrProcessResponse = z.infer<typeof ocrProcessResponseSchema>

export function extractOcrFieldsFromResponse(payload: unknown) {
  const parsed = ocrProcessResponseSchema.safeParse(payload)
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => {
        const path = issue.path.length > 0 ? issue.path.join(".") : "(root)"
        return `${path}: ${issue.message}`
      })
      .slice(0, 8)
    throw new Error(
      `OCR response schema mismatch — expected documents[0].result.results[0].data. ${issues.join("; ")}`
    )
  }

  return parsed.data.documents[0].result.results[0].data
}
