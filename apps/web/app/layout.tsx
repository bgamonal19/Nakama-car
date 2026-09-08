import "./globals.css";

export const metadata = {
  title: "NAKAMA CAR ESTIMATE",
  description: "Piattaforma professionale per preventivi e gestione carrozzeria.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="it">
      <body>{children}</body>
    </html>
  );
}
