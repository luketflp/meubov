import type { Metadata } from "next";
import { IBM_Plex_Mono, IBM_Plex_Sans, Zilla_Slab } from "next/font/google";
import { ToastProvider } from "@/components/providers/Toasts";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

const zillaSlab = Zilla_Slab({
  variable: "--font-zilla-slab",
  subsets: ["latin"],
  weight: ["500", "600", "700"],
});

const ibmPlexSans = IBM_Plex_Sans({
  variable: "--font-ibm-plex-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

const ibmPlexMono = IBM_Plex_Mono({
  variable: "--font-ibm-plex-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

export const metadata: Metadata = {
  title: "MeuBov · Gestão de Rebanho de Corte",
  description:
    "Gestão de rebanho bovino de corte: painel do rebanho, calendário sanitário, manejo de curral, lotes e financeiro da fazenda.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="pt-BR"
      className={`${zillaSlab.variable} ${ibmPlexSans.variable} ${ibmPlexMono.variable} h-full antialiased`}
    >
      <body className="min-h-full" suppressHydrationWarning>
        <ToastProvider>{children}</ToastProvider>
        <Toaster />
      </body>
    </html>
  );
}
