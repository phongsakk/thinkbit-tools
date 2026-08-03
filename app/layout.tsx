import type { Metadata } from "next"

import { Geist_Mono, Prompt } from "next/font/google"

import "./globals.css"
import { AppSidebar } from "@/components/app-sidebar"
import { THEME_INIT_SCRIPT, ThemeProvider } from "@/components/theme-provider"
import { cn } from "@/lib/utils"

const prompt = Prompt({
  subsets: ["latin", "thai"],
  weight: ["300", "400", "500", "600", "700"],
  variable: "--font-sans",
})

const fontMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
})

export const metadata: Metadata = {
  title: {
    default: "Oil Tax Utility Tools - หน้าหลัก",
    template: "Oil Tax Utility Tools - %s",
  },
  description:
    "เครื่องมือภายในสำหรับอ่านและตรวจสอบเอกสารการยื่นภาษีน้ำมันจากการผลิต",
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html
      lang="th"
      suppressHydrationWarning
      className={cn("antialiased", fontMono.variable, "font-sans", prompt.variable)}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="min-h-svh bg-background text-foreground">
        <ThemeProvider>
          <div className="flex h-svh overflow-hidden">
            <AppSidebar />
            <div className="min-h-0 min-w-0 flex-1 overflow-auto">{children}</div>
          </div>
        </ThemeProvider>
      </body>
    </html>
  )
}
