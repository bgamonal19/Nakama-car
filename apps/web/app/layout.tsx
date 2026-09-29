import "./globals.css";
import { ThemeProvider } from "../components/ThemeProvider";
import { LanguageProvider } from "../components/LanguageProvider";

export const metadata = {
  title: "NAKAMA CAR ESTIMATE",
  description: "Piattaforma professionale per preventivi e gestione carrozzeria.",
  manifest: "/manifest.webmanifest",
  applicationName: "NAKAMA CAR",
  appleWebApp: { capable: true, title: "NAKAMA CAR", statusBarStyle: "default" as const },
  icons: { icon: "/brand/icon-192.png", apple: "/brand/apple-touch-icon.png" },
};

// Phones: real device width, content under notches handled with safe areas, brand colour in the status bar.
export const viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover" as const,
  themeColor: "#0b2a4a",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="it">
      <body><LanguageProvider><ThemeProvider>{children}</ThemeProvider></LanguageProvider></body>
    </html>
  );
}
