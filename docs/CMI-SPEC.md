# Thai Compulsory Motor Insurance (CMI / พ.ร.บ.) — Product & Data Spec

> First concrete market for super-care. **V1 product scope = ONLY Thai CMI (พ.ร.บ.).**
> The broader cross-border platform (FX, partners, messaging) remains in V1 as later phases;
> Thai CMI is the first end-to-end slice. See `.planning/PROJECT.md` and `.planning/ROADMAP.md`.

## Main workflow

1. Customer selects insurance company
2. Customer selects **New Policy** or **Renewal**
3. Customer uploads **vehicle registration book** (OCR)
4. OCR extracts vehicle and owner information
5. **AI maps** extracted values to master tables (AI never validates identifiers — that stays deterministic)
6. User verifies data (human-verify gate on money/legal fields)
7. User pays online
8. Staff receives order through admin panel
9. Policy is issued
10. Policy PDF sent to customer

## Recommended technology (per spec)

- Database: **PostgreSQL** (on Hostinger)
- App: **Next.js + Prisma** (no NestJS — see PROJECT.md decision; spec said "Next.js + Supabase", overridden to self-hosted Prisma/Postgres on Hostinger)
- OCR: **Google Document AI**
- AI (master-table mapping): **Claude Opus / GPT-5.5**
- Payment: **PromptPay QR, Omise, 2C2P** (all THB)

## Core master tables

`insurance_companies`, `cmi_policy_types`, `master_title_names`, `master_card_types`,
`master_nationalities`, `master_provinces`, `master_districts`, `master_subdistricts`,
`master_car_brands`, `master_car_models`, `master_car_colors`, `master_vehicle_types`

## Reference data

### Title names
| Code | Thai | English |
|---|---|---|
| 5 | คุณ | Khun |
| 6 | นาย | Mr |
| 7 | นาง | Mrs |
| 8 | นางสาว | Miss |
| 258 | เด็กชาย | Master |
| 262 | เด็กหญิง | Miss |

### Card types
| Code | Thai | English |
|---|---|---|
| 1 | บัตรประชาชน | ID Card |
| 2 | หนังสือเดินทาง | Passport |
| 3 | บัตรต่างด้าว | Non-Thai ID |
| 4 | บัตรข้าราชการ | Government ID |
| 5 | บัตรที่รัฐออกให้ / ทะเบียนนิติบุคคล | State Government ID / legal-entity registration |

### Nationalities
- Use **ISO-3166 Alpha-3**. Examples: THA, LAO, CHN, VNM, KHM, MMR, USA, GBR, JPN, KOR.
- **Import the complete nationality list** from the source website.

### Provinces
- **Import all 77 Thai provinces** (+ districts and subdistricts → postal codes).

### Vehicle brands
- **Import all brands** from the source website. Examples: TOYOTA, HONDA, NISSAN, MITSUBISHI,
  ISUZU, MAZDA, BMW, BENZ, AUDI, FORD, MG, BYD, NETA, DEEPAL, SHACMAN, SINOTRUK, FOTON, FAW,
  DONGFENG, HINO, FUSO, UD TRUCK, XCMG, ZOOMLION.

### Vehicle colors
1 เขียวเหลือง · 2 ดำ · 3 ขาว · 4 น้ำเงิน · 5 แดง · 6 เหลือง · 7 ฟ้า · 8 เขียว · 9 ส้ม ·
10 ชมพู · 11 น้ำตาล · 12 ม่วง · 13 เทา · 15 ครีม · 16 ทอง · 17 ดำเหลือง · 18 บรอนซ์ ·
19 เงิน · 20 ตะกั่ว · 101 เหลืองแดง · 140 ชมพูคาดเขียว · 243 ชมพูน้ำเงิน · 999 อื่นๆ

### Vehicle types (examples)
| Code | Thai |
|---|---|
| 1.10 | รถยนต์นั่งไม่เกิน 7 คน |
| 1.20A | รถยนต์โดยสารไม่เกิน 15 ที่นั่ง |
| 1.40A | รถบรรทุกส่วนบุคคลไม่เกิน 3 ตัน |

## Application fields

**Policy:** Insurance Company · Policy Type

**Customer / owner:** Customer Type · Gender · Nationality · Title Name · First Name ·
Last Name · Card Type · Card Number · Address · Province · District · Subdistrict ·
Postal Code · Phone · Birth Date · Email

**Vehicle:** Vehicle Type · Chassis Model · Chassis Number · Plate Prefix · Plate Number ·
Plate Province · Vehicle Brand · Vehicle Model · Vehicle Year · Vehicle Color · Engine CC ·
Seat Count · Engine Number · Vehicle Weight

## OCR fields (from the vehicle registration book)

Owner Name · Owner Address · ID Card Number · Passport Number · Vehicle Registration Number ·
Province · Vehicle Brand · Vehicle Model · Vehicle Year · Chassis Number · Engine Number ·
Engine Capacity · Vehicle Weight · Seat Count · Vehicle Color

## Glossary mapping

- "Policy" / "Certificate" → the issued CMI certificate (glossary term **Certificate**;
  CMI master table `cmi_policy_types`). Keep one term in code per `docs/GLOSSARY.md`.
- "insurance_companies" → the **insurer** behind a Certificate.
- OCR output stays a raw **OcrResult**; the **AI mapping** to master tables is a separate,
  human-verified step and never performs identifier checksum validation.
