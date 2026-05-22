export function Spinner({ size = "md" }: { size?: "sm" | "md" | "lg" }) {
  const sizeClass = size === "sm" ? "h-3.5 w-3.5" : size === "lg" ? "h-6 w-6" : "h-4 w-4";
  return <span className={`${sizeClass} inline-block animate-spin rounded-full border-2 border-current border-t-transparent`} />;
}
