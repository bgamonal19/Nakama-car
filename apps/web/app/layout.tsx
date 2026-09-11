import "./globals.css";
import { ThemeProvider } from "../components/ThemeProvider";
import { LanguageProvider } from "../components/LanguageProvider";

export const metadata = {
  title: "NAKAMA CAR ESTIMATE",
  description: "Piattaforma professionale per preventivi e gestione carrozzeria.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="it">
      <body><LanguageProvider><ThemeProvider>{children}</ThemeProvider></LanguageProvider></body>
    </html>
  );
}
