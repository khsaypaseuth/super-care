/**
 * CustomerForm — Step 2 of the CMI intake wizard (CUST-01/02).
 *
 * Fields (per UI-SPEC):
 *   - Title (master_title_names Combobox)
 *   - First name / Last name
 *   - Card type (master_card_types Combobox) + card number (national ID or passport)
 *   - Nationality (master_nationalities Combobox)
 *   - Date of birth
 *   - Phone / Email
 *   - Address: line 1/2, province → district (cascading) → subdistrict (cascading) + postal code
 *
 * Client RHF form using zodResolver(customerStepInputSchema) — the SAME schema the server
 * re-parses. Identifier fields (national ID, passport) show inline errors from the shared
 * validators via .refine in the schema — blocking Continue (CUST-02).
 *
 * On submit → captureCustomerAction → advance to /document.
 * Responsive: single-column on mobile, two-column on desktop (≥sm).
 * All strings via useTranslations (no hardcoded strings). Thai font applies to master data values.
 *
 * @see UI-SPEC step 2; CUST-01/02
 */

"use client";

import { useState, useTransition, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { ChevronsUpDown, Check } from "lucide-react";

import {
  customerStepInputSchema,
  type CustomerStepInput,
} from "@/src/server/modules/intake/intake.schema";
import { captureCustomerAction } from "@/src/server/actions/intake.actions";

import { Button } from "@/src/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/src/components/ui/form";
import { Input } from "@/src/components/ui/input";
import { Alert, AlertDescription } from "@/src/components/ui/alert";
import { Separator } from "@/src/components/ui/separator";
import { cn } from "@/src/lib/utils";

// ─── Master data types ────────────────────────────────────────────────────────

interface MasterItem {
  id: string;
  code: string;
  nameTh?: string | null;
  nameEn?: string | null;
}

interface Province {
  id: string;
  code: string;
  nameTh: string;
  nameEn?: string | null;
}

interface District {
  id: string;
  code: string;
  nameTh: string;
  nameEn?: string | null;
  provinceId: string;
}

interface Subdistrict {
  id: string;
  code: string;
  nameTh: string;
  nameEn?: string | null;
  postalCode?: string | null;
  districtId: string;
}

interface CustomerFormProps {
  locale: string;
  draftId: string;
  titles: MasterItem[];
  cardTypes: MasterItem[];
  nationalities: MasterItem[];
  provinces: Province[];
  districts: District[];
  subdistricts: Subdistrict[];
}

// ─── Simple inline combobox ───────────────────────────────────────────────────

interface ComboboxOption {
  value: string;
  label: string;
  subLabel?: string | undefined;
}

interface InlineComboboxProps {
  value: string;
  onChange: (val: string) => void;
  options: ComboboxOption[];
  placeholder: string;
  label: string;
  disabled?: boolean;
  id?: string;
}

function InlineCombobox({
  value,
  onChange,
  options,
  placeholder,
  label,
  disabled,
  id,
}: InlineComboboxProps) {
  const [open, setOpen] = useState(false);

  const selectedLabel = options.find((o) => o.value === value)?.label;

  return (
    <div className="relative">
      <button
        type="button"
        role="combobox"
        aria-label={label}
        aria-expanded={open}
        id={id}
        className={cn(
          "flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm",
          "focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
          "disabled:cursor-not-allowed disabled:opacity-50",
          !value && "text-muted-foreground",
        )}
        onClick={() => !disabled && setOpen(!open)}
        disabled={disabled}
      >
        <span className="truncate font-thai">{selectedLabel ?? placeholder}</span>
        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" aria-hidden="true" />
      </button>

      {open && (
        <ul
          role="listbox"
          className="absolute z-50 mt-1 max-h-60 w-full overflow-auto rounded-md border bg-popover p-1 shadow-lg"
        >
          {options.length === 0 ? (
            <li className="py-2 px-3 text-sm text-muted-foreground">No options</li>
          ) : (
            options.map((opt) => (
              <li
                key={opt.value}
                role="option"
                aria-selected={value === opt.value}
                className={cn(
                  "flex cursor-pointer items-center rounded-sm px-2 py-2 text-sm hover:bg-accent",
                  value === opt.value && "bg-accent",
                )}
                onClick={() => {
                  onChange(opt.value);
                  setOpen(false);
                }}
              >
                <Check
                  className={cn(
                    "mr-2 h-4 w-4 shrink-0",
                    value === opt.value ? "opacity-100" : "opacity-0",
                  )}
                  aria-hidden="true"
                />
                <span className="font-thai">{opt.label}</span>
                {opt.subLabel && (
                  <span className="ml-auto text-xs text-muted-foreground">{opt.subLabel}</span>
                )}
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}

// ─── CustomerForm component ───────────────────────────────────────────────────

export function CustomerForm({
  locale,
  draftId,
  titles,
  cardTypes,
  nationalities,
  provinces,
  districts: allDistricts,
  subdistricts: allSubdistricts,
}: CustomerFormProps) {
  const t = useTranslations("intake");
  const tCommon = useTranslations("common");
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [serverError, setServerError] = useState<string | null>(null);

  const form = useForm<CustomerStepInput>({
    resolver: zodResolver(customerStepInputSchema),
    defaultValues: {
      firstName: "",
      lastName: "",
      cardTypeCode: "",
    },
  });

  const cardTypeCode = form.watch("cardTypeCode");
  const selectedProvince = form.watch("province");
  const selectedDistrict = form.watch("district");

  // Cascading address: filter districts by province
  const filteredDistricts = selectedProvince
    ? allDistricts.filter((d) => {
        const prov = provinces.find((p) => p.code === selectedProvince);
        return prov ? d.provinceId === prov.id : false;
      })
    : allDistricts;

  // Cascading address: filter subdistricts by district
  const filteredSubdistricts = selectedDistrict
    ? allSubdistricts.filter((s) => {
        const dist = allDistricts.find((d) => d.code === selectedDistrict);
        return dist ? s.districtId === dist.id : false;
      })
    : allSubdistricts;

  // Reset district/subdistrict when province changes
  useEffect(() => {
    form.setValue("district", undefined);
    form.setValue("subdistrict", undefined);
    form.setValue("postalCode", undefined);
  }, [selectedProvince]);

  // Reset subdistrict when district changes; auto-fill postal code
  useEffect(() => {
    form.setValue("subdistrict", undefined);
    const dist = allDistricts.find((d) => d.code === selectedDistrict);
    if (dist) {
      const firstSub = allSubdistricts.find((s) => s.districtId === dist.id);
      if (firstSub?.postalCode) {
        form.setValue("postalCode", firstSub.postalCode);
      }
    }
  }, [selectedDistrict]);

  async function onSubmit(data: CustomerStepInput) {
    setServerError(null);

    const formData = new FormData();

    // Append all fields (only defined values)
    const entries: Array<[string, string]> = [
      ["firstName", data.firstName],
      ["lastName", data.lastName],
      ["cardTypeCode", data.cardTypeCode],
    ];

    if (data.titleCode) entries.push(["titleCode", data.titleCode]);
    if (data.nationalId) entries.push(["nationalId", data.nationalId]);
    if (data.passportNumber) entries.push(["passportNumber", data.passportNumber]);
    if (data.nationalityCode) entries.push(["nationalityCode", data.nationalityCode]);
    if (data.dob) entries.push(["dob", data.dob]);
    if (data.phone) entries.push(["phone", data.phone]);
    if (data.email) entries.push(["email", data.email]);
    if (data.addressLine1) entries.push(["addressLine1", data.addressLine1]);
    if (data.addressLine2) entries.push(["addressLine2", data.addressLine2]);
    if (data.province) entries.push(["province", data.province]);
    if (data.district) entries.push(["district", data.district]);
    if (data.subdistrict) entries.push(["subdistrict", data.subdistrict]);
    if (data.postalCode) entries.push(["postalCode", data.postalCode]);

    for (const [key, val] of entries) {
      formData.set(key, val);
    }

    startTransition(async () => {
      const result = await captureCustomerAction(draftId, formData);

      if (!result.success) {
        if (result.fieldErrors) {
          for (const [field, messages] of Object.entries(result.fieldErrors)) {
            const msg = messages[0];
            if (msg !== undefined) {
              form.setError(field as keyof CustomerStepInput, { message: msg });
            }
          }
        } else {
          setServerError(result.error ?? t("error.generic"));
        }
        return;
      }

      router.push(`/${locale}/intake/${draftId}/document`);
    });
  }

  const titleOptions: ComboboxOption[] = titles.map((t) => ({
    value: t.code,
    label: t.nameTh ?? t.nameEn ?? t.code,
    subLabel: t.code,
  }));

  const cardTypeOptions: ComboboxOption[] = cardTypes.map((ct) => ({
    value: ct.code,
    label: ct.nameTh ?? ct.nameEn ?? ct.code,
    subLabel: ct.code,
  }));

  const nationalityOptions: ComboboxOption[] = nationalities.map((n) => ({
    value: n.code,
    label: n.nameTh ?? n.nameEn ?? n.code,
    ...((n.nameEn !== null && n.nameEn !== undefined) && { subLabel: n.nameEn }),
  }));

  const provinceOptions: ComboboxOption[] = provinces.map((p) => ({
    value: p.code,
    label: p.nameTh,
    ...((p.nameEn !== null && p.nameEn !== undefined) && { subLabel: p.nameEn }),
  }));

  const districtOptions: ComboboxOption[] = filteredDistricts.map((d) => ({
    value: d.code,
    label: d.nameTh,
    ...((d.nameEn !== null && d.nameEn !== undefined) && { subLabel: d.nameEn }),
  }));

  const subdistrictOptions: ComboboxOption[] = filteredSubdistricts.map((s) => ({
    value: s.code,
    label: s.nameTh,
    ...((s.postalCode !== null && s.postalCode !== undefined) && { subLabel: s.postalCode }),
  }));

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6" noValidate>
        {serverError && (
          <Alert variant="destructive" role="alert">
            <AlertDescription>{serverError}</AlertDescription>
          </Alert>
        )}

        {/* ── Personal information ──────────────────────────────────── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Title */}
          <FormField
            control={form.control}
            name="titleCode"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t("customer.title.label")}</FormLabel>
                <FormControl>
                  <InlineCombobox
                    value={field.value ?? ""}
                    onChange={field.onChange}
                    options={titleOptions}
                    placeholder={t("customer.title.placeholder")}
                    label={t("customer.title.label")}
                    disabled={isPending}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          {/* Nationality */}
          <FormField
            control={form.control}
            name="nationalityCode"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t("customer.nationality.label")}</FormLabel>
                <FormControl>
                  <InlineCombobox
                    value={field.value ?? ""}
                    onChange={field.onChange}
                    options={nationalityOptions}
                    placeholder={t("customer.nationality.placeholder")}
                    label={t("customer.nationality.label")}
                    disabled={isPending}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        {/* First name / Last name */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="firstName"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t("customer.firstName.label")}</FormLabel>
                <FormControl>
                  <Input
                    {...field}
                    id="firstName"
                    placeholder={t("customer.firstName.placeholder")}
                    disabled={isPending}
                    aria-describedby="firstName-error"
                    className="font-thai"
                  />
                </FormControl>
                <FormMessage id="firstName-error" />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="lastName"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t("customer.lastName.label")}</FormLabel>
                <FormControl>
                  <Input
                    {...field}
                    id="lastName"
                    placeholder={t("customer.lastName.placeholder")}
                    disabled={isPending}
                    aria-describedby="lastName-error"
                    className="font-thai"
                  />
                </FormControl>
                <FormMessage id="lastName-error" />
              </FormItem>
            )}
          />
        </div>

        {/* DOB / Phone */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="dob"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t("customer.dob.label")}</FormLabel>
                <FormControl>
                  <Input
                    {...field}
                    id="dob"
                    type="date"
                    placeholder={t("customer.dob.placeholder")}
                    disabled={isPending}
                    aria-describedby="dob-error"
                  />
                </FormControl>
                <FormMessage id="dob-error" />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="phone"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t("customer.phone.label")}</FormLabel>
                <FormControl>
                  <Input
                    {...field}
                    id="phone"
                    type="tel"
                    placeholder={t("customer.phone.placeholder")}
                    disabled={isPending}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        {/* Email */}
        <FormField
          control={form.control}
          name="email"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t("customer.email.label")}</FormLabel>
              <FormControl>
                <Input
                  {...field}
                  id="email"
                  type="email"
                  placeholder={t("customer.email.placeholder")}
                  disabled={isPending}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <Separator />

        {/* ── Identification ─────────────────────────────────────────── */}
        <div className="space-y-4">
          {/* Card type */}
          <FormField
            control={form.control}
            name="cardTypeCode"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t("customer.cardType.label")}</FormLabel>
                <FormControl>
                  <InlineCombobox
                    value={field.value}
                    onChange={field.onChange}
                    options={cardTypeOptions}
                    placeholder={t("customer.cardType.placeholder")}
                    label={t("customer.cardType.label")}
                    disabled={isPending}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          {/* National ID (shown when cardTypeCode = "1") */}
          {cardTypeCode === "1" && (
            <FormField
              control={form.control}
              name="nationalId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("customer.nationalId.label")}</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      id="nationalId"
                      placeholder={t("customer.nationalId.placeholder")}
                      maxLength={13}
                      disabled={isPending}
                      aria-describedby="nationalId-error"
                    />
                  </FormControl>
                  <FormMessage id="nationalId-error" />
                </FormItem>
              )}
            />
          )}

          {/* Passport (shown when cardTypeCode = "2") */}
          {cardTypeCode === "2" && (
            <FormField
              control={form.control}
              name="passportNumber"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("customer.passportNumber.label")}</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      id="passportNumber"
                      placeholder={t("customer.passportNumber.placeholder")}
                      disabled={isPending}
                      aria-describedby="passportNumber-error"
                    />
                  </FormControl>
                  <FormMessage id="passportNumber-error" />
                </FormItem>
              )}
            />
          )}
        </div>

        <Separator />

        {/* ── Address ────────────────────────────────────────────────── */}
        <div className="space-y-4">
          <h3 className="text-base font-semibold">{t("customer.address.heading")}</h3>

          <FormField
            control={form.control}
            name="addressLine1"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t("customer.address.line1.label")}</FormLabel>
                <FormControl>
                  <Input
                    {...field}
                    id="addressLine1"
                    placeholder={t("customer.address.line1.placeholder")}
                    disabled={isPending}
                    className="font-thai"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="addressLine2"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t("customer.address.line2.label")}</FormLabel>
                <FormControl>
                  <Input
                    {...field}
                    id="addressLine2"
                    placeholder={t("customer.address.line2.placeholder")}
                    disabled={isPending}
                    className="font-thai"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          {/* Province / District */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FormField
              control={form.control}
              name="province"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("customer.address.province.label")}</FormLabel>
                  <FormControl>
                    <InlineCombobox
                      value={field.value ?? ""}
                      onChange={field.onChange}
                      options={provinceOptions}
                      placeholder={t("customer.address.province.placeholder")}
                      label={t("customer.address.province.label")}
                      disabled={isPending}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="district"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("customer.address.district.label")}</FormLabel>
                  <FormControl>
                    <InlineCombobox
                      value={field.value ?? ""}
                      onChange={field.onChange}
                      options={districtOptions}
                      placeholder={t("customer.address.district.placeholder")}
                      label={t("customer.address.district.label")}
                      disabled={isPending || !selectedProvince}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          {/* Subdistrict / Postal code */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FormField
              control={form.control}
              name="subdistrict"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("customer.address.subdistrict.label")}</FormLabel>
                  <FormControl>
                    <InlineCombobox
                      value={field.value ?? ""}
                      onChange={(val) => {
                        field.onChange(val);
                        // Auto-fill postal code from subdistrict
                        const sub = allSubdistricts.find((s) => s.code === val);
                        if (sub?.postalCode) {
                          form.setValue("postalCode", sub.postalCode);
                        }
                      }}
                      options={subdistrictOptions}
                      placeholder={t("customer.address.subdistrict.placeholder")}
                      label={t("customer.address.subdistrict.label")}
                      disabled={isPending || !selectedDistrict}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="postalCode"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("customer.address.postalCode.label")}</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      id="postalCode"
                      placeholder={t("customer.address.postalCode.placeholder")}
                      maxLength={5}
                      disabled={isPending}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
        </div>

        {/* Submit */}
        <div className="flex justify-between pt-2 pb-safe-bottom">
          <Button
            type="button"
            variant="outline"
            disabled={isPending}
            className="min-h-[44px]"
            onClick={() => router.push(`/${locale}/intake/${draftId}/start`)}
          >
            {tCommon("back")}
          </Button>
          <Button type="submit" disabled={isPending} className="min-h-[44px] px-8">
            {isPending ? tCommon("loading") : tCommon("continue")}
          </Button>
        </div>
      </form>
    </Form>
  );
}
