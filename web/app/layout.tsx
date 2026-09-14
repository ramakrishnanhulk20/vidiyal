import type { Metadata, Viewport } from "next";
import { Fraunces, IBM_Plex_Mono, IBM_Plex_Sans } from "next/font/google";
import { Footer } from "@/components/footer";
import { Grain } from "@/components/grain";
import { Nav } from "@/components/nav";
import { SmoothScroll } from "@/components/smooth-scroll";
import "./globals.css";

const fraunces = Fraunces({
  subsets: ["latin"],
  style: ["normal", "italic"],
  axes: ["opsz"],
  variable: "--font-fraunces",
  display: "swap",
});

const plexSans = IBM_Plex_Sans({
  subsets: ["latin"],
  weight: ["300", "400"],
  variable: "--font-plex-sans",
  display: "swap",
});

const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-plex-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Vidiyal",
  description:
    "Vidiyal reads a real record of trades and grades every one of them on process, not luck.",
};

export const viewport: Viewport = {
  themeColor: "#14100d",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${fraunces.variable} ${plexSans.variable} ${plexMono.variable}`}>
      <body className="room antialiased">
        <SmoothScroll />
        <Nav />
        {children}
        {/* Every page ends the same way, and on a narrow window the bottom padding clears the
            nav strip that sits along the foot of the screen. */}
        <div className="px-6 pb-28 md:px-[5vw] md:pb-20">
          <Footer />
        </div>
        <Grain />
      </body>
    </html>
  );
}
