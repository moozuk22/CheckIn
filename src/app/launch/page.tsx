import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { verifyAdminToken } from "@/lib/adminAuth";

export default async function LaunchPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get("admin_session")?.value;

  if (token) {
    const payload = await verifyAdminToken(token);
    if (payload) {
      redirect("/admin/members");
    }
  }

  redirect("/admin/login");
}
