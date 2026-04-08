import type { Metadata } from 'next';
import './globals.css';
import { BudgetProvider } from '@/lib/BudgetContext';
import AppShell from '@/components/AppShell';

export const metadata: Metadata = {
  title: 'myBudget',
  description: 'Personal budgeting app',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <BudgetProvider>
          <AppShell>{children}</AppShell>
        </BudgetProvider>
      </body>
    </html>
  );
}
