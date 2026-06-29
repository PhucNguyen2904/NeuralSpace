"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import {
  Bell,
  Brush,
  Database,
  Mail,
  MonitorCog,
  ShieldAlert,
  TerminalSquare,
  UserRound,
  GitBranch,
  Book,
  Settings,
  Trash2,
  GitCommit,
  GitPullRequest,
  AlertCircle,
  Tag,
  Plus
} from "lucide-react";
import { Suspense, useEffect, useRef, useState, type ComponentType, type ReactNode } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import Link from "next/link";
import { PageHeader } from "@/components/shared/PageHeader";
import { Avatar, Button, Card, Modal, Select } from "@/components/ui";
import { CreateProfileWizard } from "@/components/dvc-profiles/CreateProfileWizard";
import {
  useChangePassword,
  useSettings,
  useUpdateNotifications,
  useUpdateProfile,
  useUpdateWorkspaceDefaults,
  useUpdateGitSyncPrefs
} from "@/lib/hooks/useSettings";
import { useCreateDvcProfile, useDvcProfiles, useUpdateDvcProfile, useDeleteDvcProfile } from "@/lib/hooks/useDatasetVersions";
import { useStorageConnections, useConnectStorage, useDisconnectStorage, useConnectGoogleDrive, useSetDefaultStorage } from "@/lib/hooks/useStorageProviders";
import { useGitAccounts, useGitOAuthLogin, useDisconnectGitAccount, useGitRepositories, useTrackedRepositories, useUntrackedRepositories, useTrackRepository, useGitActivities } from "@/lib/hooks/useGitIntegration";
import { useAuthStore } from "@/lib/stores/authStore";
import { cn } from "@/lib/utils/cn";

type TabKey = "profile" | "storage" | "git" | "notifications" | "appearance" | "security";
type ThemePreference = "system" | "light" | "dark";
type DvcProfileScope = "global" | "team" | "user" | "workspace";
type DvcRepoMode = "managed_git" | "existing_path";

const tabs: Array<{ key: TabKey; label: string; icon: ComponentType<{ size?: string | number; className?: string }> }> = [
  { key: "profile", label: "Profile", icon: UserRound },
  { key: "storage", label: "Storage Providers", icon: Database },
  { key: "git", label: "Git Integration", icon: GitBranch },
  { key: "notifications", label: "Notifications", icon: Bell },
  { key: "appearance", label: "Appearance", icon: Brush },
  { key: "security", label: "Security", icon: ShieldAlert }
];

const profileSchema = z.object({
  fullName: z.string().min(2, "Name must be at least 2 characters")
});

const passwordSchema = z
  .object({
    currentPassword: z.string().min(6, "Current password must be at least 6 characters"),
    newPassword: z.string().min(8, "New password must be at least 8 characters"),
    confirmPassword: z.string().min(8, "Confirm password")
  })
  .refine((v) => v.newPassword === v.confirmPassword, { path: ["confirmPassword"], message: "Password confirmation does not match" });

const providerSchema = z.object({
  display_name: z.string().min(1, "Name is required"),
  provider: z.enum(["s3", "drive"]),
  endpoint: z.string().optional(),
  bucket: z.string().optional(),
  access_key_id: z.string().optional(),
  secret_access_key: z.string().optional(),
  client_id: z.string().optional(),
  client_secret: z.string().optional(),
}).refine(data => {
  if (data.provider === "s3") {
    return !!data.endpoint && !!data.bucket && !!data.access_key_id && !!data.secret_access_key;
  }
  return true;
}, { path: ["provider"], message: "Please fill in all required fields for the selected provider." });

function Field({ label, children, error }: { label: string; children: ReactNode; error?: string | any }) {
  return (
    <label className="space-y-1 text-sm text-text-secondary">
      <span className="block">{label}</span>
      {children}
      {error ? <p className="text-xs text-error-500">{error}</p> : null}
    </label>
  );
}

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState<TabKey>("profile");
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [deleteProfileModalOpen, setDeleteProfileModalOpen] = useState(false);
  const [profileToDelete, setProfileToDelete] = useState<{ id: string; name: string; repoMode: string; repoPathOrUrl: string } | null>(null);
  const [deleteFilesChecked, setDeleteFilesChecked] = useState(false);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [themePreference, setThemePreference] = useState<ThemePreference>("system");
  const [languagePreference, setLanguagePreference] = useState("en");
  const [isWizardOpen, setIsWizardOpen] = useState(false);
  const avatarInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (typeof window !== "undefined" && window.location.hash) {
      const hash = window.location.hash.replace("#", "");
      if (tabs.some((t) => t.key === hash)) {
        setActiveTab(hash as TabKey);
      }
    }
  }, []);

  const { data: settings } = useSettings();
  const { user, updateUser } = useAuthStore();
  const updateProfile = useUpdateProfile();
  const changePassword = useChangePassword();
  const updateDefaults = useUpdateWorkspaceDefaults();
  const updateNotifications = useUpdateNotifications();
  const { data: dvcProfiles = [], isLoading: isLoadingDvcProfiles } = useDvcProfiles();
  const updateDvcProfile = useUpdateDvcProfile();
  const deleteDvcProfile = useDeleteDvcProfile();

  const { data: storageProviders = [], isLoading: isLoadingStorageProviders } = useStorageConnections();
  const connectStorage = useConnectStorage();
  const disconnectStorage = useDisconnectStorage();
  const connectGoogleDrive = useConnectGoogleDrive();
  const setDefaultStorage = useSetDefaultStorage();
  const { data: gitAccounts = [], isLoading: isLoadingGitAccounts } = useGitAccounts();
  const gitOAuthLogin = useGitOAuthLogin();
  const disconnectGitAccount = useDisconnectGitAccount();
  const [providerModalOpen, setProviderModalOpen] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const providerForm = useForm<z.infer<typeof providerSchema>>({
    resolver: zodResolver(providerSchema),
    defaultValues: {
      display_name: "",
      provider: "s3",
      endpoint: "",
      bucket: "",
      access_key_id: "",
      secret_access_key: "",
      client_id: "",
      client_secret: "",
    }
  });

  const onSubmitProvider = async (values: any) => {
    try {
      if (values.provider === "drive") {
        // Trigger Google OAuth flow
        // The display_name is sent in the URL so it's retained during the OAuth redirect
        await connectGoogleDrive.mutateAsync(values.display_name);
        return; // Navigation handles the rest
      }

      const params: Record<string, string> = {};
      params.endpoint = values.endpoint;
      params.bucket = values.bucket;
      params.access_key_id = values.access_key_id;
      params.secret_access_key = values.secret_access_key;
      params.env_auth = "false";
      
      const remote_name = values.display_name.toLowerCase().replace(/[^a-z0-9]/g, "_");

      await connectStorage.mutateAsync({
        display_name: values.display_name,
        provider: values.provider,
        remote_name: remote_name,
        params: params,
      });
      setProviderModalOpen(false);
      providerForm.reset();
      setShowAdvanced(false);
      setToastMsg("Storage provider connected");
    } catch (err: any) {
      setToastMsg(err.message || "Failed to connect provider");
    }
  };

  const profileForm = useForm<z.infer<typeof profileSchema>>({
    resolver: zodResolver(profileSchema),
    defaultValues: { fullName: user?.name || settings?.profile?.fullName || "" }
  });

  const updateProfileWithFeedback = (values: { fullName: string }) => {
    updateProfile.mutate(
      { fullName: values.fullName },
      {
        onSuccess: () => {
          updateUser({ name: values.fullName });
          setToastMsg("Profile saved successfully");
        },
        onError: () => {
          setToastMsg("Failed to save profile. Please try again.");
        }
      }
    );
  };

  const passwordForm = useForm<z.infer<typeof passwordSchema>>({
    resolver: zodResolver(passwordSchema),
    defaultValues: { currentPassword: "", newPassword: "", confirmPassword: "" }
  });

  useEffect(() => {
    if (user?.name || settings?.profile?.fullName) {
      profileForm.reset({ fullName: user?.name || settings?.profile?.fullName || "" });
    }
  }, [user?.name, settings?.profile?.fullName, profileForm]);

  useEffect(() => {
    if (!toastMsg) return;
    const timeout = setTimeout(() => setToastMsg(null), 1800);
    return () => clearTimeout(timeout);
  }, [toastMsg]);

  useEffect(() => {
    const saved = window.localStorage.getItem("ui-theme") as ThemePreference | null;
    if (saved === "system" || saved === "light" || saved === "dark") {
      setThemePreference(saved);
      applyTheme(saved);
      return;
    }
    applyTheme("dark");
  }, []);

  const applyTheme = (value: ThemePreference) => {
    const root = document.documentElement;
    const systemDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    const useDark = value === "dark" || (value === "system" && systemDark);
    root.classList.toggle("light", !useDark);
    root.classList.toggle("theme-dark", useDark);
  };

  const updateTheme = (value: ThemePreference) => {
    setThemePreference(value);
    window.localStorage.setItem("ui-theme", value);
    applyTheme(value);
    setToastMsg("Appearance updated");
  };

  if (!settings) {
    return <div className="text-sm text-text-secondary">Loading settings...</div>;
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 pb-10">
      <PageHeader title="Settings" description="Manage preferences and account settings." />

      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[220px_minmax(0,1fr)]">
        <aside className="rounded-xl border border-border bg-bg-surface p-3">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => {
                setActiveTab(tab.key);
                window.history.replaceState(null, "", `#${tab.key}`);
              }}
              className={cn(
                "mb-1 flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm transition-colors",
                activeTab === tab.key
                  ? "bg-brand-50 text-brand-600 dark:bg-brand-500/10 dark:text-brand-400"
                  : "text-text-secondary hover:bg-bg-elevated hover:text-text-primary"
              )}
            >
              <tab.icon size={16} className={activeTab === tab.key ? "text-brand-600 dark:text-brand-400" : "text-text-tertiary"} />
              {tab.label}
            </button>
          ))}
        </aside>

        <section className="rounded-xl border border-border bg-bg-surface p-5">
          {activeTab === "profile" ? (
            <div className="space-y-8">
              <div className="space-y-1">
                <h3 className="text-base font-semibold text-text-primary">Personal Information</h3>
                <p className="text-sm text-text-secondary">Update your photo and personal details.</p>
              </div>

              <div className="flex items-center gap-6 pb-6 border-b border-border/50">
                <button
                  type="button"
                  className="rounded-full border border-border p-1 hover:border-brand-500 transition-colors"
                  onClick={() => avatarInputRef.current?.click()}
                >
                  <Avatar
                    name={user?.name || settings.profile.fullName}
                    src={settings.profile.avatarUrl}
                    className="h-20 w-20 text-xl"
                  />
                </button>
                <div className="space-y-2">
                  <div className="space-y-0.5">
                    <p className="text-sm font-medium text-text-primary">Profile Picture</p>
                    <p className="text-xs text-text-secondary">PNG, JPG or WEBP up to 5MB.</p>
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => avatarInputRef.current?.click()}>Upload new</Button>
                    {settings.profile.avatarUrl && (
                      <Button size="sm" variant="ghost" className="text-error-500 hover:text-error-600 hover:bg-error-50 dark:hover:bg-error-500/10">Remove</Button>
                    )}
                  </div>
                </div>
                <input
                  ref={avatarInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/jpg,image/webp"
                  className="hidden"
                  onChange={async (event) => {
                    const file = event.target.files?.[0];
                    event.target.value = "";
                    if (!file) return;

                    const isImage = file.type.startsWith("image/");
                    const maxSize = 5 * 1024 * 1024;
                    if (!isImage) {
                      setToastMsg("Please select an image file.");
                      return;
                    }
                    if (file.size > maxSize) {
                      setToastMsg("Image must be smaller than 5MB.");
                      return;
                    }

                    const dataUrl = await new Promise<string>((resolve, reject) => {
                      const reader = new FileReader();
                      reader.onload = () => resolve(String(reader.result ?? ""));
                      reader.onerror = () => reject(new Error("read failed"));
                      reader.readAsDataURL(file);
                    });

                    updateProfile.mutate({ avatarUrl: dataUrl });
                    setToastMsg("Avatar updated");
                  }}
                />
              </div>

              <form
                className="grid max-w-xl gap-6"
                onSubmit={profileForm.handleSubmit(updateProfileWithFeedback)}
              >
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Field label="Display name" error={profileForm.formState.errors.fullName?.message}>
                    <input {...profileForm.register("fullName")} className="h-10 w-full rounded-md border border-border bg-bg-surface px-3 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500" />
                  </Field>
                  <Field label="Job Title (Optional)">
                    <input placeholder="e.g. Data Scientist" className="h-10 w-full rounded-md border border-border bg-bg-surface px-3 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500" />
                  </Field>
                </div>

                <Field label="Email address">
                  <input value={user?.email || settings.profile.email} readOnly className="h-10 w-full rounded-md border border-border bg-bg-sunken px-3 text-sm text-text-tertiary cursor-not-allowed" />
                  <p className="text-xs text-text-tertiary mt-1">Your email cannot be changed as it is tied to your login provider.</p>
                </Field>

                <Field label="Bio">
                  <textarea rows={3} placeholder="Tell us a little about yourself..." className="w-full rounded-md border border-border bg-bg-surface px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500" />
                </Field>

                <div className="pt-2">
                  <Button size="sm" loading={updateProfile.isPending} type="submit">Save profile information</Button>
                </div>
              </form>
            </div>
          ) : null}


          {activeTab === "storage" ? (
            <div className="max-w-3xl space-y-8">
              <div className="flex flex-col gap-1">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h3 className="text-base font-semibold text-text-primary">Storage Providers (Cloud & On-Premise)</h3>
                    <p className="text-sm text-text-secondary">Configure storage providers such as MinIO, S3, or Google Drive for dataset uploads.</p>
                  </div>
                  <Button size="sm" onClick={() => setProviderModalOpen(true)}>Add Provider</Button>
                </div>
                <div className="grid gap-3">
                  {isLoadingStorageProviders ? (
                    <p className="text-sm text-text-secondary">Loading storage providers...</p>
                  ) : storageProviders.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-border bg-bg-surface p-8 text-center">
                      <Database className="mx-auto h-8 w-8 text-text-tertiary mb-3" />
                      <h4 className="text-sm font-medium text-text-primary mb-1">No Storage Providers</h4>
                      <p className="text-xs text-text-secondary max-w-sm mx-auto mb-4">You haven't configured any storage providers yet. Add MinIO, S3, or Google Drive to store datasets.</p>
                      <Button size="sm" variant="outline" onClick={() => setProviderModalOpen(true)}>Configure first provider</Button>
                    </div>
                  ) : (
                    storageProviders.map((provider) => (
                      <div key={provider.id} className="rounded-xl border border-border bg-bg-surface overflow-hidden shadow-sm hover:border-brand-500/30 transition-all group">
                        <div className="p-5 flex flex-wrap items-start justify-between gap-4">
                          <div className="space-y-3 flex-1 min-w-[250px]">
                            <div className="flex items-center gap-2">
                              <div className="h-8 w-8 rounded-lg bg-brand-500/10 flex items-center justify-center">
                                <Database className="h-4 w-4 text-brand-600" />
                              </div>
                              <div>
                                <h4 className="font-semibold text-text-primary text-sm flex items-center gap-2">
                                  {provider.display_name}
                                  {provider.is_default && (
                                    <span className="rounded-full bg-brand-500/10 text-brand-600 px-2 py-0.5 text-[10px] uppercase tracking-wider font-bold">
                                      Default
                                    </span>
                                  )}
                                </h4>
                                <div className="flex items-center gap-2 mt-0.5">
                                  <span className="text-xs text-text-tertiary">Provider:</span>
                                  <span className="rounded bg-bg-sunken border border-border px-1.5 py-0.5 text-[11px] font-semibold text-text-secondary uppercase tracking-wide">
                                    {provider.provider}
                                  </span>
                                </div>
                                <div className="mt-1 flex items-center gap-1.5">
                                  <span className={cn("h-2 w-2 rounded-full", provider.status === "connected" ? "bg-success-500" : "bg-error-500")} />
                                  <span className="text-xs font-medium text-text-secondary capitalize">{provider.status}</span>
                                </div>
                              </div>
                            </div>
                            
                            <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
                              <div className="flex flex-col gap-1">
                                <span className="text-text-tertiary">Remote Name</span>
                                <span className="text-text-secondary font-mono truncate">{provider.remote_name}</span>
                              </div>
                            </div>
                          </div>

                          <div className="flex flex-col items-end justify-between gap-4 h-full">
                            <div className="flex gap-2">
                            </div>
                            
                            <div className="flex gap-2">
                              {!provider.is_default && (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="h-8 text-xs"
                                  loading={setDefaultStorage.isPending && setDefaultStorage.variables === provider.id}
                                  onClick={() => setDefaultStorage.mutate(provider.id, {
                                    onSuccess: () => setToastMsg("Default storage updated")
                                  })}
                                >
                                  Set as Default
                                </Button>
                              )}
                              <Button
                                variant="danger"
                                size="sm"
                                className="h-8 text-xs"
                                loading={disconnectStorage.isPending && disconnectStorage.variables === provider.id}
                                onClick={() => {
                                  if (confirm("Are you sure you want to disconnect this provider?")) {
                                    disconnectStorage.mutate(provider.id, {
                                      onSuccess: () => setToastMsg("Provider disconnected")
                                    });
                                  }
                                }}
                              >
                                Disconnect
                              </Button>
                            </div>
                          </div>
                        </div>
                        <div className="bg-bg-sunken px-5 py-2.5 border-t border-border flex justify-between items-center">
                          <span className="text-[11px] text-text-tertiary flex items-center gap-1">
                            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                            {`Added ${new Date(provider.created_at).toLocaleDateString()}`}
                          </span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              <Modal
                open={providerModalOpen}
                onClose={() => setProviderModalOpen(false)}
                title="Add Storage Provider"
                size="md"
              >
                <form onSubmit={providerForm.handleSubmit(onSubmitProvider)} className="space-y-4" autoComplete="off">
                  <Field label="Display Name" error={providerForm.formState.errors.display_name?.message}>
                    <input {...providerForm.register("display_name")} className="h-10 w-full rounded-md border border-border bg-bg-surface px-3 text-sm focus:border-brand-500 focus:outline-none" placeholder="e.g. My Google Drive" />
                  </Field>
                  <Field label="Provider" error={providerForm.formState.errors.provider?.message}>
                    <select {...providerForm.register("provider")} className="h-10 w-full rounded-md border border-border bg-bg-surface px-3 text-sm focus:border-brand-500 focus:outline-none text-text-primary">
                      <option value="s3">Amazon S3 / MinIO / S3 Compatible</option>
                      <option value="drive">Google Drive</option>
                    </select>
                  </Field>
                  {providerForm.watch("provider") === "s3" ? (
                    <>
                      <Field label="Endpoint URL" error={providerForm.formState.errors.endpoint?.message}>
                        <input {...providerForm.register("endpoint")} className="h-10 w-full rounded-md border border-border bg-bg-surface px-3 text-sm focus:border-brand-500 focus:outline-none" placeholder="e.g. http://minio:9000 or s3.amazonaws.com" />
                      </Field>
                      <Field label="Bucket Name" error={providerForm.formState.errors.bucket?.message}>
                        <input {...providerForm.register("bucket")} className="h-10 w-full rounded-md border border-border bg-bg-surface px-3 text-sm focus:border-brand-500 focus:outline-none" placeholder="e.g. my-dataset-bucket" />
                      </Field>
                      <div className="grid grid-cols-2 gap-4">
                        <Field label="Access Key ID" error={providerForm.formState.errors.access_key_id?.message}>
                          <input {...providerForm.register("access_key_id")} autoComplete="new-password" className="h-10 w-full rounded-md border border-border bg-bg-surface px-3 text-sm focus:border-brand-500 focus:outline-none" />
                        </Field>
                        <Field label="Secret Access Key" error={providerForm.formState.errors.secret_access_key?.message}>
                          <input type="password" {...providerForm.register("secret_access_key")} autoComplete="new-password" className="h-10 w-full rounded-md border border-border bg-bg-surface px-3 text-sm focus:border-brand-500 focus:outline-none" />
                        </Field>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="flex flex-col items-center justify-center p-6 border border-border rounded-lg bg-bg-sunken my-2">
                        <div className="w-12 h-12 rounded-full bg-brand-50 flex items-center justify-center mb-3">
                          <Database className="w-6 h-6 text-brand-600" />
                        </div>
                        <h4 className="text-sm font-medium text-text-primary mb-1">Connect to Google Drive</h4>
                        <p className="text-xs text-text-secondary text-center mb-4 max-w-xs">
                          You will be redirected to Google to authorize access to your Drive.
                        </p>
                        
                        {showAdvanced && (
                          <div className="w-full space-y-4 mb-4 pt-4 border-t border-border">
                            <p className="text-xs text-text-secondary">Custom OAuth Client (Enterprise)</p>
                            <div className="grid grid-cols-2 gap-4 text-left">
                              <Field label="Client ID" error={providerForm.formState.errors.client_id?.message}>
                                <input {...providerForm.register("client_id")} autoComplete="new-password" className="h-10 w-full rounded-md border border-border bg-bg-surface px-3 text-sm focus:border-brand-500 focus:outline-none" />
                              </Field>
                              <Field label="Client Secret" error={providerForm.formState.errors.client_secret?.message}>
                                <input type="password" {...providerForm.register("client_secret")} autoComplete="new-password" className="h-10 w-full rounded-md border border-border bg-bg-surface px-3 text-sm focus:border-brand-500 focus:outline-none" />
                              </Field>
                            </div>
                          </div>
                        )}
                        
                        <Button 
                          type="button" 
                          variant="outline" 
                          size="sm" 
                          className="text-xs text-text-tertiary mb-2"
                          onClick={() => setShowAdvanced(!showAdvanced)}
                        >
                          {showAdvanced ? "Hide Advanced Settings" : "Advanced Settings"}
                        </Button>
                      </div>
                    </>
                  )}
                  <div className="flex justify-end gap-2 pt-2">
                    <Button variant="ghost" type="button" onClick={() => setProviderModalOpen(false)}>Cancel</Button>
                    {providerForm.watch("provider") === "drive" ? (
                      <Button type="button" onClick={providerForm.handleSubmit(onSubmitProvider)} loading={connectGoogleDrive.isPending}>Connect Google Drive</Button>
                    ) : (
                      <Button type="submit" loading={connectStorage.isPending}>Save Provider</Button>
                    )}
                  </div>
                </form>
              </Modal>
            </div>
          ) : null}

          {activeTab === "git" ? (
            <div className="max-w-3xl space-y-8">
              <div className="space-y-1">
                <h3 className="text-base font-semibold text-text-primary">Git Integration</h3>
                <p className="text-sm text-text-secondary">Manage Git account connections and tracked repositories for MLOps.</p>
              </div>

              <div className="space-y-4">
                <div className="flex items-center justify-between gap-3">
                  <h4 className="text-sm font-semibold text-text-primary">Connected Git Accounts</h4>
                  <Button size="sm" onClick={() => gitOAuthLogin.mutate()} loading={gitOAuthLogin.isPending}>Connect GitHub</Button>
                </div>

                <div className="grid gap-3">
                  {isLoadingGitAccounts ? (
                    <p className="text-sm text-text-secondary">Loading accounts...</p>
                  ) : gitAccounts.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-border bg-bg-surface p-8 text-center">
                      <GitBranch className="mx-auto h-8 w-8 text-text-tertiary mb-3" />
                      <h4 className="text-sm font-medium text-text-primary mb-1">No Git Accounts Connected</h4>
                      <p className="text-xs text-text-secondary max-w-sm mx-auto mb-4">You need a connected Git account to track dataset and model versions using DVC.</p>
                    </div>
                  ) : (
                    gitAccounts.map((account) => (
                      <div key={account.id} className="rounded-lg border border-border bg-bg-elevated p-4 flex flex-wrap items-center justify-between gap-3 shadow-sm">
                        <div className="flex items-center gap-3">
                          <div className="flex items-center justify-center w-8 h-8 rounded-full bg-bg-surface border border-border">
                            <svg viewBox="0 0 16 16" className="w-4 h-4 fill-current"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" /></svg>
                          </div>
                          <div>
                            <p className="text-sm font-medium text-text-primary capitalize">{account.provider}</p>
                            <p className="text-xs text-text-secondary">@{account.username}</p>
                          </div>
                        </div>
                        <Button
                          variant="danger"
                          size="sm"
                          onClick={() => {
                            if (confirm("Disconnect this Git account? This will not delete the repositories.")) {
                              disconnectGitAccount.mutate(account.id, {
                                onSuccess: () => setToastMsg("Account disconnected")
                              });
                            }
                          }}
                        >
                          Disconnect
                        </Button>
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div className="flex flex-col gap-4">
                <TrackedRepositories />
                <SyncPreferences />
                <RecentActivity />
              </div>
            </div>
          ) : null}

          {activeTab === "notifications" ? (
            <div className="max-w-2xl space-y-8">
              <div className="space-y-1">
                <h3 className="text-base font-semibold text-text-primary">Notification Preferences</h3>
                <p className="text-sm text-text-secondary">Manage how and when the system sends notifications to you.</p>
              </div>

              <div className="space-y-6">
                <div>
                  <h4 className="text-sm font-medium text-text-primary mb-3">Email Notifications</h4>
                  <div className="space-y-3">
                    {[
                      { key: "weeklyUsage", label: "Weekly usage report", desc: "Send a summary report of the time and resources you used." },
                      { key: "platformUpdates", label: "Platform updates", desc: "Receive news about new features and system maintenance." }
                    ].map((item) => (
                      <label key={item.key} className="flex items-start justify-between rounded-lg border border-border p-4 hover:border-brand-500/50 transition-colors cursor-pointer bg-bg-surface">
                        <div className="flex items-start gap-3.5 pr-4">
                          <div className="p-2 rounded-md bg-brand-50 dark:bg-brand-500/10 text-brand-600 dark:text-brand-400">
                            <Mail size={16} />
                          </div>
                          <div>
                            <p className="text-sm font-medium text-text-primary">{item.label}</p>
                            <p className="text-xs text-text-secondary mt-0.5 leading-relaxed">{item.desc}</p>
                          </div>
                        </div>
                        <div className="pt-1.5">
                          <input type="checkbox" checked={settings.notifications[item.key as keyof typeof settings.notifications]} onChange={(e) => updateNotifications.mutate({ [item.key]: e.target.checked })} className="h-4 w-4 rounded border-border text-brand-600 focus:ring-brand-500" />
                        </div>
                      </label>
                    ))}
                  </div>
                </div>

                <div>
                  <h4 className="text-sm font-medium text-text-primary mb-3">In-App Alerts</h4>
                  <div className="space-y-3">
                    {[
                      { key: "workspaceReady", label: "Workspace ready", desc: "Receive notifications when a workspace has started and is ready to connect." },
                      { key: "idleWarning", label: "Idle warning", desc: "Warn 5 minutes before the system automatically closes an idle workspace." },
                      { key: "autoStopped", label: "Workspace auto-stop", desc: "Notify after your workspace is closed to save resources." }
                    ].map((item) => (
                      <label key={item.key} className="flex items-start justify-between rounded-lg border border-border p-4 hover:border-brand-500/50 transition-colors cursor-pointer bg-bg-surface">
                        <div className="flex items-start gap-3.5 pr-4">
                          <div className="p-2 rounded-md bg-brand-50 dark:bg-brand-500/10 text-brand-600 dark:text-brand-400">
                            <Bell size={16} />
                          </div>
                          <div>
                            <p className="text-sm font-medium text-text-primary">{item.label}</p>
                            <p className="text-xs text-text-secondary mt-0.5 leading-relaxed">{item.desc}</p>
                          </div>
                        </div>
                        <div className="pt-1.5">
                          <input type="checkbox" checked={settings.notifications[item.key as keyof typeof settings.notifications]} onChange={(e) => updateNotifications.mutate({ [item.key]: e.target.checked })} className="h-4 w-4 rounded border-border text-brand-600 focus:ring-brand-500" />
                        </div>
                      </label>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          ) : null}

          {activeTab === "appearance" ? (
            <div className="max-w-2xl space-y-8">
              <div className="space-y-1">
                <h3 className="text-base font-semibold text-text-primary">Appearance</h3>
                <p className="text-sm text-text-secondary">Customize the look and feel of the application.</p>
              </div>

              <div className="space-y-4">
                <p className="text-sm font-medium text-text-primary">Theme mode</p>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                  <button type="button" onClick={() => updateTheme("light")} className={cn("rounded-xl border p-5 text-left transition-all", themePreference === "light" ? "border-brand-500 bg-brand-50 dark:bg-brand-500/10 ring-1 ring-brand-500" : "border-border bg-bg-surface hover:bg-bg-elevated hover:border-brand-300")}>
                    <p className="text-sm font-semibold text-text-primary mb-1.5">Light</p>
                    <p className="text-xs text-text-secondary leading-relaxed">Light background, high contrast</p>
                  </button>
                  <button type="button" onClick={() => updateTheme("dark")} className={cn("rounded-xl border p-5 text-left transition-all", themePreference === "dark" ? "border-brand-500 bg-brand-50 dark:bg-brand-500/10 ring-1 ring-brand-500" : "border-border bg-bg-surface hover:bg-bg-elevated hover:border-brand-300")}>
                    <p className="text-sm font-semibold text-text-primary mb-1.5">Dark</p>
                    <p className="text-xs text-text-secondary leading-relaxed">Reduce glare when working at night</p>
                  </button>
                  <button type="button" onClick={() => updateTheme("system")} className={cn("rounded-xl border p-5 text-left transition-all", themePreference === "system" ? "border-brand-500 bg-brand-50 dark:bg-brand-500/10 ring-1 ring-brand-500" : "border-border bg-bg-surface hover:bg-bg-elevated hover:border-brand-300")}>
                    <p className="text-sm font-semibold text-text-primary mb-1.5">System</p>
                    <p className="text-xs text-text-secondary leading-relaxed">Automatically follow the OS theme</p>
                  </button>
                </div>
              </div>

              <div className="space-y-4 pt-6 border-t border-border/50">
                <div>
                  <p className="text-sm font-medium text-text-primary">Interface Language</p>
                  <p className="text-xs text-text-secondary mt-0.5">Change the language of the application interface.</p>
                </div>
                <select 
                  className="h-10 w-full sm:w-64 rounded-md border border-border bg-bg-surface px-3 text-sm focus:border-brand-500 focus:outline-none text-text-primary"
                  value={languagePreference}
                  onChange={(e) => {
                    setLanguagePreference(e.target.value);
                    setToastMsg("Language updated successfully");
                  }}
                >
                  <option value="en">English (US)</option>
                  <option value="vi">Vietnamese (Tiếng Việt)</option>
                </select>
              </div>
            </div>
          ) : null}

          {activeTab === "security" ? (
            <div className="max-w-2xl space-y-8">
              <div className="space-y-1">
                <h3 className="text-base font-semibold text-text-primary">Security Settings</h3>
                <p className="text-sm text-text-secondary">Manage your password and account security.</p>
              </div>

              <div className="rounded-xl border border-border p-5 bg-bg-surface space-y-5">
                <div>
                  <h4 className="text-sm font-medium text-text-primary">Two-Factor Authentication (2FA)</h4>
                  <p className="mt-0.5 text-xs text-text-secondary">Add an extra layer of security to your account.</p>
                </div>
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between p-4 border border-border rounded-lg bg-bg-sunken gap-4">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-error-500/10 text-error-500 rounded-full">
                      <ShieldAlert size={16} />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-text-primary">2FA is not enabled</p>
                      <p className="text-xs text-text-secondary">We highly recommend enabling 2FA.</p>
                    </div>
                  </div>
                  <Button variant="outline" size="sm" onClick={() => setToastMsg("2FA setup is coming soon")}>Enable 2FA</Button>
                </div>
              </div>

              <div className="rounded-xl border border-border p-5 bg-bg-surface space-y-5">
                <div>
                  <h3 className="text-sm font-medium text-text-primary">Change password</h3>
                  <p className="text-xs text-text-secondary mt-0.5">Ensure your account is using a long, random password to stay secure.</p>
                </div>
                <form
                  className="grid max-w-md gap-4"
                  onSubmit={passwordForm.handleSubmit(async (values) => {
                    await changePassword.mutateAsync({ currentPassword: values.currentPassword, newPassword: values.newPassword });
                    passwordForm.reset();
                    setToastMsg("Password changed successfully");
                  })}
                >
                  <Field label="Current password" error={passwordForm.formState.errors.currentPassword?.message}>
                    <input type="password" {...passwordForm.register("currentPassword")} className="h-10 w-full rounded-md border border-border bg-bg-sunken px-3 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500" />
                  </Field>
                  <Field label="New password" error={passwordForm.formState.errors.newPassword?.message}>
                    <input type="password" {...passwordForm.register("newPassword")} className="h-10 w-full rounded-md border border-border bg-bg-sunken px-3 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500" />
                  </Field>
                  <Field label="Confirm password" error={passwordForm.formState.errors.confirmPassword?.message}>
                    <input type="password" {...passwordForm.register("confirmPassword")} className="h-10 w-full rounded-md border border-border bg-bg-sunken px-3 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500" />
                  </Field>
                  <div className="pt-2">
                    <Button size="sm" loading={changePassword.isPending} type="submit">Update password</Button>
                  </div>
                </form>
              </div>

              <div className="pt-4 border-t border-border/50">
                <h3 className="text-base font-semibold text-error-500 mb-4 flex items-center gap-2">
                  <ShieldAlert size={18} /> Danger zone
                </h3>
                <Card className="border-error-500/30 bg-error-50/50 dark:bg-error-500/5 p-5">
                  <h4 className="font-medium text-text-primary">Delete account</h4>
                  <p className="mt-1 mb-4 text-sm text-text-secondary leading-relaxed">
                    Deleting your account will permanently remove all workspaces, experiments, dataset versions, and stored data related to this account. This cannot be undone.
                  </p>
                  <Button variant="danger" size="sm" onClick={() => setDeleteModalOpen(true)}>Delete account permanently</Button>
                </Card>
              </div>
            </div>
          ) : null}
        </section>
      </div>

      <Modal
        open={deleteModalOpen}
        onClose={() => setDeleteModalOpen(false)}
        size="sm"
        title={<span className="inline-flex items-center gap-2"><ShieldAlert size={18} className="text-error-500" /> Confirm account deletion</span>}
        footer={
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="ghost" onClick={() => setDeleteModalOpen(false)}>Cancel</Button>
            <Button size="sm" variant="danger">Delete permanently</Button>
          </div>
        }
      >
        <p className="text-sm text-text-secondary">This action cannot be undone. All of your data will be deleted immediately.</p>
      </Modal>

      <Modal
        open={deleteProfileModalOpen}
        onClose={() => setDeleteProfileModalOpen(false)}
        size="md"
        title={<span className="inline-flex items-center gap-2"><ShieldAlert size={18} className="text-error-500" /> Delete DVC Profile</span>}
        footer={
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="ghost" onClick={() => setDeleteProfileModalOpen(false)}>Cancel</Button>
            <Button size="sm" variant="danger" loading={deleteDvcProfile.isPending} onClick={async () => {
              if (!profileToDelete) return;
              try {
                await deleteDvcProfile.mutateAsync({ id: profileToDelete.id, deleteFiles: deleteFilesChecked });
                setDeleteProfileModalOpen(false);
                setToastMsg("DVC profile deleted successfully");
              } catch (err: any) {
                const detail = err.response?.data?.detail;
                if (err.response?.status === 409 && detail?.datasets_count !== undefined) {
                  setToastMsg(`Profile is used by ${detail.datasets_count} datasets and ${detail.versions_count} versions. Disable it instead.`);
                } else {
                  setToastMsg(detail?.message || detail || "Failed to delete profile");
                }
                setDeleteProfileModalOpen(false);
              }
            }}>Delete profile</Button>
          </div>
        }
      >
        <div className="space-y-4">
          <p className="text-sm text-text-secondary">Are you sure you want to delete this DVC profile? This action cannot be undone.</p>
          {profileToDelete && (
            <div className="rounded-lg border border-border bg-bg-sunken p-3 text-sm">
              <p><span className="font-medium text-text-primary">Name:</span> {profileToDelete.name}</p>
              <p><span className="font-medium text-text-primary">Type:</span> {profileToDelete.repoMode}</p>
              <p><span className="font-medium text-text-primary">Path/URL:</span> {profileToDelete.repoPathOrUrl}</p>
            </div>
          )}
          {profileToDelete?.repoMode === "managed_git" && (
            <label className="flex items-center gap-2 text-sm font-medium text-error-500 cursor-pointer">
              <input
                type="checkbox"
                checked={deleteFilesChecked}
                onChange={(e) => setDeleteFilesChecked(e.target.checked)}
                className="h-4 w-4 rounded border-border text-error-600 focus:ring-error-500"
              />
              Also delete cloned repository files from the server
            </label>
          )}
        </div>
      </Modal>

      {toastMsg ? (
        <div className="fixed bottom-6 right-6 z-50 inline-flex items-center gap-2 rounded-lg border border-border bg-bg-surface px-4 py-3 text-sm font-medium text-text-primary shadow-lg animate-in slide-in-from-bottom-4 fade-in">
          <Mail size={16} className="text-brand-600 dark:text-brand-400" />
          {toastMsg}
        </div>
      ) : null}

      <Suspense fallback={null}>
        <CreateProfileWizard
          open={isWizardOpen}
          onClose={() => setIsWizardOpen(false)}
          onOpen={() => {
            setActiveTab("storage");
            setIsWizardOpen(true);
          }}
        />
      </Suspense>
    </div>
  );
}

function TrackedRepositories() {
  const { data: repos, isLoading } = useTrackedRepositories();
  const { data: untrackedRepos } = useUntrackedRepositories();
  const trackRepo = useTrackRepository();
  const [selectedRepoId, setSelectedRepoId] = useState("");

  const handleUntrack = (repoId: string) => {
    trackRepo.mutate({ repoId, payload: { is_tracked: false } });
  };

  const formatTime = (isoString: string | null) => {
    if (!isoString) return 'never';
    const date = new Date(isoString);
    const diff = (Date.now() - date.getTime()) / 1000;
    if (diff < 60) return 'just now';
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return `${Math.floor(diff / 86400)}d ago`;
  };

  const handleTrack = () => {
    if (!selectedRepoId) return;
    trackRepo.mutate(
      { repoId: selectedRepoId, payload: { is_tracked: true, tracked_branch: "main" } },
      { onSuccess: () => setSelectedRepoId("") }
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h4 className="text-[15px] font-semibold text-[#111827] dark:text-white">Tracked repositories (DVC)</h4>
          <p className="text-[12px] text-[#6B7280] dark:text-gray-400">Repositories tracked by NeuralSpace to be used as Data Version Control (DVC) storage and experiment metadata sync.</p>
        </div>
        <span className="shrink-0 whitespace-nowrap rounded-[12px] bg-[#DBEAFE] px-2 py-0.5 text-[11px] font-medium text-[#1E40AF]">{repos?.length || 0} repos</span>
      </div>

      <div className="border border-[#E5E7EB] dark:border-gray-800 rounded-[8px] bg-[#FFFFFF] dark:bg-gray-900 overflow-hidden">
        <div className="flex flex-col">
          {isLoading ? (
            <div className="p-4 text-sm text-text-secondary">Loading tracked repositories...</div>
          ) : !repos || repos.length === 0 ? (
            <div className="p-4 text-sm text-text-secondary">No tracked repositories found. Track a repository to use it as a Dataset Version Control (DVC) storage layer.</div>
          ) : (
            repos.map((repo) => (
              <div key={repo.id} className="flex flex-col sm:flex-row sm:items-center justify-between p-3 border-b border-[#F3F4F6] dark:border-gray-800 last:border-0 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors gap-3">
                <div className="flex items-center gap-3">
                  <Book className="w-5 h-5 text-gray-400" />
                  <div>
                    <p className="text-[14px] font-medium text-[#111827] dark:text-gray-200">{repo.repo_name}</p>
                    <p className="text-[12px] text-[#6B7280] dark:text-gray-500">{repo.tracked_branch} • sync {formatTime(repo.last_sync_time)}</p>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <span className={cn("px-2 py-0.5 rounded-[12px] text-[11px] font-medium",
                    repo.sync_status === "active" ? "bg-[#D1FAE5] text-[#065F46] dark:bg-[#065F46]/30 dark:text-[#D1FAE5]" :
                      repo.sync_status === "error" ? "bg-[#FEE2E2] text-[#991B1B] dark:bg-[#991B1B]/30 dark:text-[#FEE2E2]" :
                        "bg-[#FEF3C7] text-[#92400E] dark:bg-[#92400E]/30 dark:text-[#FEF3C7]"
                  )}>
                    {repo.sync_status ? repo.sync_status.charAt(0).toUpperCase() + repo.sync_status.slice(1) : "Pending"}
                  </span>
                  <div className="flex items-center gap-1">
                    <button className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded-md hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"><Settings className="w-4 h-4" /></button>
                    <button className="p-1.5 text-gray-400 hover:text-red-600 dark:hover:text-red-400 rounded-md hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors" onClick={() => handleUntrack(repo.id)}><Trash2 className="w-4 h-4" /></button>
                  </div>
                </div>
              </div>
            ))
          )}

          <div className="p-3 bg-gray-50 dark:bg-gray-800/20 flex flex-col sm:flex-row items-start sm:items-center gap-3">
            <select
              className="flex-1 h-9 rounded-md border border-[#E5E7EB] dark:border-gray-700 bg-white dark:bg-gray-900 px-3 text-[14px] text-[#111827] dark:text-white focus:outline-none focus:ring-1 focus:ring-[#6366F1] focus:border-[#6366F1] w-full"
              value={selectedRepoId}
              onChange={(e) => setSelectedRepoId(e.target.value)}
            >
              <option value="" disabled>Select a connected repository to track...</option>
              {untrackedRepos?.map((repo) => (
                <option key={repo.id} value={repo.id}>{repo.repo_name}</option>
              ))}
            </select>
            <button
              onClick={handleTrack}
              disabled={!selectedRepoId || trackRepo.isPending}
              className="h-9 px-4 rounded-[6px] bg-[#6366F1] text-white text-[14px] font-medium hover:bg-[#4F46E5] disabled:opacity-50 disabled:cursor-not-allowed transition-colors whitespace-nowrap flex items-center gap-2 w-full sm:w-auto justify-center"
            >
              <Plus className="w-4 h-4" /> Track repo
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function SyncPreferences() {
  const { data: settings } = useSettings();
  const updateGitSync = useUpdateGitSyncPrefs();
  const prefs = settings?.gitSync || { autoSync: true, commitCheckpoints: false, createPr: true, syncInterval: "15" };

  const handleUpdate = (key: keyof typeof prefs, value: any) => {
    updateGitSync.mutate({ ...prefs, [key]: value });
  };

  const Toggle = ({ checked, onChange }: { checked: boolean, onChange: () => void }) => (
    <button
      type="button"
      onClick={onChange}
      className={cn("w-[36px] h-[20px] rounded-[10px] relative transition-colors flex-shrink-0 focus:outline-none", checked ? "bg-[#6366F1]" : "bg-[#D1D5DB] dark:bg-gray-600")}
    >
      <span className={cn("w-[14px] h-[14px] bg-white rounded-full transition-all shadow-sm absolute top-[3px]", checked ? "left-[19px]" : "left-[3px]")} />
    </button>
  );

  return (
    <div className="space-y-4">
      <div>
        <h4 className="text-[15px] font-semibold text-[#111827] dark:text-white">Sync preferences</h4>
        <p className="text-[12px] text-[#6B7280] dark:text-gray-400">Configure automatic synchronization behavior between NeuralSpace and Git.</p>
      </div>

      <div className="border border-[#E5E7EB] dark:border-gray-800 rounded-[8px] bg-[#FFFFFF] dark:bg-gray-900 overflow-hidden">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between p-[14px] border-b border-[#F3F4F6] dark:border-gray-800 gap-4 hover:bg-gray-50/50 dark:hover:bg-gray-800/30 transition-colors">
          <div className="flex flex-col">
            <span className="text-[14px] font-medium text-[#111827] dark:text-gray-200">Auto-sync experiments</span>
            <span className="text-[12px] text-[#6B7280] dark:text-gray-500 mt-0.5">Automatically sync experiment metadata to Git after each run completes</span>
          </div>
          <Toggle checked={prefs.autoSync} onChange={() => handleUpdate("autoSync", !prefs.autoSync)} />
        </div>

        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between p-[14px] border-b border-[#F3F4F6] dark:border-gray-800 gap-4 hover:bg-gray-50/50 dark:hover:bg-gray-800/30 transition-colors">
          <div className="flex flex-col">
            <span className="text-[14px] font-medium text-[#111827] dark:text-gray-200">Commit model checkpoints</span>
            <span className="text-[12px] text-[#6B7280] dark:text-gray-500 mt-0.5">Push checkpoint files to repository when saving models. Only applies to repos &lt;1GB</span>
          </div>
          <Toggle checked={prefs.commitCheckpoints} onChange={() => handleUpdate("commitCheckpoints", !prefs.commitCheckpoints)} />
        </div>

        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between p-[14px] border-b border-[#F3F4F6] dark:border-gray-800 gap-4 hover:bg-gray-50/50 dark:hover:bg-gray-800/30 transition-colors">
          <div className="flex flex-col">
            <span className="text-[14px] font-medium text-[#111827] dark:text-gray-200">Create PR on pipeline completion</span>
            <span className="text-[12px] text-[#6B7280] dark:text-gray-500 mt-0.5">Automatically create a pull request when the training pipeline successfully completes</span>
          </div>
          <Toggle checked={prefs.createPr} onChange={() => handleUpdate("createPr", !prefs.createPr)} />
        </div>

        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between p-[14px] gap-4 hover:bg-gray-50/50 dark:hover:bg-gray-800/30 transition-colors">
          <div className="flex flex-col">
            <span className="text-[14px] font-medium text-[#111827] dark:text-gray-200">Sync interval</span>
            <span className="text-[12px] text-[#6B7280] dark:text-gray-500 mt-0.5">Frequency of checking for remote changes</span>
          </div>
          <select
            value={prefs.syncInterval}
            onChange={(e) => handleUpdate("syncInterval", e.target.value)}
            className="flex-shrink-0 h-9 rounded-md border border-[#E5E7EB] dark:border-gray-700 bg-white dark:bg-gray-900 px-3 text-[14px] text-[#111827] dark:text-white focus:outline-none focus:ring-1 focus:ring-[#6366F1] focus:border-[#6366F1] w-full sm:w-auto min-w-[150px]"
          >
            <option value="5">Every 5 min</option>
            <option value="15">Every 15 min</option>
            <option value="60">Every hour</option>
            <option value="manual">Manual only</option>
          </select>
        </div>
      </div>
    </div>
  );
}

function RecentActivity() {
  const { data: activities, isLoading } = useGitActivities();

  const formatTime = (isoString: string) => {
    const date = new Date(isoString);
    const diff = (Date.now() - date.getTime()) / 1000;
    if (diff < 60) return 'Vài giây trước';
    if (diff < 3600) return `${Math.floor(diff / 60)} phút trước`;
    if (diff < 86400) return `${Math.floor(diff / 3600)} giờ trước`;
    return `${Math.floor(diff / 86400)} ngày trước`;
  };

  const renderActivityIcon = (action: string) => {
    switch (action) {
      case 'git_connect':
        return (
          <div className="w-[28px] h-[28px] rounded-full bg-[#D1FAE5] dark:bg-[#065F46]/20 flex items-center justify-center flex-shrink-0 mt-0.5">
            <GitPullRequest className="w-4 h-4 text-[#065F46] dark:text-[#D1FAE5]" />
          </div>
        );
      case 'git_disconnect':
        return (
          <div className="w-[28px] h-[28px] rounded-full bg-[#FEE2E2] dark:bg-[#991B1B]/20 flex items-center justify-center flex-shrink-0 mt-0.5">
            <AlertCircle className="w-4 h-4 text-[#991B1B] dark:text-[#FEE2E2]" />
          </div>
        );
      case 'git_track_repo':
        return (
          <div className="w-[28px] h-[28px] rounded-full bg-[#DBEAFE] dark:bg-[#1E40AF]/20 flex items-center justify-center flex-shrink-0 mt-0.5">
            <GitCommit className="w-4 h-4 text-[#1E40AF] dark:text-[#DBEAFE]" />
          </div>
        );
      case 'git_untrack_repo':
        return (
          <div className="w-[28px] h-[28px] rounded-full bg-[#FEF3C7] dark:bg-[#92400E]/20 flex items-center justify-center flex-shrink-0 mt-0.5">
            <Trash2 className="w-4 h-4 text-[#92400E] dark:text-[#FEF3C7]" />
          </div>
        );
      default:
        return (
          <div className="w-[28px] h-[28px] rounded-full bg-[#F3F4F6] dark:bg-gray-800 flex items-center justify-center flex-shrink-0 mt-0.5">
            <Tag className="w-4 h-4 text-[#6B7280] dark:text-gray-400" />
          </div>
        );
    }
  };

  const renderActivityMessage = (activity: any) => {
    const meta = activity.metadata || {};
    switch (activity.action) {
      case 'git_connect':
        return <>Connected Git account <code className="font-mono bg-[#F3F4F6] dark:bg-gray-800 px-[5px] py-[2px] rounded-[3px] text-[13px] text-[#111827] dark:text-gray-300">{meta.provider} / {meta.username}</code></>;
      case 'git_disconnect':
        return <>Disconnected Git account <code className="font-mono bg-[#F3F4F6] dark:bg-gray-800 px-[5px] py-[2px] rounded-[3px] text-[13px] text-[#111827] dark:text-gray-300">{meta.provider} / {meta.username}</code></>;
      case 'git_track_repo':
        return <>Started tracking repository <code className="font-mono bg-[#F3F4F6] dark:bg-gray-800 px-[5px] py-[2px] rounded-[3px] text-[13px] text-[#111827] dark:text-gray-300">{meta.repo_name}</code> on branch <code className="font-mono bg-[#F3F4F6] dark:bg-gray-800 px-[5px] py-[2px] rounded-[3px] text-[13px] text-[#111827] dark:text-gray-300">{meta.branch}</code></>;
      case 'git_untrack_repo':
        return <>Stopped tracking repository <code className="font-mono bg-[#F3F4F6] dark:bg-gray-800 px-[5px] py-[2px] rounded-[3px] text-[13px] text-[#111827] dark:text-gray-300">{meta.repo_name}</code></>;
      default:
        return <>{activity.action}</>;
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h4 className="text-[15px] font-semibold text-[#111827] dark:text-white">Recent activity</h4>
        <button className="text-[13px] text-[#6366F1] hover:text-[#4F46E5] font-medium px-3 py-1.5 rounded-md hover:bg-[#EEF2FF] dark:hover:bg-[#6366F1]/10 transition-colors">
          View all
        </button>
      </div>

      <div className="border border-[#E5E7EB] dark:border-gray-800 rounded-[8px] bg-[#FFFFFF] dark:bg-gray-900 p-[20px] md:p-[24px]">
        <div className="space-y-6">
          {isLoading ? (
            <p className="text-sm text-text-secondary">Loading activities...</p>
          ) : !activities || activities.length === 0 ? (
            <p className="text-sm text-text-secondary">No recent activities.</p>
          ) : (
            activities.map(activity => (
              <div key={activity.id} className="flex gap-4">
                {renderActivityIcon(activity.action)}
                <div>
                  <p className="text-[14px] text-[#111827] dark:text-gray-200 leading-relaxed">
                    {renderActivityMessage(activity)}
                  </p>
                  <p className="text-[12px] text-[#9CA3AF] mt-1">{formatTime(activity.created_at)}</p>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

