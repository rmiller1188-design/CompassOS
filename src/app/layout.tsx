import type { Metadata, Viewport } from "next";
import "./globals.css";
import "./detail-views.css";
import "./actions.css";
import "./appearance.css";
import "./interactions.css";
import "./usability.css";

export const metadata: Metadata = {
  title: "Compass AI — You + Us",
  description: "A private two-person communications operating system.",
  applicationName: "Compass AI"
};

export const viewport: Viewport = {
  themeColor: "#6e5cff",
  colorScheme: "light dark"
};

const appearanceScript = `
(function(){
  try {
    var mode=localStorage.getItem('compass-theme-mode')||'system';
    var accent=localStorage.getItem('compass-accent')||'violet';
    var dark=mode==='dark'||(mode==='system'&&window.matchMedia('(prefers-color-scheme: dark)').matches);
    document.documentElement.dataset.themeMode=mode;
    document.documentElement.dataset.theme=dark?'dark':'light';
    document.documentElement.dataset.accent=accent;
  } catch (_) {}
})();`;

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head><script dangerouslySetInnerHTML={{ __html: appearanceScript }}/></head>
      <body>{children}</body>
    </html>
  );
}
