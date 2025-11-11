import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Providers } from "@/components/Providers";
import "./globals.css";

const geistSans = Geist({
    variable: "--font-geist-sans",
    subsets: ["latin"],
});

const geistMono = Geist_Mono({
    variable: "--font-geist-mono",
    subsets: ["latin"],
});

export const metadata: Metadata = {
    title: "EmberAi A2A Client",
    description: "Agent-to-Agent Communication Client by EmberAi",
    icons: {
        icon: "/Logo (1).svg",
    },
};

export default function RootLayout({
    children,
}: Readonly<{
    children: React.ReactNode;
}>) {
    return (
        <html lang="en" className="dark" style={{ colorScheme: 'dark' }}>
            <head>
                <script
                    dangerouslySetInnerHTML={{
                        __html: `
              // Force dark mode immediately
              document.documentElement.className = 'dark';
              document.documentElement.style.colorScheme = 'dark';
              // Override any theme detection
              if (window.matchMedia) {
                const mediaQuery = window.matchMedia('(prefers-color-scheme: light)');
                mediaQuery.addEventListener('change', () => {
                  document.documentElement.className = 'dark';
                  document.documentElement.style.colorScheme = 'dark';
                });
              }
            `,
                    }}
                />
            </head>
            <body
                className={`${geistSans.variable} ${geistMono.variable} antialiased dark`}
            >
                <Providers>
                    {children}
                </Providers>
            </body>
        </html>
    );
}

