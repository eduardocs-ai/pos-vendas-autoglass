import { redirect } from "next/navigation";
import LoginForm from "./LoginForm";
import { getDashboardUser } from "./session-auth";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  if (await getDashboardUser()) redirect("/painel");
  return (
    <main className="login-page">
      <section className="login-brand" aria-label="Apresentação do painel">
        <div className="login-brand-inner">
          <img
            className="brand-logo"
            src="/autoglass-logo-oficial.png"
            alt="Autoglass"
            width={180}
            height={55}
          />
          <div className="brand-rule" />
          <p className="eyebrow light">Central de performance</p>
          <h1 aria-label="Pós-vendas">
            Pós-vend<span className="brand-a" aria-hidden="true"><img src="/autoglass-a-oficial.png" alt="" width={266} height={288} /></span>s
          </h1>
          <p className="login-lead">
            Indicadores claros para cuidar de cada atendimento e transformar
            feedback em excelência.
          </p>

          <div className="login-proof" aria-label="Recursos disponíveis">
            <span>Tempo médio</span>
            <span>Satisfação</span>
            <span>Volume</span>
          </div>
        </div>
        <div className="orb orb-one" />
        <div className="orb orb-two" />
      </section>

      <section className="login-panel">
        <div className="login-card">
          <p className="eyebrow">Acesso interno</p>
          <h2>Bem-vindo ao Pós-vendas</h2>
          <p className="muted">
            Entre com sua conta corporativa para acompanhar e atualizar os
            resultados mensais da equipe.
          </p>
          <LoginForm />
          <p className="secure-note">
            <span aria-hidden="true">●</span> Ambiente privado e protegido
          </p>
        </div>
        <p className="login-footer">Autoglass · Central de Pós-vendas</p>
      </section>
    </main>
  );
}
