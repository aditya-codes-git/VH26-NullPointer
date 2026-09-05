import React, { useState } from 'react';
import { useTheme } from '../../context/ThemeContext.js';
import { Sun, Moon, Menu, X, ArrowRight, User as UserIcon } from 'lucide-react';
import { User } from '@supabase/supabase-js';

interface LandingNavbarProps {
  user: User | null;
  authLoading: boolean;
  onSignIn: () => void;
  onAccount: () => void;
  onGetStarted: () => void;
  onViewDemo: () => void;
}

export const LandingNavbar: React.FC<LandingNavbarProps> = ({
  user,
  authLoading,
  onSignIn,
  onAccount,
  onGetStarted,
  onViewDemo,
}) => {
  const { theme, toggleTheme } = useTheme();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 bg-white/90 dark:bg-[#080a0d]/90 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 transition-colors duration-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16 sm:h-20">
          {/* Logo */}
          <div className="flex items-center gap-3">
            <a href="/" className="flex items-center gap-2 group" aria-label="AdaptiFlow Home">
              <img
                src="/assets/full_logo.png"
                alt="AdaptiFlow"
                className="h-10 sm:h-12 w-auto object-contain rounded-xl bg-white p-1 shadow-2xs border border-slate-200/60 dark:border-slate-800 transition-transform group-hover:scale-[1.02]"
              />
            </a>
          </div>

          {/* Desktop Nav Links */}
          <div className="hidden md:flex items-center gap-8 text-sm font-medium text-slate-600 dark:text-slate-300">
            <a
              href="#product"
              className="hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
            >
              Product
            </a>
            <a
              href="#how-it-works"
              className="hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
            >
              How It Works
            </a>
            <a
              href="#features"
              className="hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
            >
              Features
            </a>
            <a
              href="#use-cases"
              className="hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
            >
              Use Cases
            </a>
            <a
              href="#pricing"
              className="hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
            >
              Pricing
            </a>
          </div>

          {/* Right Action Buttons */}
          <div className="hidden md:flex items-center gap-3">
            {/* Theme Toggle */}
            <button
              onClick={toggleTheme}
              className="p-2 rounded-lg text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors border border-transparent hover:border-slate-200 dark:hover:border-slate-700"
              aria-label="Toggle theme"
              title={`Switch to ${theme === 'light' ? 'Dark' : 'Light'} Mode`}
            >
              {theme === 'light' ? (
                <Moon className="w-4 h-4 text-slate-700" />
              ) : (
                <Sun className="w-4 h-4 text-amber-400" />
              )}
            </button>

            {/* Auth Button: Sign In vs Account */}
            {authLoading ? (
              <div className="w-16 h-8 bg-slate-100 dark:bg-slate-800 rounded-lg animate-pulse" />
            ) : user ? (
              <button
                onClick={onAccount}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-slate-700 dark:text-slate-200 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors border border-slate-200/80 dark:border-slate-800"
                title={`Signed in as ${user.email}`}
              >
                <UserIcon className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                <span>Account</span>
              </button>
            ) : (
              <button
                onClick={onSignIn}
                className="px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-200 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
              >
                Sign In
              </button>
            )}

            {/* Live Demo */}
            <button
              onClick={onViewDemo}
              className="px-3.5 py-2 text-sm font-medium text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/40 rounded-lg border border-blue-200 dark:border-blue-800/50 transition-colors"
            >
              Live Demo
            </button>

            {/* Get Started CTA */}
            <button
              onClick={onGetStarted}
              className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-sm shadow-blue-600/20 hover:shadow-md hover:shadow-blue-600/30 transition-all active:scale-[0.98]"
            >
              <span>Get Started</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Mobile Hamburger Toggle */}
          <div className="flex md:hidden items-center gap-2">
            <button
              onClick={toggleTheme}
              className="p-2 rounded-lg text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
              aria-label="Toggle theme"
            >
              {theme === 'light' ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4 text-amber-400" />}
            </button>
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="p-2 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
              aria-label="Open menu"
            >
              {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Drawer */}
      {mobileMenuOpen && (
        <div className="md:hidden px-4 pt-2 pb-6 bg-white dark:bg-[#0d1117] border-b border-slate-200 dark:border-slate-800 space-y-3 shadow-xl">
          <div className="flex flex-col space-y-2 py-2">
            <a
              href="#product"
              onClick={() => setMobileMenuOpen(false)}
              className="px-3 py-2 rounded-md text-base font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              Product
            </a>
            <a
              href="#how-it-works"
              onClick={() => setMobileMenuOpen(false)}
              className="px-3 py-2 rounded-md text-base font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              How It Works
            </a>
            <a
              href="#features"
              onClick={() => setMobileMenuOpen(false)}
              className="px-3 py-2 rounded-md text-base font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              Features
            </a>
            <a
              href="#use-cases"
              onClick={() => setMobileMenuOpen(false)}
              className="px-3 py-2 rounded-md text-base font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              Use Cases
            </a>
            <a
              href="#pricing"
              onClick={() => setMobileMenuOpen(false)}
              className="px-3 py-2 rounded-md text-base font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              Pricing
            </a>
          </div>
          <div className="pt-3 border-t border-slate-200 dark:border-slate-800 flex flex-col gap-2.5">
            {authLoading ? (
              <div className="w-full h-10 bg-slate-100 dark:bg-slate-800 rounded-lg animate-pulse" />
            ) : user ? (
              <button
                onClick={() => {
                  setMobileMenuOpen(false);
                  onAccount();
                }}
                className="w-full py-2.5 text-center text-sm font-medium text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 rounded-lg flex items-center justify-center gap-2"
              >
                <UserIcon className="w-4 h-4 text-blue-600" />
                <span>Account ({user.email?.split('@')[0]})</span>
              </button>
            ) : (
              <button
                onClick={() => {
                  setMobileMenuOpen(false);
                  onSignIn();
                }}
                className="w-full py-2.5 text-center text-sm font-medium text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 rounded-lg"
              >
                Sign In
              </button>
            )}
            <button
              onClick={() => {
                setMobileMenuOpen(false);
                onViewDemo();
              }}
              className="w-full py-2.5 text-center text-sm font-medium text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-800 rounded-lg"
            >
              View Live Demo
            </button>
            <button
              onClick={() => {
                setMobileMenuOpen(false);
                onGetStarted();
              }}
              className="w-full py-2.5 text-center text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-sm"
            >
              Get Started
            </button>
          </div>
        </div>
      )}
    </nav>
  );
};
