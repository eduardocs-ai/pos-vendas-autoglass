"use client";

import { useRouter } from "next/navigation";

function initials(name: string) {
  return name.split(" ").map((part) => part[0]).join("").slice(0, 2);
}

export default function LogoutButton({ userName, roleLabel = "Agente" }: { userName: string; roleLabel?: string }) {
  const router = useRouter();

  async function logout() {
    await fetch("/api/login", { method: "DELETE" });
    router.replace("/");
    router.refresh();
  }

  return (
    <button className="user-chip user-chip-button" type="button" onClick={logout}>
      <span className="avatar small">{initials(userName)}</span>
      <span><strong>{userName}</strong><small>{roleLabel} · Sair</small></span>
    </button>
  );
}
