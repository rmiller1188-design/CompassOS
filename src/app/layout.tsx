import type { Metadata, Viewport } from "next";
import "./globals.css";
import "./detail-views.css";
import "./actions.css";
import "./appearance.css";
import "./interactions.css";
import "./usability.css";
import "./personalization.css";
import "./finish.css";

export const metadata: Metadata = {
  title: "CompassOS",
  description: "A private, personal operating system for communications, projects, files, schedules, and decisions.",
  applicationName: "CompassOS"
};

export const viewport: Viewport = {
  themeColor: "#6e5cff",
  colorScheme: "light dark"
};

const appearanceScript = `
(function(){
  try {
    var defaults={mode:'system',accent:'violet',density:'comfortable',radius:'round',surface:'glass',motion:'full',scale:'normal',navMode:'expanded',chrome:'balanced',background:'calm'};
    var stored=localStorage.getItem('compass-appearance');
    var appearance=stored?Object.assign(defaults,JSON.parse(stored)):defaults;
    var dark=appearance.mode==='dark'||(appearance.mode==='system'&&window.matchMedia('(prefers-color-scheme: dark)').matches);
    document.documentElement.dataset.themeMode=appearance.mode;
    document.documentElement.dataset.theme=dark?'dark':'light';
    document.documentElement.dataset.accent=appearance.accent;
    document.documentElement.dataset.density=appearance.density;
    document.documentElement.dataset.radius=appearance.radius;
    document.documentElement.dataset.surface=appearance.surface;
    document.documentElement.dataset.motion=appearance.motion;
    document.documentElement.dataset.scale=appearance.scale;
    document.documentElement.dataset.navMode=appearance.navMode;
    document.documentElement.dataset.chrome=appearance.chrome;
    document.documentElement.dataset.background=appearance.background;
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
