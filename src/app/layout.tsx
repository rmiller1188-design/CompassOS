import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Compass AI — You + Us",
  description: "A private two-person communications operating system.",
  applicationName: "Compass AI"
};

export const viewport: Viewport = {
  themeColor: "#6e5cff",
  colorScheme: "light dark"
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
