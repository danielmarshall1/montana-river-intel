import "./globals.css";

export const metadata = {
  title: "Montana River Intel",
  description: "River conditions and fishability",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
