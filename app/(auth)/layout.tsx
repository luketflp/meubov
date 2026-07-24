/**
 * Layout for the authentication screens (the `(auth)` route group: /login and
 * /signup). Deliberately minimal — no AppShell, sidebar, or herd store. Just a
 * centered card area with the MeuBov wordmark on the app canvas background.
 */
export default function AuthLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-canvas px-4 py-10">
      <div className="mb-6 text-center">
        <p className="font-heading text-3xl font-semibold text-brand">MeuBov</p>
        <p className="mt-1 text-sm text-ink-soft">Gestão de rebanho de corte</p>
      </div>
      <div className="w-full max-w-sm">{children}</div>
    </div>
  );
}
