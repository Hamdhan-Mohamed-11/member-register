import type { Metadata, Viewport } from "next";
import { Poppins } from "next/font/google";
import "./globals.css";

// Poppins has no variable font on Google Fonts, so the weights we actually use
// are listed explicitly. Keep this list short — every weight is a separate file.
const poppins = Poppins({
  variable: "--font-poppins",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
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
    <html lang="en" className={`${poppins.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col bg-canvas text-ink">
        {children}
      </body>
    </html>
  );
}
