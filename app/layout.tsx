import type { Metadata } from "next";
import Script from "next/script";
import "./globals.css";

export const metadata: Metadata = {
  title: "Maatram Student Lifecycle Platform",
  description: "From application to alumni — one record, one pipeline.",
  manifest: "/manifest.webmanifest",
  icons: { icon: "/icon.svg", apple: "/icon.svg" },
};

export const viewport = {
  themeColor: "#1f2937",
};

// Registered through next/script so React does not render raw script tags
// as components. Check readyState in case the load event already fired.
const swRegisterScript = `
if ("serviceWorker" in navigator) {
  var register = function () {
    navigator.serviceWorker.register("/sw.js").catch(function () {});
  };
  if (document.readyState === "complete") register();
  else window.addEventListener("load", register, { once: true });
}
`;

// Runs before paint to read the saved theme preference and stamp it on
// <html>, so there's no light-mode flash for users who've chosen dark.
const themeInitScript = `
(function () {
  try {
    var stored = localStorage.getItem("theme");
    var theme = stored === "light" || stored === "dark"
      ? stored
      : (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
    document.documentElement.setAttribute("data-theme", theme);
  } catch (e) {}
})();
`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className="h-full antialiased"
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col bg-bg text-ink">
        {children}
        <Script
          id="theme-init"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{ __html: themeInitScript }}
        />
        <Script
          id="service-worker-register"
          strategy="afterInteractive"
          dangerouslySetInnerHTML={{ __html: swRegisterScript }}
        />
      </body>
    </html>
  );
}
