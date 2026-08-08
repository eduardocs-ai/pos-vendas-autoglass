import { authenticateDashboardUser, createSessionToken, expiredSessionCookie, sessionCookie } from "../../session-auth";

export async function POST(request: Request) {
  try {
    const body = await request.json() as { username?: string; password?: string };
    const user = authenticateDashboardUser(body.username ?? "", body.password ?? "");
    if (!user) return Response.json({ error: "Usuário ou senha inválidos." }, { status: 401 });
    const response = Response.json({ user: { username: user.username, displayName: user.displayName, role: user.role } });
    response.headers.append("Set-Cookie", sessionCookie(await createSessionToken(user)));
    return response;
  } catch {
    return Response.json({ error: "Não foi possível realizar o acesso." }, { status: 400 });
  }
}

export async function DELETE() {
  const response = Response.json({ success: true });
  response.headers.append("Set-Cookie", expiredSessionCookie());
  return response;
}
