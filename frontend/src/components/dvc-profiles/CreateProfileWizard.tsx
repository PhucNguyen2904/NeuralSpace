"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useCreateProfileWizard } from "@/hooks/useCreateProfileWizard";
import { WizardStepIndicator } from "./WizardStepIndicator";
import { Step1_ProfileInfo }   from "./steps/Step1_ProfileInfo";
import { Step2_ConnectGitHub } from "./steps/Step2_ConnectGitHub";
import { Step3_SelectRepo }    from "./steps/Step3_SelectRepo";
import { Step4_Success }       from "./steps/Step4_Success";
import { Modal } from "@/components/ui/Modal";

// Framer Motion variants: slide từ phải vào, slide ra trái
const variants = {
  enter: { opacity: 0, x: 24 },
  center: { opacity: 1, x: 0 },
  exit: { opacity: 0, x: -24 },
};

interface Props {
  open: boolean;
  onClose: () => void;
  onOpen?: () => void;
}

export function CreateProfileWizard({ open, onClose, onOpen }: Props) {
  const {
    state,
    handleCreateProfile,
    handleConnectGitHub,
    handleSetupRepo,
    handleFinish,
    handleBack,
    handleCancel,
  } = useCreateProfileWizard(onClose, onOpen);

  return (
    <Modal open={open} onClose={handleCancel} size="md">
      <div className="relative">
        {/* Close Button */}
        <button
          onClick={handleCancel}
          className="absolute top-4 right-4 z-10 w-8 h-8 flex items-center justify-center rounded-full bg-bg-elevated hover:bg-bg-sunken text-text-tertiary hover:text-text-primary transition-colors border border-border"
          aria-label="Close"
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M1 1L13 13M1 13L13 1L1 13Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>

        <div className="w-full max-w-md mx-auto pt-2">
          {/* Header */}
          <div className="mb-8">
            <p className="text-xs text-text-tertiary uppercase tracking-widest mb-2 font-medium">
              NeuralSpace
            </p>
            <h1 className="text-2xl font-semibold text-text-primary">
              New DVC Profile
            </h1>
          </div>

          {/* Step indicator */}
          <WizardStepIndicator currentStep={state.currentStep} />

          {/* Step content với animation */}
          <div className="relative overflow-hidden min-h-[300px]">
            <AnimatePresence mode="wait">
              <motion.div
                key={state.currentStep}
                variants={variants}
                initial="enter"
                animate="center"
                exit="exit"
                transition={{ duration: 0.2, ease: "easeInOut" }}
              >
                {state.currentStep === "profile_info" && (
                  <Step1_ProfileInfo
                    onSubmit={handleCreateProfile}
                    isLoading={state.isLoading}
                    error={state.error}
                  />
                )}

                {state.currentStep === "connect_github" && (
                  <Step2_ConnectGitHub
                    onConnect={handleConnectGitHub}
                    onBack={handleBack}
                    error={state.error}
                  />
                )}

                {state.currentStep === "select_repo" && (
                  <Step3_SelectRepo
                    onSubmit={handleSetupRepo}
                    onBack={handleBack}
                    isLoading={state.isLoading}
                    error={state.error}
                  />
                )}

                {state.currentStep === "success" && (
                  <Step4_Success
                    profileName={state.profileId ?? ""}
                    repoOwner={state.repoOwner}
                    repoName={state.repoName}
                    onFinish={handleFinish}
                  />
                )}
              </motion.div>
            </AnimatePresence>
          </div>
        </div>
      </div>
    </Modal>
  );
}
