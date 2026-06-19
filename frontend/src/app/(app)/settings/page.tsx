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
  UserRound
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
  useUpdateWorkspaceDefaults
} from "@/lib/hooks/useSettings";
import { useCreateDvcProfile, useDvcProfiles, useUpdateDvcProfile, useDeleteDvcProfile } from "@/lib/hooks/useDatasetVersions";
import { useAuthStore } from "@/lib/stores/authStore";
import { cn } from "@/lib/utils/cn";

type TabKey = "profile" | "storage" | "runtime" | "notifications" | "appearance" | "security";
type ThemePreference = "system" | "light" | "dark";
type DvcProfileScope = "global" | "team" | "user" | "workspace";
type DvcRepoMode = "managed_git" | "existing_path";

const tabs: Array<{ key: TabKey; label: string; icon: ComponentType<{ size?: string | number; className?: string }> }> = [
  { key: "profile", label: "Profile", icon: UserRound },

  { key: "storage", label: "Storage", icon: Database },
  { key: "runtime", label: "Runtime / Colab", icon: TerminalSquare },
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


function Field({ label, children, error }: { label: string; children: ReactNode; error?: string }) {
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
  const [isWizardOpen, setIsWizardOpen] = useState(false);
  const avatarInputRef = useRef<HTMLInputElement | null>(null);

  const { data: settings } = useSettings();
  const { user, updateUser } = useAuthStore();
  const updateProfile = useUpdateProfile();
  const changePassword = useChangePassword();
  const updateDefaults = useUpdateWorkspaceDefaults();
  const updateNotifications = useUpdateNotifications();
  const { data: dvcProfiles = [], isLoading: isLoadingDvcProfiles } = useDvcProfiles();
  const updateDvcProfile = useUpdateDvcProfile();
  const deleteDvcProfile = useDeleteDvcProfile();

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
              onClick={() => setActiveTab(tab.key)}
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
            <div className="space-y-6">
              <h3 className="text-base font-semibold text-text-primary">Profile</h3>
              
              <div className="flex items-center gap-4">
                <button
                  type="button"
                  className="rounded-full border border-border p-1 hover:border-brand-500 transition-colors"
                  onClick={() => avatarInputRef.current?.click()}
                >
                  <Avatar
                    name={user?.name || settings.profile.fullName}
                    src={settings.profile.avatarUrl}
                    className="h-16 w-16 text-lg"
                  />
                </button>
                <div className="space-y-1">
                  <p className="text-sm font-medium text-text-primary">Avatar</p>
                  <p className="text-xs text-text-secondary">Click the image to update it (max 5MB)</p>
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
                className="grid max-w-xl gap-4"
                onSubmit={profileForm.handleSubmit(updateProfileWithFeedback)}
              >
                <Field label="Display name" error={profileForm.formState.errors.fullName?.message}>
                  <input {...profileForm.register("fullName")} className="h-10 w-full rounded-md border border-border bg-bg-surface px-3 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500" />
                </Field>
                <Field label="Email">
                  <input value={user?.email || settings.profile.email} readOnly className="h-10 w-full rounded-md border border-border bg-bg-sunken px-3 text-sm text-text-tertiary cursor-not-allowed" />
                </Field>
                <div className="pt-2"><Button size="sm" loading={updateProfile.isPending} type="submit">Save information</Button></div>
              </form>
            </div>
          ) : null}


          {activeTab === "storage" ? (
            <div className="max-w-3xl space-y-6">
              <div className="flex flex-col gap-1">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="text-base font-semibold text-text-primary">DVC Storage Profiles</h3>
                  <span className="text-xs font-medium text-text-tertiary bg-bg-sunken px-2 py-0.5 rounded-full border border-border">{dvcProfiles.length} configured</span>
                </div>
                <p className="text-sm text-text-secondary max-w-2xl">
                  DVC Profiles cho phép bạn cấu hình nơi lưu trữ dữ liệu (Dataset, Model) từ các Workspace của NeuralSpace. 
                  Bạn có thể tạo profile kết nối với kho lưu trữ riêng, hoặc sử dụng profile mặc định của máy chủ.
                </p>
              </div>

              <div className="grid gap-3">
                {isLoadingDvcProfiles ? (
                  <p className="text-sm text-text-secondary">Loading DVC profiles...</p>
                ) : (
                  dvcProfiles.map((profile) => (
                    <div key={profile.id} className="rounded-lg border border-border bg-bg-elevated p-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="font-medium text-text-primary">
                              {profile.is_environment_default ? "NeuralSpace Server Default" : profile.name}
                            </p>
                            <span className={cn(
                              "rounded px-1.5 py-0.5 text-xs font-medium",
                              profile.status === "ready" ? "bg-emerald-500/10 text-emerald-600" : "bg-error-500/10 text-error-500"
                            )}>
                              {profile.status}
                            </span>
                            {profile.is_default && !profile.is_environment_default ? <span className="rounded bg-brand-500/10 px-1.5 py-0.5 text-xs font-medium text-brand-600">Default</span> : null}
                            {profile.is_environment_default ? <span className="rounded bg-brand-500/10 px-1.5 py-0.5 text-xs font-medium text-brand-600 border border-brand-500/20">System Provided</span> : null}
                          </div>
                          <p className="mt-1.5 text-xs text-text-secondary leading-relaxed">
                            {profile.is_environment_default 
                              ? "Profile lưu trữ mặc định do hệ thống cấp phát. Dữ liệu được quản lý tự động, không yêu cầu thiết lập thêm từ người dùng." 
                              : profile.repo_mode === "managed_git" 
                                ? `Kết nối qua GitHub Repository: ${profile.git_repo_url || "Managed Git repo"}` 
                                : `Đường dẫn máy chủ nội bộ: ${profile.repo_path}`}
                          </p>
                          {!profile.is_environment_default && (
                            <p className="mt-1 text-xs text-text-tertiary flex items-center gap-1.5">
                              <span>Scope: {profile.scope}{profile.scope_id ? `:${profile.scope_id}` : ""}</span>
                              <span>·</span>
                              <span>{profile.repo_mode === "managed_git" ? `Branch: ${profile.git_branch}` : "Local path"}</span>
                              <span>·</span>
                              <span>Remote: {profile.remote_name}</span>
                            </p>
                          )}
                        </div>
                        {profile.remote_url ? <p className="max-w-xs truncate text-xs text-text-tertiary">{profile.remote_url}</p> : null}
                        
                        <div className="flex shrink-0 items-center gap-2 w-full md:w-auto">
                          {!profile.is_environment_default && (
                            <>
                              {!profile.is_default && (
                                <Button 
                                  variant="ghost" 
                                  size="sm" 
                                  onClick={() => updateDvcProfile.mutate({ id: profile.id, payload: { is_default: true } })}
                                  loading={updateDvcProfile.isPending}
                                >
                                  Set default
                                </Button>
                              )}
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => updateDvcProfile.mutate({ id: profile.id, payload: { status: profile.status === "ready" ? "inactive" : "ready" } })}
                                loading={updateDvcProfile.isPending}
                              >
                                {profile.status === "ready" ? "Disable" : "Enable"}
                              </Button>
                              <Button
                                variant="danger"
                                size="sm"
                                onClick={() => {
                                  setProfileToDelete({
                                    id: profile.id,
                                    name: profile.name,
                                    repoMode: profile.repo_mode,
                                    repoPathOrUrl: profile.repo_mode === "managed_git" ? (profile.git_repo_url || "Managed Git") : profile.repo_path
                                  });
                                  setDeleteFilesChecked(false);
                                  setDeleteProfileModalOpen(true);
                                }}
                              >
                                Delete
                              </Button>
                            </>
                          )}
                        </div>
                      </div>
                      {profile.status_message ? <p className="mt-2 text-xs text-text-tertiary">{profile.status_message}</p> : null}
                    </div>
                  ))
                )}
              </div>

              <div className="relative overflow-hidden rounded-xl border border-brand-200 dark:border-brand-500/20 bg-gradient-to-br from-brand-50/80 to-bg-surface dark:from-brand-950/30 dark:to-bg-surface p-6 shadow-sm group transition-all hover:shadow-md hover:border-brand-300 dark:hover:border-brand-500/40">
                <div className="absolute top-0 right-0 p-8 opacity-5 dark:opacity-10 pointer-events-none transform group-hover:scale-110 transition-transform duration-700">
                  <svg viewBox="0 0 16 16" className="w-40 h-40 fill-current text-brand-600 dark:text-brand-400">
                    <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
                  </svg>
                </div>
                <div className="relative flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
                  <div className="flex-1">
                    <div className="inline-flex items-center gap-2 rounded-full bg-brand-100 dark:bg-brand-500/20 px-2.5 py-0.5 mb-3 border border-brand-200 dark:border-brand-500/30">
                      <span className="flex h-1.5 w-1.5 rounded-full bg-brand-500 animate-pulse" />
                      <span className="text-[10px] font-semibold tracking-wide text-brand-700 dark:text-brand-300 uppercase">Recommended</span>
                    </div>
                    <h4 className="text-lg font-semibold text-text-primary flex items-center gap-2">
                      GitHub Connect Wizard
                    </h4>
                    <p className="mt-1.5 text-sm text-text-secondary leading-relaxed max-w-md">
                      Tự động thiết lập Managed Git DVC Profile. Chúng tôi sẽ cấu hình OAuth và quản lý SSH Deploy Keys an toàn cho bạn chỉ với vài cú click.
                    </p>
                  </div>
                  <button 
                    onClick={() => setIsWizardOpen(true)}
                    className="shrink-0 flex items-center gap-2 px-5 py-2.5 rounded-lg bg-brand-600 hover:bg-brand-700 text-white font-medium shadow-sm shadow-brand-500/30 transition-all active:scale-95"
                  >
                    Open Wizard <span aria-hidden="true">→</span>
                  </button>
                </div>
              </div>
            </div>
          ) : null}

          {activeTab === "runtime" ? (
            <div className="max-w-2xl space-y-6">
              <h3 className="text-base font-semibold text-text-primary">Runtime & Colab</h3>
              
              <div className="space-y-4">
                <Card className="p-4 bg-bg-elevated border-border">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-md bg-brand-50 dark:bg-brand-500/10">
                      <TerminalSquare size={18} className="text-brand-600 dark:text-brand-400" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-text-primary">Colab Connection Token</p>
                      <p className="text-xs text-text-secondary">Token used to connect Google Colab with NeuralSpace</p>
                    </div>
                  </div>
                  <div className="mt-4 flex gap-2">
                    <input 
                      type="text" 
                      readOnly 
                      value="nsk_********************************" 
                      className="h-9 flex-1 rounded-md border border-border bg-bg-sunken px-3 text-sm font-mono text-text-tertiary focus:outline-none" 
                    />
                    <Button 
                      size="sm" 
                      variant="outline" 
                      onClick={() => setToastMsg("Token viewing is under development")}
                    >
                      Reveal
                    </Button>
                  </div>
                </Card>

                <Card className="p-4 border-border">
                  <h4 className="text-sm font-medium text-text-primary mb-1">Session Settings</h4>
                  <p className="text-xs text-text-secondary mb-4">Runtime settings are applied automatically to each session</p>
                  
                  <div className="space-y-3">
                    <div className="flex justify-between items-center py-2 border-b border-border/50">
                      <span className="text-sm text-text-secondary">Default session TTL</span>
                      <span className="text-sm font-medium">24 hours</span>
                    </div>
                    <div className="flex justify-between items-center py-2 border-b border-border/50">
                      <span className="text-sm text-text-secondary">Automatic dependency updates</span>
                      <span className="text-sm font-medium">Enabled</span>
                    </div>
                    <div className="flex justify-between items-center py-2">
                      <span className="text-sm text-text-secondary">Network Access</span>
                      <span className="text-sm font-medium">Restricted (Internal Only)</span>
                    </div>
                  </div>
                </Card>
              </div>
            </div>
          ) : null}

          {activeTab === "notifications" ? (
            <div className="max-w-xl space-y-4">
              <h3 className="text-base font-semibold text-text-primary">Notification options</h3>
              <p className="text-sm text-text-secondary mb-4">Manage how the system sends notifications to you</p>
              
              <div className="space-y-2">
                {[
                  { key: "workspaceReady", label: "Workspace ready", desc: "Receive notifications when a workspace has started and is ready to connect." },
                  { key: "idleWarning", label: "Idle warning", desc: "Warn 5 minutes before the system automatically closes an idle workspace." },
                  { key: "autoStopped", label: "Workspace auto-stop", desc: "Notify after your workspace is closed to save resources." },
                  { key: "weeklyUsage", label: "Weekly usage report", desc: "Send a summary report of the time and resources you used." },
                  { key: "platformUpdates", label: "Platform updates", desc: "Receive news about new features and system maintenance." }
                ].map((item) => (
                  <label key={item.key} className="flex items-start justify-between rounded-lg border border-border p-4 hover:bg-bg-elevated transition-colors cursor-pointer">
                    <div className="flex items-start gap-3 pr-4">
                      <Bell size={16} className="mt-0.5 text-text-secondary" />
                      <div>
                        <p className="text-sm font-medium text-text-primary">{item.label}</p>
                        <p className="text-xs text-text-secondary mt-0.5 leading-relaxed">{item.desc}</p>
                      </div>
                    </div>
                    <div className="pt-0.5">
                      <input
                        type="checkbox"
                        checked={settings.notifications[item.key as keyof typeof settings.notifications]}
                        onChange={(e) => updateNotifications.mutate({ [item.key]: e.target.checked })}
                        className="h-4 w-4 rounded border-border text-brand-600 focus:ring-brand-500"
                      />
                    </div>
                  </label>
                ))}
              </div>
            </div>
          ) : null}

          {activeTab === "appearance" ? (
            <div className="max-w-xl space-y-6">
              <h3 className="text-base font-semibold text-text-primary">Appearance</h3>
              
              <div className="space-y-3">
                <p className="text-sm font-medium text-text-primary">Theme mode</p>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <button
                    type="button"
                    onClick={() => updateTheme("light")}
                    className={cn(
                      "rounded-lg border p-4 text-left transition-all",
                      themePreference === "light"
                        ? "border-brand-500 bg-brand-50 dark:bg-brand-500/10 ring-1 ring-brand-500"
                        : "border-border hover:bg-bg-elevated"
                    )}
                  >
                    <p className="text-sm font-medium text-text-primary mb-1">Light</p>
                    <p className="text-xs text-text-secondary">Light background, high contrast</p>
                  </button>
                  <button
                    type="button"
                    onClick={() => updateTheme("dark")}
                    className={cn(
                      "rounded-lg border p-4 text-left transition-all",
                      themePreference === "dark"
                        ? "border-brand-500 bg-brand-50 dark:bg-brand-500/10 ring-1 ring-brand-500"
                        : "border-border hover:bg-bg-elevated"
                    )}
                  >
                    <p className="text-sm font-medium text-text-primary mb-1">Dark</p>
                    <p className="text-xs text-text-secondary">Reduce glare when working at night</p>
                  </button>
                  <button
                    type="button"
                    onClick={() => updateTheme("system")}
                    className={cn(
                      "rounded-lg border p-4 text-left transition-all",
                      themePreference === "system"
                        ? "border-brand-500 bg-brand-50 dark:bg-brand-500/10 ring-1 ring-brand-500"
                        : "border-border hover:bg-bg-elevated"
                    )}
                  >
                    <p className="text-sm font-medium text-text-primary mb-1">System</p>
                    <p className="text-xs text-text-secondary">Automatically follow the operating system</p>
                  </button>
                </div>
              </div>
            </div>
          ) : null}

          {activeTab === "security" ? (
            <div className="max-w-xl space-y-8">
              <div>
                <h3 className="text-base font-semibold text-text-primary mb-4">Change password</h3>
                <form
                  className="grid gap-4 rounded-xl border border-border p-5 bg-bg-elevated"
                  onSubmit={passwordForm.handleSubmit(async (values) => {
                    await changePassword.mutateAsync({ currentPassword: values.currentPassword, newPassword: values.newPassword });
                    passwordForm.reset();
                    setToastMsg("Password changed successfully");
                  })}
                >
                  <Field label="Current password" error={passwordForm.formState.errors.currentPassword?.message}>
                    <input type="password" {...passwordForm.register("currentPassword")} className="h-10 w-full rounded-md border border-border bg-bg-surface px-3 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500" />
                  </Field>
                  <Field label="New password" error={passwordForm.formState.errors.newPassword?.message}>
                    <input type="password" {...passwordForm.register("newPassword")} className="h-10 w-full rounded-md border border-border bg-bg-surface px-3 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500" />
                  </Field>
                  <Field label="Confirm password" error={passwordForm.formState.errors.confirmPassword?.message}>
                    <input type="password" {...passwordForm.register("confirmPassword")} className="h-10 w-full rounded-md border border-border bg-bg-surface px-3 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500" />
                  </Field>
                  <div className="pt-2">
                    <Button size="sm" loading={changePassword.isPending} type="submit">Update password</Button>
                  </div>
                </form>
              </div>

              <div>
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
