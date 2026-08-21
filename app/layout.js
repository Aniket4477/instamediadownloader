import './globals.css';

export const metadata = {
  title: 'Instagram Downloader',
  description: 'Download Instagram Reels, Videos and Images',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
