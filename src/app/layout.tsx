import type { Metadata, Viewport } from "next";
import { Playfair_Display, Poppins } from "next/font/google";
import "./globals.css";

// Poppins has no variable font on Google Fonts, so the weights we actually use
// are listed explicitly. Keep this list short — every weight is a separate file.
const poppins = Poppins({
  variable: "--font-poppins",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});


// Display face for headings only, italic included -- the reference uses an
// italic phrase as its single flourish. Variable, so the weight range costs
// one file.
const playfair = Playfair_Display({
  variable: "--font-playfair",
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  style: ["normal", "italic"],
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
  themeColor: "#16205c",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${poppins.variable} ${playfair.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col bg-canvas text-ink">
        {children}
      </body>
    </html>
  );
}
