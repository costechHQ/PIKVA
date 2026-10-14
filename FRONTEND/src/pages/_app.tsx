import "@/styles/globals.css";
import type { AppProps } from "next/app";
import { Inter } from "next/font/google";

// Self-hosted by Next.js at build time: no request to Google from the browser.
const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });

export default function App({ Component, pageProps }: AppProps) {
  return (
    <div className={`${inter.variable} font-sans`}>
      <Component {...pageProps} />
    </div>
  );
}
