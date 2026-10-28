import { redirect } from "next/navigation";
import { getSessionUser } from "@/app/actions/auth";

export const dynamic = "force-dynamic";

export default async function RecruiterPage() {
    const user = await getSessionUser();
    const role = user?.role?.toLowerCase() || "";
    if (role === "checker" || role === "judger") {
        redirect("/recruiter/group");
    }
    if (role === "recruiter") {
        redirect("/recruiter/recruits");
    }
    redirect("/recruiter/ranking");
}
