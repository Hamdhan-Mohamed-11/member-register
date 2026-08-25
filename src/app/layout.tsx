import type { Metadata, Viewport } from "next";
import { Calistoga, Poppins } from "next/font/google";
import "./globals.css";

// Poppins has no variable font on Google Fonts, so the weights we actually use
// are listed explicitly. Keep this list short — every weight is a separate file.
const poppins = Poppins({
  variable: "--font-poppins",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

// Display face for headings. A single weight, so it is one small file -- the
// warmth is worth that; a second variable font would not be.
const calistoga = Calistoga({
  variable: "--font-calistoga",
  subsets: ["latin"],
  weight: "400",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "Pick a Book",
    template: "%s · Pick a Book",
  },
  description: "Member portal for the Pick a Book reading club.",
};

export const viewport: Viewport = {
  themeColor: "#293896",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${poppins.variable} ${calistoga.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col bg-canvas text-ink">
        {children}
      </body>
    </html>
  );
}
