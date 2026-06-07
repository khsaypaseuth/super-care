/**
 * StartForm — Step 1 of the CMI intake wizard.
 *
 * Fields:
 *   - Insurance Company (Combobox from insurance_companies master table)
 *   - Policy Mode: New Policy / Renewal (RadioGroup — CMI-02)
 *
 * Uses react-hook-form + zodResolver(startIntakeInputSchema).
 * On submit → startIntakeAction → redirect to /[id]/customer.
 * All strings via useTranslations (no hardcoded strings).
 *
 * @see UI-SPEC step 1; CMI-02
 */

"use client";

import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { ChevronsUpDown, Check } from "lucide-react";

import {
  startIntakeInputSchema,
  type StartIntakeInput,
} from "@/src/server/modules/intake/intake.schema";
import { startIntakeAction } from "@/src/server/actions/intake.actions";

import { Button } from "@/src/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/src/components/ui/form";
import { RadioGroup, RadioGroupItem } from "@/src/components/ui/radio-group";
import { Label } from "@/src/components/ui/label";
import { Alert, AlertDescription } from "@/src/components/ui/alert";
import { cn } from "@/src/lib/utils";

interface InsuranceCompanyOption {
  id: string;
  code: string;
  name: string;
  nameTh?: string | null;
}

interface StartFormProps {
  locale: string;
  insuranceCompanies: InsuranceCompanyOption[];
}

export function StartForm({ locale, insuranceCompanies }: StartFormProps) {
  const t = useTranslations("intake");
  const tCommon = useTranslations("common");
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [serverError, setServerError] = useState<string | null>(null);
  const [comboboxOpen, setComboboxOpen] = useState(false);

  const form = useForm<StartIntakeInput>({
    resolver: zodResolver(startIntakeInputSchema),
    defaultValues: {
      insuranceCompanyId: "",
      policyMode: "NEW",
    },
  });

  const selectedInsurerId = form.watch("insuranceCompanyId");
  const selectedInsurer = insuranceCompanies.find(
    (c) => c.id === selectedInsurerId,
  );

  async function onSubmit(data: StartIntakeInput) {
    setServerError(null);

    const formData = new FormData();
    formData.set("insuranceCompanyId", data.insuranceCompanyId);
    formData.set("policyMode", data.policyMode);

    startTransition(async () => {
      const result = await startIntakeAction(formData);

      if (!result.success) {
        if (result.fieldErrors) {
          for (const [field, messages] of Object.entries(result.fieldErrors)) {
            const msg = messages[0];
            if (msg !== undefined) {
              form.setError(field as keyof StartIntakeInput, { message: msg });
            }
          }
        } else {
          setServerError(result.error ?? t("error.generic"));
        }
        return;
      }

      if (result.data?.draftId) {
        router.push(`/${locale}/intake/${result.data.draftId}/customer`);
      }
    });
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        {/* Server-level error alert */}
        {serverError && (
          <Alert variant="destructive" role="alert">
            <AlertDescription>{serverError}</AlertDescription>
          </Alert>
        )}

        {/* Insurance Company Combobox */}
        <FormField
          control={form.control}
          name="insuranceCompanyId"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t("start.insuranceCompany.label")}</FormLabel>
              <FormControl>
                <div className="relative">
                  <button
                    type="button"
                    role="combobox"
                    aria-label={t("start.insuranceCompany.label")}
                    aria-expanded={comboboxOpen}
                    aria-controls="insurer-listbox"
                    className={cn(
                      "flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background",
                      "focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
                      "disabled:cursor-not-allowed disabled:opacity-50",
                      !field.value && "text-muted-foreground",
                    )}
                    onClick={() => setComboboxOpen(!comboboxOpen)}
                    disabled={isPending}
                  >
                    <span className="truncate">
                      {selectedInsurer
                        ? (selectedInsurer.nameTh ?? selectedInsurer.name)
                        : t("start.insuranceCompany.placeholder")}
                    </span>
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" aria-hidden="true" />
                  </button>

                  {comboboxOpen && (
                    <ul
                      id="insurer-listbox"
                      role="listbox"
                      aria-label={t("start.insuranceCompany.label")}
                      className="absolute z-50 mt-1 max-h-60 w-full overflow-auto rounded-md border bg-popover p-1 shadow-lg"
                    >
                      {insuranceCompanies.length === 0 ? (
                        <li className="py-2 px-3 text-sm text-muted-foreground">
                          {t("start.insuranceCompany.empty")}
                        </li>
                      ) : (
                        insuranceCompanies.map((company) => (
                          <li
                            key={company.id}
                            role="option"
                            aria-selected={field.value === company.id}
                            className={cn(
                              "flex cursor-pointer items-center rounded-sm px-2 py-2 text-sm",
                              "hover:bg-accent hover:text-accent-foreground",
                              field.value === company.id &&
                                "bg-accent text-accent-foreground",
                            )}
                            onClick={() => {
                              field.onChange(company.id);
                              setComboboxOpen(false);
                            }}
                          >
                            <Check
                              className={cn(
                                "mr-2 h-4 w-4 shrink-0",
                                field.value === company.id
                                  ? "opacity-100"
                                  : "opacity-0",
                              )}
                              aria-hidden="true"
                            />
                            <span>{company.nameTh ?? company.name}</span>
                            {company.nameTh && (
                              <span className="ml-auto text-xs text-muted-foreground">
                                {company.code}
                              </span>
                            )}
                          </li>
                        ))
                      )}
                    </ul>
                  )}
                </div>
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Policy Mode RadioGroup (CMI-02: New Policy / Renewal) */}
        <FormField
          control={form.control}
          name="policyMode"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t("start.policyMode.label")}</FormLabel>
              <FormControl>
                <RadioGroup
                  value={field.value}
                  onValueChange={field.onChange}
                  disabled={isPending}
                  className="flex flex-col sm:flex-row gap-3"
                  aria-label={t("start.policyMode.label")}
                >
                  {/* New Policy */}
                  <div className="flex items-center gap-3 rounded-lg border p-4 cursor-pointer hover:bg-accent transition-colors flex-1">
                    <RadioGroupItem value="NEW" id="policyMode-new" />
                    <Label
                      htmlFor="policyMode-new"
                      className="cursor-pointer flex-1"
                    >
                      <span className="font-medium">{t("start.policyMode.new")}</span>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {t("start.policyMode.newDescription")}
                      </p>
                    </Label>
                  </div>

                  {/* Renewal */}
                  <div className="flex items-center gap-3 rounded-lg border p-4 cursor-pointer hover:bg-accent transition-colors flex-1">
                    <RadioGroupItem value="RENEWAL" id="policyMode-renewal" />
                    <Label
                      htmlFor="policyMode-renewal"
                      className="cursor-pointer flex-1"
                    >
                      <span className="font-medium">{t("start.policyMode.renewal")}</span>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {t("start.policyMode.renewalDescription")}
                      </p>
                    </Label>
                  </div>
                </RadioGroup>
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Submit */}
        <div className="flex justify-end pt-2">
          <Button
            type="submit"
            disabled={isPending}
            className="min-h-[44px] px-8"
          >
            {isPending ? tCommon("loading") : tCommon("continue")}
          </Button>
        </div>
      </form>
    </Form>
  );
}
