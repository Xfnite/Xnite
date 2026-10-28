import { redirect } from "next/navigation";

// Redirect root to the onboarding dashboard
export default function RootPage() {
  redirect("/dashboard");
}
