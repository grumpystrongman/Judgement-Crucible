import type { Metadata, Viewport } from "next";
import "./globals.css";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://judgement-crucible.web.app";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "The Judgment Crucible | Executive CISO Decision Simulation",
    template: "%s | The Judgment Crucible",
  },
  description: "A live, multiplayer executive judgment simulation that trains CISO leaders to make defensible decisions under pressure, uncertainty, and competing business priorities.",
  applicationName: "The Judgment Crucible",
  keywords: ["CISO training", "cybersecurity leadership", "tabletop exercise", "incident response", "executive simulation", "security leadership development"],
  authors: [{ name: "Cyber Ronin" }],
  creator: "Cyber Ronin",
  publisher: "Cyber Ronin",
  robots: { index: true, follow: true },
  icons: { icon: "/favicon.svg" },
  openGraph: {
    title: "The Judgment Crucible",
    description: "Private commitment. Public accountability. Consequences that remember what the room chose.",
    type: "website",
    url: "/",
    images: [{ url: "/judgment-crucible-social.svg", width: 1536, height: 1024, alt: "The Judgment Crucible executive cyber decision simulation" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "The Judgment Crucible",
    description: "Executive judgment training for the moments when certainty is unavailable.",
    images: ["/judgment-crucible-social.svg"],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#071017",
  colorScheme: "dark",
};

const structuredData = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "The Judgment Crucible",
  applicationCategory: "EducationalApplication",
  operatingSystem: "Web",
  description: "A facilitated multiplayer simulation for executive cybersecurity judgment under pressure.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        {children}
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }} />
      </body>
    </html>
  );
}
