import { LogIn } from "lucide-react";
import { AuthDialog } from "@/components/auth/AuthDialog";
import { Button } from "@/components/ui/button";
import { Container } from "@/components/landing/section";

const ANCHORS = [
  { label: "Como funciona", href: "#como-funciona" },
  { label: "Planos", href: "#planos" },
  { label: "Perguntas", href: "#perguntas" },
] as const;

export function LandingHeader() {
  return (
    <Container className="flex items-center justify-between gap-4 py-4">
      <div>
        <p className="font-heading text-2xl font-semibold text-brand">MeuBov</p>
        <p className="hidden text-xs text-ink-soft sm:block">Gestão de rebanho de corte</p>
      </div>
      <div className="flex items-center gap-6">
        <nav className="hidden items-center gap-6 text-sm text-ink-soft md:flex">
          {ANCHORS.map((a) => (
            <a key={a.href} href={a.href} className="transition-colors hover:text-ink">
              {a.label}
            </a>
          ))}
        </nav>
        <div className="flex items-center gap-2">
          <AuthDialog initialMode="login">
            <Button variant="outline" className="min-h-11 md:min-h-9">
              <LogIn aria-hidden />
              Entrar
            </Button>
          </AuthDialog>
          <AuthDialog initialMode="signup">
            <Button className="hidden min-h-9 md:inline-flex">Criar conta grátis</Button>
          </AuthDialog>
        </div>
      </div>
    </Container>
  );
}
