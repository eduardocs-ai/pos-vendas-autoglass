import { redirect } from "next/navigation";
import { getDashboardUser } from "../session-auth";
import Dashboard from "./Dashboard";

export const dynamic = "force-dynamic";

export default async function PainelPage() {
  const user = await getDashboardUser();
  if (!user) redirect("/");
  return <Dashboard userName={user.displayName} userRole={user.role} />;
}
