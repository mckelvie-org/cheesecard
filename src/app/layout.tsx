import type { Metadata } from "next";
import { Geist } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";
import { AuthProvider } from "@/lib/auth-context";

const geist = Geist({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Cheese Club",
  description: "Track your cheese of the month tastings",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        {/* Restore path after SPA redirect from 404.html */}
        <script dangerouslySetInnerHTML={{ __html: `
          (function(){
            var p = new URLSearchParams(window.location.search).get('p');
            if (p) window.history.replaceState(null, '', p);
          })();
        ` }} />
      </head>
      <body className={`${geist.className} bg-amber-50 min-h-screen`}>
        <AuthProvider>
          {children}
        </AuthProvider>
        <Toaster />
      </body>
    </html>
  );
}
