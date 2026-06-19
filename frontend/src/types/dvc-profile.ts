export type WizardStep =
  | "profile_info"
  | "connect_github"
  | "select_repo"
  | "success";

export interface WizardState {
  currentStep: WizardStep;
  profileId: string | null;
  connectUrl: string | null;        // URL redirect sang GitHub
  repoOwner: string;
  repoName: string;
  isLoading: boolean;
  error: string | null;
}

export interface CreateProfilePayload {
  name: string;
}

export interface SetupRepoPayload {
  repo_owner: string;
  repo_name: string;
}

export interface CreateProfileResponse {
  profile_id: string;
  status: string;
  connect_url: string;
}

export interface SetupRepoResponse {
  profile_id: string;
  status: string;
  repo: string;
  message: string;
}
