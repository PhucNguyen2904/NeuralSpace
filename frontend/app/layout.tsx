import type { Metadata, Viewport } from 'next'
import './globals.css'
import AppLayout from '@/components/layout/AppLayout'

export const metadata: Metadata = {
  title: 'NeuralForge',
  description: 'AI Model Management Platform — import, manage, and run models locally',
}

export const viewport: Viewport = {
  themeColor: '#0f1117',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="theme-color" content="#0f1117" />
      </head>
      <body>
        <AppLayout>{children}</AppLayout>
      </body>
    </html>
  )
}
