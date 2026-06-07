/**
 * Canned vehicle registration book dataset for FakeOcrAdapter.
 *
 * These values use SEEDED master-table entries (Toyota/Camry, Bangkok province in Thai
 * script, White color, a Thai-ID-shaped 13-digit number, a plausible plate, chassis,
 * engine) so the demo FakeMapperAdapter maps cleanly — per Open Q4 in 03-RESEARCH.md.
 *
 * CRITICAL: Values are intentionally RAW — verbatim as an OCR engine would return them.
 * Whitespace, mixed case, and Thai script are preserved AS-IS. The unit test asserts
 * that values with surrounding whitespace survive untrimmed (CMI-03 / CUST-04).
 */

import type { OcrResultRaw } from "../ocr.port";

/**
 * Default canned reg-book OCR result.
 *
 * The ownerName has a leading space intentionally — the raw-never-cleaned contract
 * requires it to survive byte-identical through the adapter.
 */
export const FAKE_REGBOOK_RESULT: OcrResultRaw = {
  // Owner fields — Thai script, intentional leading space on ownerName (raw test fixture)
  ownerName: " สมชาย ใจดี",           // leading space is deliberate — raw contract test
  ownerAddress: "123/45 ถนนสุขุมวิท แขวงวังใหม่ เขตปทุมวัน กรุงเทพมหานคร 10330",
  idCardNumber: "1100501234567",        // 13-digit Thai-ID-shaped number
  passportNumber: null,

  // Vehicle registration fields — using seeded master values so mapper maps cleanly
  vehicleRegistrationNumber: "กข 1234",  // Thai plate format
  province: "กรุงเทพมหานคร",            // seeded BKK province Thai name

  vehicleBrand: "Toyota",               // seeded master_car_brands name
  vehicleModel: "Camry",                // seeded TOYOTA-CAMRY model name
  vehicleYear: "2563",                  // Thai calendar year (BE) — raw as OCR returns it

  chassisNumber: "JTDBT923X75123456",   // plausible Toyota chassis format
  engineNumber: "2AR-FE12345",          // plausible Toyota engine number

  engineCapacity: "2500",              // cc, as string (raw)
  vehicleWeight: "1500",               // kg, as string (raw)
  seatCount: "5",                      // as string (raw)
  vehicleColor: "ขาว",                  // seeded color code 3 Thai name
};

/**
 * Map of document types to canned results.
 * Additional document types can be added here for future fake scenarios.
 */
export const FAKE_REGBOOK_BY_TYPE: Record<string, OcrResultRaw> = {
  vehicle_registration_book: FAKE_REGBOOK_RESULT,
};

/**
 * Get the canned result for a document type. Falls back to the default reg-book result.
 */
export function getCannedResult(documentType: string): OcrResultRaw {
  return FAKE_REGBOOK_BY_TYPE[documentType] ?? FAKE_REGBOOK_RESULT;
}
