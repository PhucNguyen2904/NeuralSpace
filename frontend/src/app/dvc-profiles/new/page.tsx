import { Suspense } from "react";
import { CreateProfileWizard } from "@/components/dvc-profiles/CreateProfileWizard";

export default function NewDVCProfilePage() {
  return (
    // Suspense bắt buộc vì useSearchParams() cần nó trong App Router
    <Suspense fallback={null}>
      <CreateProfileWizard />
    </Suspense>
  );
}
