/**
 * WizardSteps — compact progress indicator for the CMI intake wizard.
 *
 * Shows the six wizard steps as a horizontal progress bar on desktop and
 * as a compact "Step N of 6" indicator on mobile (<640px), per UI-SPEC
 * responsive rules.
 *
 * Step names are keyed via next-intl (no hardcoded strings).
 */

"use client";

import { useTranslations } from "next-intl";
import { cn } from "@/src/lib/utils";
import { CheckIcon } from "lucide-react";

export type WizardStepId =
  | "start"
  | "customer"
  | "document"
  | "verify"
  | "vehicle"
  | "review";

interface WizardStep {
  id: WizardStepId;
  labelKey: string;
  index: number;
}

const WIZARD_STEPS: WizardStep[] = [
  { id: "start", labelKey: "step.start", index: 1 },
  { id: "customer", labelKey: "step.customer", index: 2 },
  { id: "document", labelKey: "step.document", index: 3 },
  { id: "verify", labelKey: "step.verify", index: 4 },
  { id: "vehicle", labelKey: "step.vehicle", index: 5 },
  { id: "review", labelKey: "step.review", index: 6 },
];

interface WizardStepsProps {
  currentStep: WizardStepId;
  className?: string;
}

export function WizardSteps({ currentStep, className }: WizardStepsProps) {
  const t = useTranslations("intake");

  const currentIndex = WIZARD_STEPS.find((s) => s.id === currentStep)?.index ?? 1;

  return (
    <nav
      aria-label={t("wizard.progress")}
      data-testid="wizard-steps"
      className={cn("w-full", className)}
    >
      {/* Mobile: compact "Step N of 6" indicator */}
      <div className="flex sm:hidden items-center justify-between mb-4">
        <span className="text-sm font-medium text-foreground">
          {t("wizard.stepOf", { current: currentIndex, total: WIZARD_STEPS.length })}
        </span>
        <span className="text-sm text-muted-foreground">
          {t(WIZARD_STEPS[currentIndex - 1]?.labelKey ?? "step.start")}
        </span>
      </div>

      {/* Mobile progress bar */}
      <div className="flex sm:hidden h-1.5 w-full bg-muted rounded-full overflow-hidden mb-6">
        <div
          className="h-full bg-primary rounded-full transition-all duration-300"
          style={{ width: `${(currentIndex / WIZARD_STEPS.length) * 100}%` }}
          role="progressbar"
          aria-valuenow={currentIndex}
          aria-valuemin={1}
          aria-valuemax={WIZARD_STEPS.length}
        />
      </div>

      {/* Desktop: full step list */}
      <ol className="hidden sm:flex items-center w-full mb-8">
        {WIZARD_STEPS.map((step, idx) => {
          const isCompleted = step.index < currentIndex;
          const isActive = step.id === currentStep;
          const isUpcoming = step.index > currentIndex;

          return (
            <li
              key={step.id}
              className={cn(
                "flex items-center",
                idx < WIZARD_STEPS.length - 1 && "flex-1",
              )}
            >
              {/* Step circle + label */}
              <div className="flex flex-col items-center gap-1.5 min-w-0">
                <div
                  className={cn(
                    "flex h-8 w-8 items-center justify-center rounded-full border-2 text-xs font-semibold transition-all shrink-0",
                    isCompleted &&
                      "border-primary bg-primary text-primary-foreground",
                    isActive &&
                      "border-primary bg-background text-primary ring-2 ring-primary/20",
                    isUpcoming &&
                      "border-border bg-background text-muted-foreground",
                  )}
                  aria-current={isActive ? "step" : undefined}
                >
                  {isCompleted ? (
                    <CheckIcon className="h-4 w-4" aria-hidden="true" />
                  ) : (
                    <span>{step.index}</span>
                  )}
                </div>
                <span
                  className={cn(
                    "text-xs font-medium whitespace-nowrap",
                    isCompleted && "text-primary",
                    isActive && "text-primary font-semibold",
                    isUpcoming && "text-muted-foreground",
                  )}
                >
                  {t(step.labelKey)}
                </span>
              </div>

              {/* Connector line between steps */}
              {idx < WIZARD_STEPS.length - 1 && (
                <div
                  className={cn(
                    "flex-1 h-0.5 mx-2 rounded transition-all",
                    isCompleted ? "bg-primary" : "bg-border",
                  )}
                  aria-hidden="true"
                />
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
