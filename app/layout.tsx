import "./globals.css";
import React from "react";

export const metadata = { title: "GroupGPT" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body style={{ minHeight: '100vh', backgroundColor: 'var(--bg-primary)' }}>
        <div style={{ 
          maxWidth: '800px', 
          margin: '0 auto', 
          padding: '20px',
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column'
        }}>
          <header style={{ 
            padding: '20px 0', 
            borderBottom: '1px solid var(--border-light)',
            marginBottom: '20px'
          }}>
            <h1 style={{ 
              fontSize: '24px', 
              fontWeight: '600', 
              color: 'var(--text-primary)',
              textAlign: 'center'
            }}>
              💬 GroupGPT
            </h1>
          </header>
          <main style={{ flex: 1 }}>
            {children}
          </main>
        </div>
      </body>
    </html>
  );
}
