"use client";

import Link from "next/link";
import { zodResolver } from "@hookform/resolvers/zod";
import { CheckCircle2, Eye, EyeOff } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Button, Input } from "@/components/ui";
import { useRedirectIfAuthed } from "@/lib/hooks/useAuth";
import { useAuthStore } from "@/lib/stores/authStore";

const schema = z.object({
  email: z.string().email("Email không hợp lệ"),
  password: z.string().min(8, "Mật khẩu cần ít nhất 8 ký tự"),
  rememberMe: z.boolean()
});

type FormValues = {
  email: string;
  password: string;
  rememberMe: boolean;
};

type Toast = { type: "error" | "success"; message: string } | null;

type LoginResponse = {
  access_token: string;
  token_type: string;
  expires_in: number;
  refresh_expires_in: number;
  user: {
    user_id: string;
    email: string;
    full_name?: string | null;
  };
};

export default function LoginPage() {
  useRedirectIfAuthed();

  const login = useAuthStore((state) => state.login);
  const [showPassword, setShowPassword] = useState(false);
  const [toast, setToast] = useState<Toast>(null);
  const [success, setSuccess] = useState(false);
  const [shake, setShake] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting }
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { email: "", password: "", rememberMe: true }
  });

  const onSubmit = async (values: FormValues) => {
    setToast(null);
    setShake(false);

    try {
      const response = await fetch("/api/v1/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values)
      });

      if (response.status === 401) {
        setToast({ type: "error", message: "Email hoặc mật khẩu không đúng" });
        setShake(true);
        setTimeout(() => setShake(false), 350);
        return;
      }

      if (response.status === 429) {
        setToast({ type: "error", message: "Thử lại sau 30 giây" });
        return;
      }

      if (!response.ok) {
        throw new Error("Request failed");
      }

      const data = (await response.json()) as LoginResponse;
      const user = {
        id: data.user.user_id,
        name: data.user.full_name?.trim() || data.user.email.split("@")[0],
        email: data.user.email
      };
      login(data.access_token, user);
      document.cookie = `auth_token=${encodeURIComponent(data.access_token)}; Path=/; Max-Age=${Math.max(0, data.expires_in)}; SameSite=Lax`;
      setSuccess(true);
      setTimeout(() => {
        window.location.assign("/dashboard");
      }, 300);
    } catch {
      setToast({ type: "error", message: "Email hoặc mật khẩu không đúng" });
      setShake(true);
      setTimeout(() => setShake(false), 350);
    }
  };

  return (
    <div>
      {toast ? (
        <div className={`mb-4 rounded-md border px-3 py-2 text-sm ${toast.type === "error" ? "border-error-500 bg-error-50 text-error-500" : "border-success-500 bg-success-50 text-success-500"}`}>
          {toast.message}
        </div>
      ) : null}

      <form className={`space-y-4 rounded-xl border border-border bg-bg-surface p-6 shadow-sm ${shake ? "auth-shake" : ""}`} onSubmit={handleSubmit(onSubmit)}>
        <h1 className="text-2xl font-semibold">Đăng nhập</h1>

        <Input label="Email" type="email" autoComplete="email" error={errors.email?.message} {...register("email")} />
        <Input
          label="Password"
          type={showPassword ? "text" : "password"}
          autoComplete="current-password"
          error={errors.password?.message}
          iconRight={
            <button type="button" className="text-xs text-text-secondary" onClick={() => setShowPassword((prev) => !prev)}>
              {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          }
          {...register("password")}
        />

        <div className="flex items-center justify-between text-sm">
          <label className="inline-flex items-center gap-2 text-text-secondary">
            <input type="checkbox" className="h-4 w-4 rounded border-border" {...register("rememberMe")} />
            Remember me
          </label>
          <Link href="/forgot-password" className="text-brand-600 hover:underline">Forgot password?</Link>
        </div>

        <Button type="submit" className="w-full" loading={isSubmitting}>
          {success ? <span className="auth-check inline-flex items-center gap-1"><CheckCircle2 size={16} /> Success</span> : "Sign in"}
        </Button>

        <div className="flex items-center gap-3 text-xs text-text-tertiary">
          <span className="h-px flex-1 bg-border" />
          hoặc tiếp tục với
          <span className="h-px flex-1 bg-border" />
        </div>

        <Button type="button" variant="ghost" className="w-full border border-border">
          <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden>
            <path fill="#EA4335" d="M12 10.2v3.9h5.4c-.2 1.3-1.5 3.9-5.4 3.9-3.3 0-6-2.7-6-6s2.7-6 6-6c1.9 0 3.1.8 3.8 1.5l2.6-2.5C16.7 3.3 14.6 2.4 12 2.4 6.7 2.4 2.4 6.7 2.4 12S6.7 21.6 12 21.6c6.9 0 9.6-4.8 9.6-7.3 0-.5-.1-.9-.1-1.3z"/>
          </svg>
          Continue with Google
        </Button>
      </form>

      <p className="mt-4 text-center text-sm text-text-secondary">
        Chưa có tài khoản? <Link href="/register" className="text-brand-600 hover:underline">Đăng ký ngay</Link>
      </p>
    </div>
  );
}
