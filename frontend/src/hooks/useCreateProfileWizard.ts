"use client";

import { useState, useCallback, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type {
  WizardState,
  WizardStep,
  CreateProfilePayload,
  SetupRepoPayload,
} from "@/types/dvc-profile";
import { apiClient } from "@/lib/api/client";
import { useDeleteDvcProfile } from "@/lib/hooks/useDatasetVersions";

const INITIAL_STATE: WizardState = {
  currentStep: "profile_info",
  profileId: null,
  connectUrl: null,
  repoOwner: "",
  repoName: "",
  isLoading: false,
  error: null,
};

export function useCreateProfileWizard(onClose?: () => void, onOpen?: () => void) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [state, setState] = useState<WizardState>(INITIAL_STATE);
  const deleteDvcProfile = useDeleteDvcProfile();

  // Xử lý OAuth callback:
  // Sau khi GitHub redirect về, URL có dạng:
  // /settings?oauth=success&profile_id=xxx
  // Hook detect params này và tự chuyển sang step select_repo
  useEffect(() => {
    const oauthStatus = searchParams.get("oauth");
    const profileId = searchParams.get("profile_id");

    if (oauthStatus === "success" && profileId) {
      if (onOpen) onOpen();
      setState((prev) => ({
        ...prev,
        currentStep: "select_repo",
        profileId,
        error: null,
      }));
    }

    if (oauthStatus === "error") {
      if (onOpen) onOpen();
      setState((prev) => ({
        ...prev,
        currentStep: "connect_github",
        error: "Kết nối GitHub thất bại. Vui lòng thử lại.",
      }));
    }
  }, [searchParams, onOpen]);

  // Step 1 → Step 2: Tạo profile, nhận connect_url
  const handleCreateProfile = useCallback(
    async (payload: CreateProfilePayload) => {
      setState((prev) => ({ ...prev, isLoading: true, error: null }));

      try {
        const res = await apiClient.post("/dvc/profiles/managed-git", payload);
        const data = res.data;

        setState((prev) => ({
          ...prev,
          profileId: data.profile_id,
          connectUrl: data.connect_url,
          currentStep: "connect_github",
          isLoading: false,
        }));
      } catch (err: any) {
        const detail = err.response?.data?.detail;
        const msg = typeof detail === "string" ? detail : detail?.message;
        setState((prev) => ({
          ...prev,
          isLoading: false,
          error: msg || (err instanceof Error ? err.message : "Lỗi không xác định"),
        }));
      }
    },
    []
  );

  // Step 2: Mở GitHub OAuth
  // Redirect toàn trang thay vì popup để tránh bị block bởi browser
  const handleConnectGitHub = useCallback(() => {
    if (!state.connectUrl) return;
    window.location.href = state.connectUrl;
  }, [state.connectUrl]);

  // Step 3 → Step 4: Setup repo, tạo SSH key ngầm
  const handleSetupRepo = useCallback(
    async (payload: SetupRepoPayload) => {
      if (!state.profileId) return;

      setState((prev) => ({ ...prev, isLoading: true, error: null }));

      try {
        await apiClient.post(`/dvc/profiles/${state.profileId}/setup-repo`, payload);

        setState((prev) => ({
          ...prev,
          repoOwner: payload.repo_owner,
          repoName: payload.repo_name,
          currentStep: "success",
          isLoading: false,
        }));
      } catch (err: any) {
        const detail = err.response?.data?.detail;
        const msg = typeof detail === "string" ? detail : detail?.message;
        setState((prev) => ({
          ...prev,
          isLoading: false,
          error: msg || (err instanceof Error ? err.message : "Lỗi không xác định"),
        }));
      }
    },
    [state.profileId]
  );

  const handleFinish = useCallback(() => {
    setState(INITIAL_STATE);
    // Remove query params
    window.history.replaceState(null, "", window.location.pathname);
    if (onClose) onClose();
  }, [onClose]);

  const handleBack = useCallback(() => {
    const backMap: Partial<Record<WizardStep, WizardStep>> = {
      connect_github: "profile_info",
      select_repo: "connect_github",
    };
    
    // Nếu từ step 2 quay lại step 1, nên xóa draft profile
    if (state.currentStep === "connect_github" && state.profileId) {
       deleteDvcProfile.mutate({ id: state.profileId, deleteFiles: false });
       setState((prev) => ({ ...prev, profileId: null, connectUrl: null }));
    }

    setState((prev) => ({
      ...prev,
      currentStep: backMap[prev.currentStep] ?? prev.currentStep,
      error: null,
    }));
  }, [state.currentStep, state.profileId, deleteDvcProfile]);

  const handleCancel = useCallback(() => {
    if (state.profileId && state.currentStep !== "success") {
       deleteDvcProfile.mutate({ id: state.profileId, deleteFiles: false });
    }
    setState(INITIAL_STATE);
    window.history.replaceState(null, "", window.location.pathname);
    if (onClose) onClose();
  }, [state.profileId, state.currentStep, deleteDvcProfile, onClose]);

  return {
    state,
    handleCreateProfile,
    handleConnectGitHub,
    handleSetupRepo,
    handleFinish,
    handleBack,
    handleCancel,
  };
}
