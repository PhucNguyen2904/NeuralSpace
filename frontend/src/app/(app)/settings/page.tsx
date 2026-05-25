"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import {
  Bell,
  Brush,
  CreditCard,
  Gauge,
  KeyRound,
  Mail,
  MonitorCog,
  ShieldAlert,
  UserRound
} from "lucide-react";
import { Bar, BarChart, ResponsiveContainer, XAxis, YAxis } from "recharts";
import { useEffect, useMemo, useRef, useState, type ComponentType, type ReactNode } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { PageHeader } from "@/components/shared/PageHeader";
import { Avatar, Button, Card, Modal, Select } from "@/components/ui";
import {
  useChangePassword,
  useCreateApiKey,
  useRevokeApiKey,
  useSettings,
  useUpdateNotifications,
  useUpdateProfile,
  useUpdateWorkspaceDefaults
} from "@/lib/hooks/useSettings";
import { cn } from "@/lib/utils/cn";

type TabKey = "account" | "appearance" | "defaults" | "notifications" | "api" | "quota";
type ThemePreference = "system" | "light" | "dark";

const tabs: Array<{ key: TabKey; label: string; icon: ComponentType<{ size?: string | number; className?: string }> }> = [
  { key: "account", label: "Tài khoản", icon: UserRound },
  { key: "appearance", label: "Giao diện", icon: Brush },
  { key: "defaults", label: "Workspace Defaults", icon: MonitorCog },
  { key: "notifications", label: "Thông báo", icon: Bell },
  { key: "api", label: "API Keys", icon: KeyRound },
  { key: "quota", label: "Quota & Billing", icon: Gauge }
];

const profileSchema = z.object({
  fullName: z.string().min(2, "Tên tối thiểu 2 ký tự")
});

const passwordSchema = z
  .object({
    currentPassword: z.string().min(6, "Mật khẩu hiện tại tối thiểu 6 ký tự"),
    newPassword: z.string().min(8, "Mật khẩu mới tối thiểu 8 ký tự"),
    confirmPassword: z.string().min(8, "Xác nhận mật khẩu")
  })
  .refine((v) => v.newPassword === v.confirmPassword, { path: ["confirmPassword"], message: "Mật khẩu xác nhận chưa khớp" });

const apiKeySchema = z.object({
  name: z.string().min(2, "Tên key tối thiểu 2 ký tự")
});

const tierOptions = [
  { value: "cpu-standard", title: "CPU Standard", desc: "2 vCPU · 4 GB RAM · No GPU" },
  { value: "cpu-large", title: "CPU Large", desc: "4 vCPU · 8 GB RAM · No GPU" },
  { value: "gpu-t4", title: "GPU T4", desc: "4 vCPU · 16 GB RAM · NVIDIA T4" }
] as const;

function Field({ label, children, error }: { label: string; children: ReactNode; error?: string }) {
  return (
    <label className="space-y-1 text-sm text-text-secondary">
      <span>{label}</span>
      {children}
      {error ? <p className="text-xs text-error-500">{error}</p> : null}
    </label>
  );
}

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState<TabKey>("account");
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [apiKeyModalOpen, setApiKeyModalOpen] = useState(false);
  const [revokeTarget, setRevokeTarget] = useState<string | null>(null);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [themePreference, setThemePreference] = useState<ThemePreference>("system");
  const avatarInputRef = useRef<HTMLInputElement | null>(null);

  const { data: settings } = useSettings();
  const updateProfile = useUpdateProfile();
  const changePassword = useChangePassword();
  const updateDefaults = useUpdateWorkspaceDefaults();
  const updateNotifications = useUpdateNotifications();
  const createApiKey = useCreateApiKey();
  const revokeApiKey = useRevokeApiKey();

  const profileForm = useForm<z.infer<typeof profileSchema>>({
    resolver: zodResolver(profileSchema),
    defaultValues: { fullName: settings?.profile.fullName ?? "" }
  });

  const passwordForm = useForm<z.infer<typeof passwordSchema>>({
    resolver: zodResolver(passwordSchema),
    defaultValues: { currentPassword: "", newPassword: "", confirmPassword: "" }
  });

  const apiKeyForm = useForm<z.infer<typeof apiKeySchema>>({
    resolver: zodResolver(apiKeySchema),
    defaultValues: { name: "" }
  });

  useEffect(() => {
    if (settings?.profile.fullName) {
      profileForm.reset({ fullName: settings.profile.fullName });
    }
  }, [settings?.profile.fullName]);

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
    applyTheme("system");
  }, []);

  const applyTheme = (value: ThemePreference) => {
    const root = document.documentElement;
    const systemDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    const useDark = value === "dark" || (value === "system" && systemDark);
    root.classList.toggle("theme-dark", useDark);
  };

  const updateTheme = (value: ThemePreference) => {
    setThemePreference(value);
    window.localStorage.setItem("ui-theme", value);
    applyTheme(value);
    setToastMsg("Đã cập nhật giao diện");
  };

  const planBars = useMemo(() => {
    if (!settings) return [];
    return [
      { label: "Workspaces", used: settings.billing.workspaceUsed, limit: settings.billing.workspaceLimit, suffix: "" },
      { label: "Storage", used: settings.billing.storageUsedGb, limit: settings.billing.storageLimitGb, suffix: " GB" },
      { label: "Compute", used: settings.billing.computeUsedHours, limit: settings.billing.computeLimitHours, suffix: " h" }
    ];
  }, [settings]);

  if (!settings) {
    return <div className="text-sm text-text-secondary">Loading settings...</div>;
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Settings" description="Quản lý preferences và tài khoản." />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[220px_minmax(0,1fr)]">
        <aside className="rounded-xl border border-border bg-bg-surface p-3">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={cn("mb-1 flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm", activeTab === tab.key ? "bg-brand-50 text-brand-600" : "text-text-secondary hover:bg-bg-elevated")}
            >
              <tab.icon size={16} className={activeTab === tab.key ? "text-brand-600" : "text-text-tertiary"} />
              {tab.label}
            </button>
          ))}
        </aside>

        <section className="rounded-xl border border-border bg-bg-surface p-4">
          {activeTab === "account" ? (
            <div className="space-y-6">
              <div className="flex items-center gap-4">
                <button
                  type="button"
                  className="rounded-full border border-border p-1 hover:border-brand-500"
                  onClick={() => avatarInputRef.current?.click()}
                >
                  <Avatar
                    name={settings.profile.fullName}
                    src={settings.profile.avatarUrl}
                    className="h-16 w-16 text-lg"
                  />
                </button>
                <p className="text-sm text-text-secondary">Click avatar để đổi ảnh đại diện</p>
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
                      setToastMsg("Vui lòng chọn file ảnh.");
                      return;
                    }
                    if (file.size > maxSize) {
                      setToastMsg("Ảnh phải nhỏ hơn 5MB.");
                      return;
                    }

                    const dataUrl = await new Promise<string>((resolve, reject) => {
                      const reader = new FileReader();
                      reader.onload = () => resolve(String(reader.result ?? ""));
                      reader.onerror = () => reject(new Error("read failed"));
                      reader.readAsDataURL(file);
                    });

                    updateProfile.mutate({ avatarUrl: dataUrl });
                    setToastMsg("Đã cập nhật ảnh đại diện");
                  }}
                />
              </div>

              <form
                className="grid max-w-xl gap-4"
                onSubmit={profileForm.handleSubmit((values) => updateProfile.mutate(values))}
              >
                <Field label="Full name" error={profileForm.formState.errors.fullName?.message}>
                  <input {...profileForm.register("fullName")} className="h-10 w-full rounded-md border border-border bg-bg-sunken px-3 text-sm" />
                </Field>
                <Field label="Email">
                  <input value={settings.profile.email} readOnly className="h-10 w-full rounded-md border border-border bg-bg-elevated px-3 text-sm text-text-tertiary" />
                </Field>
                <div><Button size="sm" loading={updateProfile.isPending} type="submit">Lưu thông tin</Button></div>
              </form>

              <form
                className="grid max-w-xl gap-4 rounded-lg border border-border bg-bg-elevated p-4"
                onSubmit={passwordForm.handleSubmit(async (values) => {
                  await changePassword.mutateAsync({ currentPassword: values.currentPassword, newPassword: values.newPassword });
                  passwordForm.reset();
                  setToastMsg("Đổi mật khẩu thành công");
                })}
              >
                <h3 className="font-semibold text-text-primary">Change password</h3>
                <Field label="Current password" error={passwordForm.formState.errors.currentPassword?.message}>
                  <input type="password" {...passwordForm.register("currentPassword")} className="h-10 w-full rounded-md border border-border bg-bg-surface px-3 text-sm" />
                </Field>
                <Field label="New password" error={passwordForm.formState.errors.newPassword?.message}>
                  <input type="password" {...passwordForm.register("newPassword")} className="h-10 w-full rounded-md border border-border bg-bg-surface px-3 text-sm" />
                </Field>
                <Field label="Confirm password" error={passwordForm.formState.errors.confirmPassword?.message}>
                  <input type="password" {...passwordForm.register("confirmPassword")} className="h-10 w-full rounded-md border border-border bg-bg-surface px-3 text-sm" />
                </Field>
                <div><Button size="sm" loading={changePassword.isPending} type="submit">Cập nhật mật khẩu</Button></div>
              </form>

              <Card className="border-error-500/40 bg-error-50 p-4">
                <h4 className="flex items-center gap-2 font-semibold text-error-500"><ShieldAlert size={16} /> Danger zone</h4>
                <p className="mt-1 text-sm text-text-secondary">Xóa tài khoản sẽ gỡ toàn bộ workspaces và dữ liệu lưu trữ.</p>
                <div className="mt-3"><Button variant="danger" size="sm" onClick={() => setDeleteModalOpen(true)}>Xóa tài khoản</Button></div>
              </Card>
            </div>
          ) : null}

          {activeTab === "appearance" ? (
            <div className="max-w-xl space-y-4">
              <h3 className="font-semibold">Giao diện</h3>
              <Field label="Theme mode">
                <Select
                  value={themePreference}
                  onChange={(e) => updateTheme(e.target.value as ThemePreference)}
                >
                  <option value="system">Theo hệ thống</option>
                  <option value="light">Sáng</option>
                  <option value="dark">Tối</option>
                </Select>
              </Field>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <button
                  type="button"
                  onClick={() => updateTheme("light")}
                  className={cn(
                    "rounded-lg border p-3 text-left",
                    themePreference === "light"
                      ? "border-brand-500 bg-brand-50"
                      : "border-border hover:bg-bg-elevated"
                  )}
                >
                  <p className="text-sm font-medium text-text-primary">Sáng</p>
                  <p className="text-xs text-text-secondary">Nền sáng, tương phản cao</p>
                </button>
                <button
                  type="button"
                  onClick={() => updateTheme("dark")}
                  className={cn(
                    "rounded-lg border p-3 text-left",
                    themePreference === "dark"
                      ? "border-brand-500 bg-brand-50"
                      : "border-border hover:bg-bg-elevated"
                  )}
                >
                  <p className="text-sm font-medium text-text-primary">Tối</p>
                  <p className="text-xs text-text-secondary">Giảm chói khi làm việc đêm</p>
                </button>
                <button
                  type="button"
                  onClick={() => updateTheme("system")}
                  className={cn(
                    "rounded-lg border p-3 text-left",
                    themePreference === "system"
                      ? "border-brand-500 bg-brand-50"
                      : "border-border hover:bg-bg-elevated"
                  )}
                >
                  <p className="text-sm font-medium text-text-primary">Hệ thống</p>
                  <p className="text-xs text-text-secondary">Tự động theo OS</p>
                </button>
              </div>
            </div>
          ) : null}

          {activeTab === "defaults" ? (
            <div className="max-w-3xl space-y-5">
              <h3 className="font-semibold">Workspace Defaults</h3>

              <div className="grid gap-3">
                {tierOptions.map((tier) => (
                  <button
                    key={tier.value}
                    type="button"
                    onClick={() => updateDefaults.mutate({ tier: tier.value })}
                    className={cn("rounded-lg border p-4 text-left", settings.defaults.tier === tier.value ? "border-2 border-brand-500 bg-brand-50" : "border-border")}
                  >
                    <p className="font-medium text-text-primary">{tier.title}</p>
                    <p className="text-sm text-text-secondary">{tier.desc}</p>
                  </button>
                ))}
              </div>

              <Field label="Default Python version">
                <Select value={settings.defaults.pythonVersion} onChange={(e) => updateDefaults.mutate({ pythonVersion: e.target.value as "3.10" | "3.11" | "3.12" })}>
                  <option value="3.10">Python 3.10</option>
                  <option value="3.11">Python 3.11</option>
                  <option value="3.12">Python 3.12</option>
                </Select>
              </Field>

              <div>
                <p className="mb-2 text-sm text-text-secondary">Default idle timeout: {settings.defaults.idleTimeoutMinutes} phút</p>
                <input
                  type="range"
                  min={15}
                  max={120}
                  step={15}
                  value={settings.defaults.idleTimeoutMinutes}
                  onChange={(e) => updateDefaults.mutate({ idleTimeoutMinutes: Number(e.target.value) as 15 | 30 | 60 | 120 })}
                  className="h-2 w-full accent-brand-500"
                />
                <div className="mt-1 flex justify-between text-xs text-text-tertiary"><span>15</span><span>30</span><span>60</span><span>120</span></div>
              </div>

              <div className="rounded-lg border border-border p-3">
                <label className="flex items-center justify-between text-sm">
                  <span className="text-text-primary">Auto-save interval</span>
                  <input
                    type="checkbox"
                    checked={settings.defaults.autoSaveEnabled}
                    onChange={(e) => updateDefaults.mutate({ autoSaveEnabled: e.target.checked })}
                    className="h-4 w-4"
                  />
                </label>
                <div className="mt-2 flex items-center gap-2">
                  <input
                    type="number"
                    min={1}
                    max={30}
                    value={settings.defaults.autoSaveIntervalMinutes}
                    onChange={(e) => updateDefaults.mutate({ autoSaveIntervalMinutes: Number(e.target.value) })}
                    className="h-9 w-24 rounded-md border border-border bg-bg-sunken px-2 text-sm"
                    disabled={!settings.defaults.autoSaveEnabled}
                  />
                  <span className="text-sm text-text-secondary">phút</span>
                </div>
              </div>
            </div>
          ) : null}

          {activeTab === "notifications" ? (
            <div className="max-w-xl space-y-3">
              {[
                { key: "workspaceReady", label: "Workspace sẵn sàng", desc: "Nhận thông báo khi workspace đã RUNNING" },
                { key: "idleWarning", label: "Idle warning (trước 5 phút)", desc: "Cảnh báo trước khi tự động đóng workspace" },
                { key: "autoStopped", label: "Workspace bị đóng tự động", desc: "Thông báo khi hệ thống đóng do idle timeout" },
                { key: "weeklyUsage", label: "Weekly usage report", desc: "Báo cáo tổng usage mỗi tuần" },
                { key: "platformUpdates", label: "Platform updates", desc: "Thông tin tính năng và maintenance mới" }
              ].map((item) => (
                <label key={item.key} className="flex items-start justify-between rounded-lg border border-border p-3">
                  <div className="flex items-start gap-2">
                    <Bell size={14} className="mt-0.5 text-text-tertiary" />
                    <div>
                      <p className="text-sm font-medium text-text-primary">{item.label}</p>
                      <p className="text-xs text-text-secondary">{item.desc}</p>
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={settings.notifications[item.key as keyof typeof settings.notifications]}
                    onChange={(e) => updateNotifications.mutate({ [item.key]: e.target.checked })}
                    className="mt-1 h-4 w-4"
                  />
                </label>
              ))}
            </div>
          ) : null}

          {activeTab === "api" ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="flex items-center gap-2 font-semibold"><KeyRound size={16} className="text-brand-600" /> API Keys</h3>
                <Button size="sm" onClick={() => setApiKeyModalOpen(true)}>Generate new key</Button>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-text-tertiary">
                      <th className="py-2">Name</th><th className="py-2">Key</th><th className="py-2">Created</th><th className="py-2">Last used</th><th className="py-2">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {settings.apiKeys.map((item) => (
                      <tr key={item.id} className="border-b border-border/70">
                        <td className="py-3">{item.name}</td>
                        <td className="py-3 font-mono text-xs">{item.maskedKey}</td>
                        <td className="py-3 text-text-secondary">{new Date(item.createdAt).toLocaleDateString()}</td>
                        <td className="py-3 text-text-secondary">{item.lastUsedAt ? new Date(item.lastUsedAt).toLocaleString() : "-"}</td>
                        <td className="py-3">
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={async () => {
                                await navigator.clipboard.writeText(item.rawKey || item.maskedKey);
                                setToastMsg("Đã copy");
                              }}
                            >
                              Copy
                            </Button>
                            <Button size="sm" variant="danger" onClick={() => setRevokeTarget(item.id)}>Revoke</Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}

          {activeTab === "quota" ? (
            <div className="space-y-4">
              <div className="rounded-xl bg-brand-gradient p-4 text-white">
                <p className="text-sm opacity-90">Current Plan</p>
                <p className="mt-1 flex items-center gap-2 text-xl font-semibold"><CreditCard size={18} /> {settings.billing.planName}</p>
              </div>

              {planBars.map((row) => {
                const pct = Math.min(100, Math.round((row.used / row.limit) * 100));
                return (
                  <div key={row.label}>
                    <div className="mb-1 flex justify-between text-sm"><span>{row.label}</span><span>{row.used}/{row.limit}{row.suffix}</span></div>
                    <div className="h-2 rounded bg-bg-elevated"><div className="h-2 rounded bg-brand-500" style={{ width: `${pct}%` }} /></div>
                  </div>
                );
              })}

              <Card className="p-4">
                <p className="mb-3 flex items-center gap-2 text-sm font-semibold text-text-primary"><Gauge size={15} className="text-brand-600" /> Usage history (7 ngày)</p>
                <div className="h-44">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={settings.billing.history7d}>
                      <XAxis dataKey="day" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} />
                      <Bar dataKey="hours" fill="#6366F1" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </Card>
            </div>
          ) : null}
        </section>
      </div>

      <Modal
        open={deleteModalOpen}
        onClose={() => setDeleteModalOpen(false)}
        size="sm"
        title={<span className="inline-flex items-center gap-2"><ShieldAlert size={16} className="text-error-500" /> Xóa tài khoản?</span>}
        footer={
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="ghost" onClick={() => setDeleteModalOpen(false)}>Hủy</Button>
            <Button size="sm" variant="danger">Xóa vĩnh viễn</Button>
          </div>
        }
      >
        <p className="text-sm text-text-secondary">Hành động này không thể hoàn tác.</p>
      </Modal>

      <Modal
        open={apiKeyModalOpen}
        onClose={() => setApiKeyModalOpen(false)}
        size="sm"
        title={<span className="inline-flex items-center gap-2"><KeyRound size={16} className="text-brand-600" /> Generate API key</span>}
        footer={
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="ghost" onClick={() => setApiKeyModalOpen(false)}>Hủy</Button>
            <Button
              size="sm"
              loading={createApiKey.isPending}
              onClick={apiKeyForm.handleSubmit(async (values) => {
                const key = await createApiKey.mutateAsync(values.name);
                apiKeyForm.reset();
                setApiKeyModalOpen(false);
                if (key.rawKey) {
                  await navigator.clipboard.writeText(key.rawKey);
                  setToastMsg("Đã copy");
                }
              })}
            >
              Tạo key
            </Button>
          </div>
        }
      >
        <Field label="Tên key" error={apiKeyForm.formState.errors.name?.message}>
          <input {...apiKeyForm.register("name")} className="h-10 w-full rounded-md border border-border bg-bg-sunken px-3 text-sm" />
        </Field>
      </Modal>

      <Modal
        open={Boolean(revokeTarget)}
        onClose={() => setRevokeTarget(null)}
        size="sm"
        title={<span className="inline-flex items-center gap-2"><KeyRound size={16} className="text-error-500" /> Revoke API key?</span>}
        footer={
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="ghost" onClick={() => setRevokeTarget(null)}>Hủy</Button>
            <Button
              size="sm"
              variant="danger"
              loading={revokeApiKey.isPending}
              onClick={async () => {
                if (!revokeTarget) return;
                await revokeApiKey.mutateAsync(revokeTarget);
                setRevokeTarget(null);
              }}
            >
              Revoke
            </Button>
          </div>
        }
      >
        <p className="text-sm text-text-secondary">Key sẽ mất hiệu lực ngay lập tức.</p>
      </Modal>

      {toastMsg ? (
        <div className="fixed bottom-4 right-4 z-50 inline-flex items-center gap-2 rounded-md border border-border bg-bg-surface px-3 py-2 text-sm text-text-primary shadow-md">
          <Mail size={14} className="text-brand-600" />
          {toastMsg}
        </div>
      ) : null}
    </div>
  );
}
