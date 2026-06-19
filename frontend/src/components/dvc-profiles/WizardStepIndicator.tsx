import type { WizardStep } from "@/types/dvc-profile";

// Thanh progress ngang với 4 bước
// Active step: accent color + filled circle
// Completed step: checkmark + muted accent
// Upcoming step: muted color + empty circle

interface Step {
  key: WizardStep;
  label: string;
}

const STEPS: Step[] = [
  { key: "profile_info",    label: "Profile Info" },
  { key: "connect_github",  label: "Connect GitHub" },
  { key: "select_repo",     label: "Select Repo" },
  { key: "success",         label: "Ready" },
];

const STEP_ORDER: WizardStep[] = [
  "profile_info",
  "connect_github",
  "select_repo",
  "success",
];

export function WizardStepIndicator({ currentStep }: { currentStep: WizardStep }) {
  const currentIndex = STEP_ORDER.indexOf(currentStep);

  return (
    <div className="flex items-center w-full mb-10">
      {STEPS.map((step, index) => {
        const isCompleted = index < currentIndex;
        const isActive    = index === currentIndex;
        const isUpcoming  = index > currentIndex;

        return (
          <div key={step.key} className="flex items-center flex-1 last:flex-none">
            {/* Circle */}
            <div className="flex flex-col items-center gap-1.5">
              <div className={`
                w-8 h-8 rounded-full flex items-center justify-center
                text-xs font-semibold border transition-all duration-300
                ${isCompleted ? "bg-brand-500/10 border-brand-500 text-brand-600 dark:text-brand-400" : ""}
                ${isActive    ? "bg-brand-600 border-brand-600 text-white shadow-sm shadow-brand-500/30" : ""}
                ${isUpcoming  ? "bg-transparent border-border text-text-tertiary" : ""}
              `}>
                {isCompleted ? "✓" : index + 1}
              </div>
              <span className={`
                text-[11px] whitespace-nowrap transition-colors duration-300
                ${isActive    ? "text-text-primary font-medium" : ""}
                ${isCompleted ? "text-brand-600/70 dark:text-brand-400/70" : ""}
                ${isUpcoming  ? "text-text-tertiary" : ""}
              `}>
                {step.label}
              </span>
            </div>

            {/* Connector line */}
            {index < STEPS.length - 1 && (
              <div className={`
                h-px flex-1 mx-3 mb-5 transition-all duration-500
                ${index < currentIndex ? "bg-brand-500/40" : "bg-border"}
              `} />
            )}
          </div>
        );
      })}
    </div>
  );
}
