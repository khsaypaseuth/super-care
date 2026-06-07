/**
 * Idempotent reference-data seed.
 *
 * Run via: pnpm --filter @super-care/web exec prisma db seed
 * Or directly: tsx prisma/seed.ts
 *
 * IMPORTANT: Prisma 7 does NOT auto-load .env at runtime.
 * Load the env file explicitly before connecting (see dotenv block below).
 *
 * All upserts are keyed on the natural `code` field so re-runs are safe.
 * Parent tables are seeded before children (provinces → districts → subdistricts,
 * brands → models).
 *
 * [DATA] Follow-up items (bulk imports NOT done in this phase):
 *   - Full ISO-3166 Alpha-3 nationality list (~250 rows) — import from source
 *   - All 77 Thai provinces + districts + subdistricts + postal codes — import from source
 *   - Full car brand list — import from source
 *   - Full car model list per brand — import from source
 */

import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client.js";

// ─── Explicit env loading (Pitfall 1: Prisma 7 does not auto-load .env) ────────
// Load .env from apps/web/ relative to this file's location.
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

try {
  const envPath = resolve(__dirname, "../.env");
  const envContent = readFileSync(envPath, "utf8");
  for (const line of envContent.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx < 0) continue;
    const key = trimmed.slice(0, eqIdx);
    const value = trimmed.slice(eqIdx + 1);
    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
} catch {
  // .env file is optional (prod uses real env vars)
}

// ─── PrismaClient ─────────────────────────────────────────────────────────────
const connectionString = process.env["DATABASE_URL"];
if (!connectionString) {
  throw new Error("DATABASE_URL must be set to run the seed script");
}

const adapter = new PrismaPg({ connectionString });
const db = new PrismaClient({ adapter });

// ─── Seed data ────────────────────────────────────────────────────────────────

/** Upsert helper — keyed on natural code. */
async function upsert<T extends { code: string; [k: string]: unknown }>(
  model: {
    upsert: (args: {
      where: { code: string };
      create: T;
      update: T;
    }) => Promise<unknown>;
  },
  rows: T[],
): Promise<void> {
  for (const row of rows) {
    await model.upsert({
      where: { code: row.code },
      create: row,
      update: row,
    });
  }
}

async function main(): Promise<void> {
  console.log("Seeding reference data...");

  // ── Master title names (6 rows from CMI-SPEC.md) ──────────────────────────
  await upsert(db.masterTitleName, [
    { code: "5",   nameTh: "คุณ",      nameEn: "Khun"   },
    { code: "6",   nameTh: "นาย",      nameEn: "Mr"     },
    { code: "7",   nameTh: "นาง",      nameEn: "Mrs"    },
    { code: "8",   nameTh: "นางสาว",   nameEn: "Miss"   },
    { code: "258", nameTh: "เด็กชาย",  nameEn: "Master" },
    { code: "262", nameTh: "เด็กหญิง", nameEn: "Miss"   },
  ]);
  console.log("  ✓ master_title_names (6 rows)");

  // ── Master card types (5 rows from CMI-SPEC.md) ───────────────────────────
  await upsert(db.masterCardType, [
    { code: "1", nameTh: "บัตรประชาชน",                            nameEn: "ID Card"                              },
    { code: "2", nameTh: "หนังสือเดินทาง",                         nameEn: "Passport"                             },
    { code: "3", nameTh: "บัตรต่างด้าว",                           nameEn: "Non-Thai ID"                          },
    { code: "4", nameTh: "บัตรข้าราชการ",                          nameEn: "Government ID"                        },
    { code: "5", nameTh: "บัตรที่รัฐออกให้ / ทะเบียนนิติบุคคล",   nameEn: "State Government ID / legal-entity registration" },
  ]);
  console.log("  ✓ master_card_types (5 rows)");

  // ── Master car colors (~23 rows from CMI-SPEC.md) ─────────────────────────
  await upsert(db.masterCarColor, [
    { code: "1",   nameTh: "เขียวเหลือง",  nameEn: "Yellow-Green" },
    { code: "2",   nameTh: "ดำ",           nameEn: "Black"        },
    { code: "3",   nameTh: "ขาว",          nameEn: "White"        },
    { code: "4",   nameTh: "น้ำเงิน",      nameEn: "Blue"         },
    { code: "5",   nameTh: "แดง",          nameEn: "Red"          },
    { code: "6",   nameTh: "เหลือง",       nameEn: "Yellow"       },
    { code: "7",   nameTh: "ฟ้า",          nameEn: "Sky Blue"     },
    { code: "8",   nameTh: "เขียว",        nameEn: "Green"        },
    { code: "9",   nameTh: "ส้ม",          nameEn: "Orange"       },
    { code: "10",  nameTh: "ชมพู",         nameEn: "Pink"         },
    { code: "11",  nameTh: "น้ำตาล",       nameEn: "Brown"        },
    { code: "12",  nameTh: "ม่วง",         nameEn: "Purple"       },
    { code: "13",  nameTh: "เทา",          nameEn: "Grey"         },
    { code: "15",  nameTh: "ครีม",         nameEn: "Cream"        },
    { code: "16",  nameTh: "ทอง",          nameEn: "Gold"         },
    { code: "17",  nameTh: "ดำเหลือง",     nameEn: "Black-Yellow" },
    { code: "18",  nameTh: "บรอนซ์",       nameEn: "Bronze"       },
    { code: "19",  nameTh: "เงิน",         nameEn: "Silver"       },
    { code: "20",  nameTh: "ตะกั่ว",       nameEn: "Lead"         },
    { code: "101", nameTh: "เหลืองแดง",    nameEn: "Yellow-Red"   },
    { code: "140", nameTh: "ชมพูคาดเขียว", nameEn: "Pink-Green"   },
    { code: "243", nameTh: "ชมพูน้ำเงิน",  nameEn: "Pink-Blue"    },
    { code: "999", nameTh: "อื่นๆ",        nameEn: "Other"        },
  ]);
  console.log("  ✓ master_car_colors (23 rows)");

  // ── Master vehicle types (3 examples from CMI-SPEC.md) ───────────────────
  await upsert(db.masterVehicleType, [
    { code: "1.10",  nameTh: "รถยนต์นั่งไม่เกิน 7 คน",             nameEn: "Passenger car up to 7 seats" },
    { code: "1.20A", nameTh: "รถยนต์โดยสารไม่เกิน 15 ที่นั่ง",     nameEn: "Bus up to 15 seats"          },
    { code: "1.40A", nameTh: "รถบรรทุกส่วนบุคคลไม่เกิน 3 ตัน",     nameEn: "Private truck up to 3 tons"  },
  ]);
  console.log("  ✓ master_vehicle_types (3 rows — full list is [DATA] follow-up)");

  // ── CMI policy types ──────────────────────────────────────────────────────
  await upsert(db.cmiPolicyType, [
    { code: "NEW",     nameTh: "ซื้อใหม่",  nameEn: "New Policy" },
    { code: "RENEWAL", nameTh: "ต่ออายุ",   nameEn: "Renewal"    },
  ]);
  console.log("  ✓ cmi_policy_types (2 rows)");

  // ── Insurance companies (example rows) ───────────────────────────────────
  await upsert(db.insuranceCompany, [
    { code: "VIRIYAH",  name: "Viriyah Insurance",   nameTh: "วิริยะประกันภัย"       },
    { code: "DHIPAYA",  name: "Dhipaya Insurance",   nameTh: "ทิพยประกันภัย"         },
    { code: "BANGKOKINSURANCE", name: "Bangkok Insurance", nameTh: "กรุงเทพประกันภัย" },
  ]);
  console.log("  ✓ insurance_companies (3 example rows — full list is [DATA] follow-up)");

  // ── [DATA] Nationalities — full ISO-3166 Alpha-3 list — NOT seeded inline ─
  // Only a few examples are seeded; the full ~250-row import is a [DATA] follow-up.
  await upsert(db.masterNationality, [
    { code: "THA", nameTh: "ไทย",         nameEn: "Thai"       },
    { code: "LAO", nameTh: "ลาว",         nameEn: "Lao"        },
    { code: "CHN", nameTh: "จีน",         nameEn: "Chinese"    },
    { code: "VNM", nameTh: "เวียดนาม",    nameEn: "Vietnamese" },
    { code: "KHM", nameTh: "กัมพูชา",     nameEn: "Cambodian"  },
    { code: "MMR", nameTh: "พม่า",        nameEn: "Burmese"    },
    { code: "USA", nameTh: "อเมริกา",     nameEn: "American"   },
    { code: "GBR", nameTh: "อังกฤษ",      nameEn: "British"    },
    { code: "JPN", nameTh: "ญี่ปุ่น",     nameEn: "Japanese"   },
    { code: "KOR", nameTh: "เกาหลี",      nameEn: "Korean"     },
  ]);
  console.log("  ✓ master_nationalities (10 examples — [DATA] full ISO-3166 import is a follow-up)");

  // ── [DATA] Provinces, Districts, Subdistricts — NOT seeded inline ─────────
  // Full 77-province + all districts/subdistricts/postal-codes import is a [DATA] follow-up.
  // A single example province/district/subdistrict is seeded for FK integrity demos.
  const bangkokProvince = await db.masterProvince.upsert({
    where: { code: "BKK" },
    create: { code: "BKK", nameTh: "กรุงเทพมหานคร", nameEn: "Bangkok" },
    update: { nameTh: "กรุงเทพมหานคร", nameEn: "Bangkok" },
  });
  console.log("  ✓ master_provinces (1 example — [DATA] full 77-province import is a follow-up)");

  const bangkokDistrict = await db.masterDistrict.upsert({
    where: { code: "BKK-PATHUMWAN" },
    create: {
      code: "BKK-PATHUMWAN",
      nameTh: "ปทุมวัน",
      nameEn: "Pathum Wan",
      provinceId: bangkokProvince.id,
    },
    update: { nameTh: "ปทุมวัน", nameEn: "Pathum Wan" },
  });
  console.log("  ✓ master_districts (1 example — [DATA] full import is a follow-up)");

  await db.masterSubdistrict.upsert({
    where: { code: "BKK-PATHUMWAN-WANGMAI" },
    create: {
      code: "BKK-PATHUMWAN-WANGMAI",
      nameTh: "วังใหม่",
      nameEn: "Wang Mai",
      postalCode: "10330",
      districtId: bangkokDistrict.id,
    },
    update: { nameTh: "วังใหม่", nameEn: "Wang Mai", postalCode: "10330" },
  });
  console.log("  ✓ master_subdistricts (1 example — [DATA] full import is a follow-up)");

  // ── [DATA] Car brands + models — NOT seeded inline ────────────────────────
  // A few example brands/models are seeded; full list is a [DATA] follow-up.
  const toyota = await db.masterCarBrand.upsert({
    where: { code: "TOYOTA" },
    create: { code: "TOYOTA", name: "Toyota", nameTh: "โตโยต้า" },
    update: { name: "Toyota", nameTh: "โตโยต้า" },
  });

  const honda = await db.masterCarBrand.upsert({
    where: { code: "HONDA" },
    create: { code: "HONDA", name: "Honda", nameTh: "ฮอนด้า" },
    update: { name: "Honda", nameTh: "ฮอนด้า" },
  });

  await db.masterCarBrand.upsert({
    where: { code: "NISSAN" },
    create: { code: "NISSAN", name: "Nissan", nameTh: "นิสสัน" },
    update: { name: "Nissan", nameTh: "นิสสัน" },
  });
  console.log("  ✓ master_car_brands (3 examples — [DATA] full brand import is a follow-up)");

  // Example models — brands must exist first (parent-first ordering)
  await db.masterCarModel.upsert({
    where: { code: "TOYOTA-CAMRY" },
    create: { code: "TOYOTA-CAMRY", name: "Camry", nameTh: "แคมรี่", brandId: toyota.id },
    update: { name: "Camry", nameTh: "แคมรี่" },
  });
  await db.masterCarModel.upsert({
    where: { code: "TOYOTA-FORTUNER" },
    create: { code: "TOYOTA-FORTUNER", name: "Fortuner", nameTh: "ฟอร์จูนเนอร์", brandId: toyota.id },
    update: { name: "Fortuner", nameTh: "ฟอร์จูนเนอร์" },
  });
  await db.masterCarModel.upsert({
    where: { code: "HONDA-CIVIC" },
    create: { code: "HONDA-CIVIC", name: "Civic", nameTh: "ซีวิค", brandId: honda.id },
    update: { name: "Civic", nameTh: "ซีวิค" },
  });
  console.log("  ✓ master_car_models (3 examples — [DATA] full model import is a follow-up)");

  console.log("\nSeed complete.");
}

main()
  .catch((e) => {
    console.error("Seed failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
