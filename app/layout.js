import './globals.css';

export const metadata = {
  title: 'InstaDown — Instagram Media Downloader',
  description: 'Download Instagram Reels, Videos, Photos, Carousels and Stories effortlessly. 100% Free & Self-Hosted.',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      </head>
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
