"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import {
  Bell,
  Brush,
  Mail,
  MonitorCog,
  ShieldAlert,
  TerminalSquare,
  UserRound
} from "lucide-react";
import { useEffect, useRef, useState, type ComponentType, type ReactNode } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { PageHeader } from "@/components/shared/PageHeader";
import { Avatar, Button, Card, Modal, Select } from "@/components/ui";
import {
  useChangePassword,
  useSettings,
  useUpdateNotifications,
  useUpdateProfile,
  useUpdateWorkspaceDefaults
} from "@/lib/hooks/useSettings";
import { useAuthStore } from "@/lib/stores/authStore";
import { cn } from "@/lib/utils/cn";

type TabKey = "profile" | "workspace" | "runtime" | "notifications" | "appearance" | "security";
type ThemePreference = "system" | "light" | "dark";

const tabs: Array<{ key: TabKey; label: string; icon: ComponentType<{ size?: string | number; className?: string }> }> = [
  { key: "profile", label: "Profile", icon: UserRound },
  { key: "workspace", label: "Workspace Preferences", icon: MonitorCog },
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
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [themePreference, setThemePreference] = useState<ThemePreference>("system");
  const avatarInputRef = useRef<HTMLInputElement | null>(null);

  const { data: settings } = useSettings();
  const { user, updateUser } = useAuthStore();
  const updateProfile = useUpdateProfile();
  const changePassword = useChangePassword();
  const updateDefaults = useUpdateWorkspaceDefaults();
  const updateNotifications = useUpdateNotifications();

  const profileForm = useForm<z.infer<typeof profileSchema>>({
    resolver: zodResolver(profileSchema),
    defaultValues: { fullName: user?.name || settings?.profile?.fullName || "" }
  });

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
                onSubmit={profileForm.handleSubmit((values) => {
                  updateProfile.mutate(values);
                  updateUser({ name: values.fullName });
                })}
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

          {activeTab === "workspace" ? (
            <div className="max-w-2xl space-y-6">
              <h3 className="text-base font-semibold text-text-primary">Workspace Defaults</h3>

              <div className="max-w-md">
                <Field label="Default Python version">
                  <Select value={settings.defaults.pythonVersion} onChange={(e) => updateDefaults.mutate({ pythonVersion: e.target.value as "3.10" | "3.11" | "3.12" })}>
                    <option value="3.10">Python 3.10</option>
                    <option value="3.11">Python 3.11</option>
                    <option value="3.12">Python 3.12</option>
                  </Select>
                </Field>
              </div>

              <div className="max-w-md space-y-2">
                <p className="text-sm text-text-primary font-medium">Auto close (idle timeout): <span className="text-text-secondary font-normal">{settings.defaults.idleTimeoutMinutes} minutes</span></p>
                <input
                  type="range"
                  min={15}
                  max={120}
                  step={15}
                  value={settings.defaults.idleTimeoutMinutes}
                  onChange={(e) => updateDefaults.mutate({ idleTimeoutMinutes: Number(e.target.value) as 15 | 30 | 60 | 120 })}
                  className="h-2 w-full accent-brand-500"
                />
                <div className="flex justify-between text-xs text-text-tertiary"><span>15</span><span>30</span><span>60</span><span>120</span></div>
              </div>

              <div className="max-w-md rounded-lg border border-border bg-bg-elevated p-4">
                <label className="flex items-center justify-between text-sm cursor-pointer">
                  <span className="font-medium text-text-primary">Auto-save</span>
                  <input
                    type="checkbox"
                    checked={settings.defaults.autoSaveEnabled}
                    onChange={(e) => updateDefaults.mutate({ autoSaveEnabled: e.target.checked })}
                    className="h-4 w-4 rounded border-border text-brand-600 focus:ring-brand-500"
                  />
                </label>
                <div className={cn("mt-3 flex items-center gap-2", !settings.defaults.autoSaveEnabled && "opacity-50 pointer-events-none")}>
                  <span className="text-sm text-text-secondary">Save every</span>
                  <input
                    type="number"
                    min={1}
                    max={60}
                    value={settings.defaults.autoSaveIntervalMinutes}
                    onChange={(e) => updateDefaults.mutate({ autoSaveIntervalMinutes: Number(e.target.value) })}
                    className="h-8 w-20 rounded-md border border-border bg-bg-surface px-2 text-sm focus:border-brand-500 focus:outline-none"
                    disabled={!settings.defaults.autoSaveEnabled}
                  />
                  <span className="text-sm text-text-secondary">minutes</span>
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

      {toastMsg ? (
        <div className="fixed bottom-6 right-6 z-50 inline-flex items-center gap-2 rounded-lg border border-border bg-bg-surface px-4 py-3 text-sm font-medium text-text-primary shadow-lg animate-in slide-in-from-bottom-4 fade-in">
          <Mail size={16} className="text-brand-600 dark:text-brand-400" />
          {toastMsg}
        </div>
      ) : null}
    </div>
  );
}
