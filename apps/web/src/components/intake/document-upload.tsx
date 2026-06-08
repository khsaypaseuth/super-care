/**
 * DocumentUpload — Step 3 of the CMI intake wizard (CUST-03/04, CMI-03).
 *
 * States (per UI-SPEC):
 *   - Empty: dropzone with guidance (no file uploaded yet)
 *   - Uploading/extracting: Skeleton + "Extracting…" message
 *   - Success: raw OcrResult displayed read-only, labelled "raw OCR (unverified)"
 *   - Error: Alert + retry button (never silently advance)
 *
 * Upload: file input (image/*, application/pdf). The serverActions.bodySizeLimit
 * is set to 10mb in next.config.ts (Pitfall 7 mitigation). Server-side MIME + size
 * enforcement happens in uploadDocumentAction BEFORE OCR runs (T-03-16).
 *
 * The raw OcrResult is NEVER editable here — cleaning/verifying happens in 03-06
 * Map&Verify step (CUST-04 contract: raw, never normalized).
 *
 * On Continue → /verify (03-06).
 * All strings via useTranslations (no hardcoded strings).
 *
 * @see UI-SPEC step 3; CUST-03/04; CMI-03
 */

"use client";

import { useState, useTransition, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Upload, FileText, AlertTriangle } from "lucide-react";

import { uploadDocumentAction } from "@/src/server/actions/intake.actions";
import type { OcrResultRaw } from "@/src/server/adapters/ocr/ocr.port";

import { Button } from "@/src/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/src/components/ui/card";
import { Skeleton } from "@/src/components/ui/skeleton";
import { Alert, AlertDescription } from "@/src/components/ui/alert";
import { Badge } from "@/src/components/ui/badge";
import { cn } from "@/src/lib/utils";

// ─── OCR field labels (keyed in messages/en.json) ────────────────────────────

type OcrField = keyof OcrResultRaw;

const OCR_FIELDS: OcrField[] = [
  "ownerName",
  "ownerAddress",
  "idCardNumber",
  "passportNumber",
  "vehicleRegistrationNumber",
  "province",
  "vehicleBrand",
  "vehicleModel",
  "vehicleYear",
  "chassisNumber",
  "engineNumber",
  "engineCapacity",
  "vehicleWeight",
  "seatCount",
  "vehicleColor",
];

// ─── Component ────────────────────────────────────────────────────────────────

interface DocumentUploadProps {
  locale: string;
  draftId: string;
}

type UploadState =
  | { status: "idle" }
  | { status: "uploading" }
  | { status: "success"; rawOcr: OcrResultRaw }
  | { status: "error"; message: string };

export function DocumentUpload({ locale, draftId }: DocumentUploadProps) {
  const t = useTranslations("intake");
  const tCommon = useTranslations("common");
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [uploadState, setUploadState] = useState<UploadState>({ status: "idle" });
  const [isDragging, setIsDragging] = useState(false);

  const handleFile = useCallback(
    (file: File) => {
      // Client-side pre-check (UX only — server re-validates)
      const allowedMimes = new Set([
        "image/jpeg",
        "image/jpg",
        "image/png",
        "image/webp",
        "image/gif",
        "application/pdf",
      ]);
      if (!allowedMimes.has(file.type)) {
        setUploadState({
          status: "error",
          message: t("document.error.invalidType"),
        });
        return;
      }
      if (file.size > 10 * 1024 * 1024) {
        setUploadState({
          status: "error",
          message: t("document.error.tooLarge"),
        });
        return;
      }

      setUploadState({ status: "uploading" });

      const formData = new FormData();
      formData.set("file", file);

      startTransition(async () => {
        const result = await uploadDocumentAction(draftId, formData);

        if (!result.success) {
          setUploadState({
            status: "error",
            message: result.error ?? t("document.error.upload"),
          });
          return;
        }

        if (result.data?.rawOcr) {
          setUploadState({ status: "success", rawOcr: result.data.rawOcr });
        } else {
          setUploadState({
            status: "error",
            message: t("document.error.upload"),
          });
        }
      });
    },
    [draftId, startTransition, t],
  );

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  }

  function handleDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }

  function handleDragOver(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setIsDragging(true);
  }

  function handleDragLeave() {
    setIsDragging(false);
  }

  function handleRetry() {
    setUploadState({ status: "idle" });
  }

  const isUploading = uploadState.status === "uploading" || isPending;

  return (
    <div className="space-y-6">
      {/* ── Dropzone (shown when idle or error) ────────────────────── */}
      {(uploadState.status === "idle" || uploadState.status === "error") && (
        <div
          className={cn(
            "relative flex flex-col items-center justify-center rounded-lg border-2 border-dashed p-8 text-center transition-colors",
            isDragging
              ? "border-primary bg-primary/5"
              : "border-muted-foreground/25 hover:border-muted-foreground/50",
            isUploading && "opacity-50 pointer-events-none",
          )}
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          role="region"
          aria-label={t("document.dropzone.title")}
        >
          <input
            type="file"
            accept="image/*,application/pdf"
            onChange={handleInputChange}
            disabled={isUploading}
            className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
            aria-label={t("document.dropzone.browse")}
          />

          <div className="flex flex-col items-center gap-3 pointer-events-none">
            <div className="rounded-full bg-muted p-3">
              <Upload className="h-6 w-6 text-muted-foreground" aria-hidden="true" />
            </div>
            <div>
              <p className="font-medium text-sm">{t("document.dropzone.description")}</p>
              <p className="mt-1 text-xs text-muted-foreground">{t("document.dropzone.hint")}</p>
            </div>
          </div>
        </div>
      )}

      {/* Error alert */}
      {uploadState.status === "error" && (
        <Alert variant="destructive" role="alert">
          <AlertTriangle className="h-4 w-4" aria-hidden="true" />
          <AlertDescription className="flex items-center justify-between gap-4">
            <span>{uploadState.message}</span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleRetry}
              className="shrink-0"
            >
              {t("document.retry")}
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {/* ── Extracting skeleton ─────────────────────────────────────── */}
      {uploadState.status === "uploading" && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" aria-hidden="true" />
              <CardTitle className="text-base">{t("document.extracting")}</CardTitle>
            </div>
            <p className="text-sm text-muted-foreground">{t("document.extractingHint")}</p>
          </CardHeader>
          <CardContent className="space-y-3">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="flex gap-3">
                <Skeleton className="h-4 w-36 shrink-0" />
                <Skeleton className="h-4 flex-1" />
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* ── Raw OCR result (read-only, labelled unverified) ─────────── */}
      {uploadState.status === "success" && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2 flex-wrap">
              <FileText className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
              <CardTitle className="text-base">{t("document.rawOcr.heading")}</CardTitle>
              <Badge variant="outline" className="text-amber-600 border-amber-300 bg-amber-50">
                {t("step.verify")} — {t("document.rawOcr.heading")}
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground">
              {t("document.rawOcr.description")}
            </p>
          </CardHeader>
          <CardContent>
            <dl className="divide-y divide-border">
              {OCR_FIELDS.map((field) => {
                const value = uploadState.rawOcr[field];
                return (
                  <div key={field} className="flex flex-col sm:flex-row sm:gap-4 py-2.5">
                    <dt className="text-sm font-medium text-muted-foreground sm:w-48 shrink-0">
                      {t(`document.rawOcr.fieldLabel.${field}`)}
                    </dt>
                    <dd
                      className={cn(
                        "text-sm font-thai mt-0.5 sm:mt-0",
                        value ? "text-foreground" : "text-muted-foreground italic",
                      )}
                    >
                      {value ?? "—"}
                    </dd>
                  </div>
                );
              })}
            </dl>
          </CardContent>
        </Card>
      )}

      {/* ── Navigation buttons ──────────────────────────────────────── */}
      <div className="flex justify-between pb-safe-bottom">
        <Button
          type="button"
          variant="outline"
          disabled={isUploading}
          className="min-h-[44px]"
          onClick={() => router.push(`/${locale}/intake/${draftId}/customer`)}
        >
          {tCommon("back")}
        </Button>

        <Button
          type="button"
          disabled={uploadState.status !== "success" || isUploading}
          className="min-h-[44px] px-8"
          onClick={() => {
            // Continue to Map&Verify (03-06)
            router.push(`/${locale}/intake/${draftId}/verify`);
          }}
        >
          {tCommon("continue")}
        </Button>
      </div>
    </div>
  );
}
