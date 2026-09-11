import Link from "next/link";
import { AuthDialog } from "@/components/auth/AuthDialog";
import { LEGAL_PAGES } from "@/components/landing/content";
import { Container } from "@/components/landing/section";

const LINK_CLASS = "text-ink-soft transition-colors hover:text-ink";

export function LandingFooter() {
  return (
    <footer className="border-t border-hairline">
      <Container className="flex flex-col items-center gap-3 py-5 text-xs text-ink-soft md:flex-row md:justify-between">
        <span>© 2026 MeuBov · Gestão de rebanho de corte</span>
        <nav className="flex flex-wrap justify-center gap-4">
          <a href="#planos" className={LINK_CLASS}>
            Planos
          </a>
          <a href="#perguntas" className={LINK_CLASS}>
            Perguntas
          </a>
          <AuthDialog initialMode="login">
            <button type="button" className={LINK_CLASS}>
              Entrar
            </button>
          </AuthDialog>
          {LEGAL_PAGES ? (
            <>
              <Link href="/termos" className={LINK_CLASS}>
                Termos
              </Link>
              <Link href="/privacidade" className={LINK_CLASS}>
                Privacidade
              </Link>
            </>
          ) : null}
        </nav>
      </Container>
    </footer>
  );
}
