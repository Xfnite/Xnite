import { redirect } from "next/navigation";
import { getSessionUser } from "@/app/actions/auth";
import React from "react";

export default async function RestrictLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser();
  
  if (!user || user.role?.toLowerCase() !== "admin") {
    redirect("/wallet");
  }

  return <>{children}</>;
}
