# Project Glossary — Ubiquitous Language

> One vocabulary, everywhere. The **same word** is used in the database (Prisma model),
> backend (NestJS module/service), API resource, React component domain, admin label, and
> chatbot. No synonyms. If a term changes, it changes everywhere in **one PR**.
>
> See `docs/ENGINEERING-STANDARDS.md` §A1.

## Authoritative terms

| Term | Meaning |
|---|---|
| **Lead** | A prospective customer who has expressed interest but not yet transacted. |
| **Customer** | A person or entity that has placed at least one order. |
| **Vehicle** | The insured vehicle (plate, chassis, engine identifiers). |
| **IdentityDocument** | A passport or national ID document submitted by a customer. |
| **OcrResult** | The raw extracted output from OCR of an `IdentityDocument`. Never "cleaned". |
| **Order** | A single insurance purchase transaction, governed by the order state machine. |
| **Invoice** | The billing record for an `Order`. |
| **PaymentAttempt** | One attempt to collect payment for an `Invoice` (may fail/retry). |
| **Payment** | A successfully captured payment. |
| **Certificate** | The issued insurance certificate (the legal proof of cover). |
| **Renewal** | The process/record of renewing an expiring `Certificate`. |
| **Partner** | A channel partner / agent who refers business and earns commission. |
| **Commission** | Amount owed to a `Partner`, computed by the commission tier ladder. |
| **Premium** | The insurance price charged to the customer. |
| **FxQuote** | A locked, time-stamped foreign-exchange quote (source rate + markup, rounded). |
| **Market** | The market a transaction belongs to: `TH` (Thailand) or `LA` (Laos). |

## Rule

> Prisma model name = NestJS module/service name = API resource = React component domain =
> admin label = chatbot term.

When introducing any new domain term, add it here **before** using it in code.
