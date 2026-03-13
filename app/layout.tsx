import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Stockr AI – Portfolio Intelligence",
  description: "AI-powered portfolio intelligence dashboard",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link
          href="https://fonts.googleapis.com/css2?family=Space+Mono:wght@400;700&family=DM+Sans:wght@300;400;500;600;700&family=DM+Mono:wght@400;500&display=swap"
          rel="stylesheet"
        />
        <script crossOrigin="anonymous" src="https://unpkg.com/react@18/umd/react.production.min.js"></script>
        <script crossOrigin="anonymous" src="https://unpkg.com/react-dom@18/umd/react-dom.production.min.js"></script>
        <script src="https://unpkg.com/@babel/standalone/babel.min.js"></script>
        <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
        <style>{`* { box-sizing: border-box; margin: 0; padding: 0; }
    body { background: #050810; font-family: 'DM Sans', sans-serif; }
    ::-webkit-scrollbar { width: 3px; }
    ::-webkit-scrollbar-thumb { background: #1a2540; border-radius: 2px; }
    @keyframes fadeIn  { from { opacity:0; transform:translateY(10px); } to { opacity:1; transform:translateY(0); } }
    @keyframes slideIn { from { opacity:0; transform:translateX(24px); } to { opacity:1; transform:translateX(0); } }
    @keyframes pulse   { 0%,100% { opacity:1; } 50% { opacity:0.4; } }
    @keyframes bounce  { 0%,100% { transform:translateY(0); opacity:0.3; } 50% { transform:translateY(-5px); opacity:1; } }
    @keyframes blink   { 0%,100% { opacity:1; } 50% { opacity:0; } }
    @keyframes spin    { to { transform: rotate(360deg); } }
    @keyframes glow    { 0%,100% { opacity:0.5; } 50% { opacity:1; } }
    @keyframes shimmer { 0% { background-position: -200% center; } 100% { background-position: 200% center; } }
    @keyframes gradientShift { 0% { background-position: 0% center; } 50% { background-position: 100% center; } 100% { background-position: 0% center; } }
    @keyframes tickerScroll { 0% { transform: translateX(0); } 100% { transform: translateX(-50%); } }
    input[type=number]::-webkit-inner-spin-button { -webkit-appearance: none; }
    @media (max-width: 768px) {
      aside { display: none !important; }
      main { margin-left: 0 !important; padding: 16px !important; max-width: 100vw !important; }
      nav .ticker-center { display: none !important; }
    }`}</style>
      </head>
      <body>{children}</body>
    </html>
  );
}
